import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { EligibilityCriteria, ExtractedLawsuit } from './types';
import { LAWSUIT_CATEGORIES } from './types';

/**
 * LLM extraction pipeline. Turns unstructured settlement text (scraped from an
 * administrator site or aggregator) into a structured, machine-readable
 * ClaimMatch lawsuit record with a confidence score, using Claude Opus 4.8 with
 * adaptive thinking and a strict JSON schema (structured outputs).
 *
 * Degrades gracefully: if ANTHROPIC_API_KEY is unset — or the model returns
 * anything we can't parse and re-validate — it returns null so the caller falls
 * back to whatever structured fields the adapter already produced and routes the
 * row to human review instead of auto-publishing.
 */

export function anthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const MODEL = 'claude-opus-4-8';

/**
 * JSON schema the model must satisfy (structured outputs via
 * `output_config.format`). Kept within the strict structured-outputs subset:
 * every object sets `additionalProperties: false`, lists all of its keys in
 * `required`, and expresses "optional" as a nullable type union rather than an
 * absent property. Free-form maps aren't allowed under strict mode, so the
 * `anyOf` matcher hook is modeled as a fixed object whose only key is the
 * `vehicle_brands` attribute (the one anyOf criterion the matcher ships today);
 * see `buildEligibility` for how a null/empty value is dropped before it reaches
 * the matcher.
 */
const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: 'Concise settlement name' },
    summary: { type: 'string', description: '1-2 sentence plain-English card blurb' },
    description: { type: 'string', description: 'Full description of the settlement and who qualifies' },
    category: { type: 'string', enum: LAWSUIT_CATEGORIES as unknown as string[] },
    administrator: { type: ['string', 'null'], description: 'Settlement administrator (e.g. JND, Angeion, Epiq) if named' },
    typical_payout: { type: 'string', description: 'Human payout range like "$25–$150" or "Varies"' },
    estimated_value_min: { type: ['number', 'null'], description: 'Low end per-claimant estimate in USD' },
    estimated_value_max: { type: ['number', 'null'], description: 'High end per-claimant estimate in USD' },
    proof_required: { type: 'boolean' },
    deadline: { type: ['string', 'null'], description: 'Claim deadline as YYYY-MM-DD, or null' },
    eligibility_text: { type: 'string', description: 'Human "who qualifies" summary' },
    eligibility: {
      type: 'object',
      additionalProperties: false,
      properties: {
        states: {
          type: 'array',
          items: { type: 'string' },
          description: 'US 2-letter state codes; empty array means nationwide',
        },
        requires: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Attribute keys the claimant must ALL satisfy. Use only: had_data_breach, ' +
            'owns_vehicle, used_banking, bought_consumer_goods, uses_social_media, ' +
            'used_streaming, employed_hourly, took_medication.',
        },
        anyOf: {
          type: 'object',
          additionalProperties: false,
          properties: {
            vehicle_brands: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description:
                'Covered vehicle brands (Toyota, Honda, Ford, GM, Kia, Hyundai, Tesla, ' +
                'Other) when eligibility depends on owning one of a set of brands; null ' +
                'when the settlement is not vehicle-brand specific.',
            },
          },
          required: ['vehicle_brands'],
          description: 'Soft "match any of these" criteria keyed by attribute.',
        },
        dateRange: {
          type: ['object', 'null'],
          additionalProperties: false,
          properties: {
            from: { type: ['string', 'null'], description: 'Class-period start YYYY-MM-DD or null' },
            to: { type: ['string', 'null'], description: 'Class-period end YYYY-MM-DD or null' },
          },
          required: ['from', 'to'],
          description: 'Purchase/exposure window, or null when there is none.',
        },
        notes: { type: 'string', description: 'Free notes for the matcher / UI' },
      },
      required: ['states', 'requires', 'anyOf', 'dateRange', 'notes'],
    },
    claim_url: { type: ['string', 'null'] },
    confidence: { type: 'number', description: '0..1 confidence the extraction is accurate and this is a real, open settlement' },
  },
  required: [
    'title', 'summary', 'description', 'category', 'administrator', 'typical_payout',
    'estimated_value_min', 'estimated_value_max', 'proof_required', 'deadline',
    'eligibility_text', 'eligibility', 'claim_url', 'confidence',
  ],
} as const;

/**
 * Zod mirror of EXTRACTION_SCHEMA. We re-validate the parsed JSON against this
 * instead of a bare cast, so a partial/garbled response is rejected (→ null →
 * pending_review) rather than silently written to the catalog.
 */
const RawEligibilitySchema = z.object({
  states: z.array(z.string()),
  requires: z.array(z.string()),
  anyOf: z
    .object({ vehicle_brands: z.array(z.string()).nullable() })
    .nullable(),
  dateRange: z
    .object({ from: z.string().nullable(), to: z.string().nullable() })
    .nullable(),
  notes: z.string(),
});

const RawExtractionSchema = z.object({
  title: z.string().min(1),
  summary: z.string(),
  description: z.string(),
  category: z.string(),
  administrator: z.string().nullable(),
  typical_payout: z.string(),
  estimated_value_min: z.number().nullable(),
  estimated_value_max: z.number().nullable(),
  proof_required: z.boolean(),
  deadline: z.string().nullable(),
  eligibility_text: z.string(),
  eligibility: RawEligibilitySchema,
  claim_url: z.string().nullable(),
  confidence: z.number(),
});

type RawExtraction = z.infer<typeof RawExtractionSchema>;

