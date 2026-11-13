import Anthropic from '@anthropic-ai/sdk';
import type { ExtractedLawsuit } from './types';
import { LAWSUIT_CATEGORIES } from './types';

/**
 * LLM extraction pipeline. Turns unstructured settlement text (scraped from an
 * administrator site or aggregator) into a structured, machine-readable
 * ClaimMatch lawsuit record with a confidence score, using Claude Opus 4.8 with
 * adaptive thinking and a strict JSON schema (structured outputs).
 *
 * Degrades gracefully: if ANTHROPIC_API_KEY is unset it returns null so the
 * scraper falls back to whatever structured fields the adapter already produced.
 */

export function anthropicConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

// JSON schema the model must satisfy (structured outputs / output_config.format).
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
        states: { type: 'array', items: { type: 'string' } },
        requires: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
      },
      required: ['states', 'requires', 'notes'],
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

const SYSTEM = `You are ClaimMatch's settlement data analyst. You read raw text from
class-action settlement pages and extract a single, accurate, structured record.
Rules:
- Only extract real, currently-open class-action settlements. If the text is not
  about a specific open settlement, set confidence below 0.3.
- eligibility.requires must use these attribute keys where applicable:
  had_data_breach, owns_vehicle, used_banking, bought_consumer_goods,
  uses_social_media, used_streaming, employed_hourly, took_medication.
- eligibility.states are US 2-letter codes; empty array means nationwide.
- deadline must be YYYY-MM-DD or null. Never invent a deadline.
- Be conservative with confidence: partial or ambiguous pages score low.`;

/**
 * Extract one structured settlement from raw text. Returns null when the LLM is
 * not configured or the call fails (caller should fall back).
 */
export async function extractLawsuit(rawText: string): Promise<ExtractedLawsuit | null> {
  if (!anthropicConfigured()) return null;
  const input = rawText.slice(0, 60_000); // keep prompt bounded

  try {
    // Cast the request: `output_config` (structured outputs) and adaptive
    // thinking are newer than some installed SDK typings; the runtime shape is
    // per the current Claude API.
    const params = {
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: EXTRACTION_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: `Extract the settlement record from this page text:\n\n${input}`,
        },
      ],
    };
    const res: any = await (client().messages.create as any)(params);

    const textBlock = (res.content as any[]).find((b) => b?.type === 'text');
    if (!textBlock?.text) return null;
    const parsed = JSON.parse(textBlock.text) as ExtractedLawsuit;
    return parsed;
  } catch (err) {
    console.error('[anthropic] extractLawsuit failed:', err);
    return null;
  }
}

const evidenceQuoteSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  properties: {
    quote: { type: 'string' },
    source_url: { type: 'string' },
  },
  required: ['quote', 'source_url'],
} as const;

const VERIFY_ASSIST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    deadline: { type: ['string', 'null'], description: 'Claim filing deadline as YYYY-MM-DD, or null if not stated. Never invent.' },
    claims_status: { type: 'string', enum: ['open', 'closed', 'unknown'] },
    eligibility_verified: { type: ['string', 'null'], description: 'Who qualifies, in the notice\'s own words. Null if not stated.' },
    proof_verified: { type: ['string', 'null'], description: 'yes, no, optional, unknown, or null' },
    administrator: { type: ['string', 'null'], description: 'Settlement administrator if named.' },
    evidence: {
      type: 'object',
      additionalProperties: false,
      properties: {
        deadline: evidenceQuoteSchema,
        claims_status: evidenceQuoteSchema,
        eligibility_verified: evidenceQuoteSchema,
        proof_verified: evidenceQuoteSchema,
        administrator: evidenceQuoteSchema,
      },
      required: ['deadline', 'claims_status', 'eligibility_verified', 'proof_verified', 'administrator'],
    },
  },
  required: ['deadline', 'claims_status', 'eligibility_verified', 'proof_verified', 'administrator', 'evidence'],
} as const;

const VERIFY_ASSIST_SYSTEM = `You extract claim-deadline facts from an official class-action notice or claim site.
Rules:
- Use only words on the page. Never invent a deadline, administrator, or class definition.
- Each filled field MUST include a short verbatim quote from the page (evidence.<field>.quote).
- deadline is YYYY-MM-DD or null. Do not use a hearing date as the claim deadline.
- claims_status is closed only when the page says claims are closed or the claim period has ended.
- proof_verified is yes / no / optional / unknown (not a boolean).
- Leave a field null / unknown when the page does not say.`;

export interface AnthropicVerificationDraft {
  deadline: string | null;
  claims_status: 'open' | 'closed' | 'unknown';
  eligibility_verified: string | null;
  proof_verified: 'yes' | 'no' | 'optional' | 'unknown' | null;
  administrator: string | null;
  evidence: Record<string, { quote: string; source_url: string } | null>;
}

/**
 * Draft verified fields from official-page text. Returns null when the LLM is
 * not configured or the call fails (caller falls back to heuristics).
 */
export async function extractVerificationDraft(
  pageText: string,
  sourceUrl: string,
): Promise<AnthropicVerificationDraft | null> {
  if (!anthropicConfigured()) return null;
  const input = pageText.slice(0, 60_000);

  try {
    const params = {
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      thinking: { type: 'adaptive' },
      system: VERIFY_ASSIST_SYSTEM,
      output_config: { format: { type: 'json_schema', schema: VERIFY_ASSIST_SCHEMA } },
      messages: [
        {
          role: 'user',
          content: `Source URL: ${sourceUrl}\n\nExtract verification fields from this page text:\n\n${input}`,
        },
      ],
    };
    const res: any = await (client().messages.create as any)(params);
    const textBlock = (res.content as any[]).find((b) => b?.type === 'text');
    if (!textBlock?.text) return null;
    return JSON.parse(textBlock.text) as AnthropicVerificationDraft;
  } catch (err) {
    console.error('[anthropic] extractVerificationDraft failed:', err);
    return null;
  }
}