const SYSTEM = `You are ClaimMatch's settlement data analyst. You read raw text from
class-action settlement pages and extract a single, accurate, structured record.
Rules:
- Only extract real, currently-open class-action settlements. If the text is not
  about a specific open settlement, set confidence below 0.3.
- eligibility.requires must use ONLY these attribute keys (all must be true for a
  claimant to qualify): had_data_breach, owns_vehicle, used_banking,
  bought_consumer_goods, uses_social_media, used_streaming, employed_hourly,
  took_medication.
- eligibility.anyOf.vehicle_brands: when eligibility depends on owning one of a
  set of car brands, list the covered brands (from Toyota, Honda, Ford, GM, Kia,
  Hyundai, Tesla, Other). Otherwise set it to null. Do NOT invent brands.
- eligibility.dateRange: set { from, to } (YYYY-MM-DD, either may be null) when the
  settlement covers a purchase/exposure window; otherwise null. Never invent dates.
- eligibility.states are US 2-letter codes; empty array means nationwide.
- deadline must be YYYY-MM-DD or null. Never invent a deadline.
- Be conservative with confidence: partial or ambiguous pages score low.`;

/**
 * Extract one structured settlement from raw text. Returns null when the LLM is
 * not configured, the call fails, or the response can't be parsed and validated.
 */
export async function extractLawsuit(rawText: string): Promise<ExtractedLawsuit | null> {
  if (!anthropicConfigured()) return null;
  const input = rawText.slice(0, 60_000); // keep prompt bounded

  try {
    // `output_config` (effort + structured outputs) and adaptive thinking are
    // newer than some installed SDK typings, so the request is built as a plain
    // object and cast. Runtime shape follows the current Claude Messages API:
    //   - thinking: { type: 'adaptive' }  (Opus 4.8 — budget_tokens is removed)
    //   - output_config.effort: 'low'     (mechanical extraction; keeps thinking
    //                                       cheap so it can't eat the JSON budget)
    //   - output_config.format:           strict json_schema structured output
    // max_tokens is deliberately generous so adaptive thinking + the JSON both
    // fit without truncation (the record is well under 2k tokens).
    const params = {
      model: MODEL,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: EXTRACTION_SCHEMA },
      },
      messages: [
        {
          role: 'user',
          content: `Extract the settlement record from this page text:\n\n${input}`,
        },
      ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res: any = await (client().messages.create as any)(params);

    if (res?.stop_reason === 'refusal') {
      console.error('[anthropic] extractLawsuit refused by safety classifier');
      return null;
    }
    if (res?.stop_reason === 'max_tokens') {
      console.warn('[anthropic] extractLawsuit hit max_tokens; JSON may be truncated');
    }

    const rawObject = extractRawObject(res);
    if (rawObject == null) return null;

    const parsed = RawExtractionSchema.safeParse(rawObject);
    if (!parsed.success) {
      console.error('[anthropic] extractLawsuit failed validation:', parsed.error.issues);
      return null;
    }

    return toExtractedLawsuit(parsed.data);
  } catch (err) {
    console.error('[anthropic] extractLawsuit failed:', err);
    return null;
  }
}

/**
 * Pull the model's JSON object out of a Messages response, tolerant of shape:
 * a tool_use block's parsed input, a pure-JSON text block (the structured-output
 * happy path), or a text block wrapped in ```json fences / surrounding prose.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractRawObject(res: any): unknown | null {
  const blocks: unknown[] = Array.isArray(res?.content) ? res.content : [];

  // 1) A tool_use block already carries a parsed object input.
  for (const b of blocks) {
    const block = b as { type?: string; input?: unknown };
    if (block?.type === 'tool_use' && block.input && typeof block.input === 'object') {
      return block.input;
    }
  }

  // 2) Concatenate text blocks and parse loosely.
  const text = blocks
    .map((b) => b as { type?: string; text?: unknown })
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('')
    .trim();

  return text ? parseJsonLoose(text) : null;
}

/** Best-effort JSON parse: raw, de-fenced, then the widest {...} span. */
function parseJsonLoose(text: string): unknown | null {
  const cleaned = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through to brace extraction
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/** Normalize a validated raw extraction into the app's ExtractedLawsuit shape. */
function toExtractedLawsuit(raw: RawExtraction): ExtractedLawsuit {
  const category = (LAWSUIT_CATEGORIES as readonly string[]).includes(raw.category)
    ? raw.category
    : 'General';

  return {
    title: raw.title,
    summary: raw.summary,
    description: raw.description,
    category,
    administrator: raw.administrator,
    typical_payout: raw.typical_payout,
    estimated_value_min: raw.estimated_value_min,
    estimated_value_max: raw.estimated_value_max,
    proof_required: raw.proof_required,
    deadline: raw.deadline,
    eligibility: buildEligibility(raw.eligibility),
    eligibility_text: raw.eligibility_text,
    claim_url: raw.claim_url,
    confidence: Math.min(1, Math.max(0, raw.confidence)),
  };
}

/**
 * Collapse the strict-schema eligibility (fixed keys, nullable placeholders)
 * into the sparse EligibilityCriteria the matcher expects — dropping empty
 * arrays, null anyOf values (which would otherwise crash the matcher's
 * `allowed.includes`), and empty date ranges.
 */
function buildEligibility(raw: RawExtraction['eligibility']): EligibilityCriteria {
  const out: EligibilityCriteria = {};

  if (raw.states.length > 0) out.states = raw.states;
  if (raw.requires.length > 0) out.requires = raw.requires;

  const brands = raw.anyOf?.vehicle_brands;
  if (brands && brands.length > 0) {
    out.anyOf = { vehicle_brands: brands };
  }

  if (raw.dateRange && (raw.dateRange.from || raw.dateRange.to)) {
    out.dateRange = {};
    if (raw.dateRange.from) out.dateRange.from = raw.dateRange.from;
    if (raw.dateRange.to) out.dateRange.to = raw.dateRange.to;
  }

  if (raw.notes) out.notes = raw.notes;

  return out;
}
