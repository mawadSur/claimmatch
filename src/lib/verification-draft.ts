/**
 * Draft verified fields from an official claim / notice page. Heuristic
 * extraction always runs. When Anthropic is configured, its structured output
 * is preferred for fields that include a verbatim quote found in the page.
 * Drafts never stamp lawsuits.verified_at.
 */
import { KNOWN_ADMINISTRATORS } from '@/lib/administrators/registry';
import { classifyHeldSiteBody } from '@/lib/held-closure-triage';
import { PROOF_VERIFIED_VALUES, isProofVerified, type ProofVerified } from '@/lib/verified-fields';
import { isDeadlinePassed } from '@/lib/utils';

export const VERIFY_ASSIST_QUOTE_LIMIT = 280;
export const VERIFY_ASSIST_BODY_LIMIT = 64_000;
export const VERIFY_ASSIST_EXTRACTOR_HEURISTIC = 'heuristic';
export const VERIFY_ASSIST_EXTRACTOR_ANTHROPIC = 'anthropic';

export const VERIFY_ASSIST_FIELD_KEYS = [
  'deadline',
  'claims_status',
  'eligibility_verified',
  'proof_verified',
  'administrator',
] as const;

export type VerifyAssistFieldKey = (typeof VERIFY_ASSIST_FIELD_KEYS)[number];
export type VerifyAssistClaimsStatus = 'open' | 'closed' | 'unknown';
export type VerifyAssistExtractor = 'heuristic' | 'anthropic';

export interface VerifyAssistEvidence {
  quote: string;
  source_url: string;
}

export type VerifyAssistEvidenceMap = Partial<Record<VerifyAssistFieldKey, VerifyAssistEvidence>>;

export interface VerifyAssistExtraction {
  deadline: string | null;
  claims_status: VerifyAssistClaimsStatus;
  eligibility_verified: string | null;
  proof_verified: ProofVerified | null;
  administrator: string | null;
  evidence: VerifyAssistEvidenceMap;
  extractor: VerifyAssistExtractor;
}

const MONTHS: Record<string, string> = {
  january: '01',
  jan: '01',
  february: '02',
  feb: '02',
  march: '03',
  mar: '03',
  april: '04',
  apr: '04',
  may: '05',
  june: '06',
  jun: '06',
  july: '07',
  jul: '07',
  august: '08',
  aug: '08',
  september: '09',
  sept: '09',
  sep: '09',
  october: '10',
  oct: '10',
  november: '11',
  nov: '11',
  december: '12',
  dec: '12',
};

const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

const NAMED_DATE = new RegExp(
  `\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
  'gi',
);
const ISO_DATE = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
const US_DATE = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g;

const DEADLINE_HINT =
  /\b(claim(?:s)?\s+(?:deadline|period|filing deadline)|deadline(?:\s+to\s+(?:file|submit|claim))?|must be (?:postmarked|submitted|filed|received)|file (?:a |your )?claim by|submit (?:a |your )?claim by|claims? (?:must|will) (?:be )?(?:filed|submitted|postmarked)|postmarked by)\b/i;
const HEARING_HINT = /\b(hearing|final approval|fairness hearing|final fairness)\b/i;

const PROOF_YES =
  /\b(proof of purchase|proof of (?:ownership|buy|bought)|receipts? required|documentation (?:is |are )?required|must (?:submit|provide|attach) (?:proof|receipts?|documents?))\b/i;
const PROOF_NO =
  /\b(no proof(?: of purchase)? required|no documentation required|without proof of purchase|need not (?:submit|provide) (?:proof|receipts?|documents?))\b/i;
const PROOF_OPTIONAL =
  /\b((?:proof(?: of purchase)?|documentation|receipts?) (?:is |are )?optional|may (?:submit|provide|attach) (?:proof|receipts?|documents?)|optional proof)\b/i;

const WHO_HINT =
  /\b(who (?:is|are) (?:included|eligible)|you may be (?:eligible|included)|class members?(?: include)?|to be eligible|who qualifies)\b/i;

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, VERIFY_ASSIST_BODY_LIMIT);
}

export function quoteAround(text: string, index: number, length: number, sourceUrl: string): VerifyAssistEvidence {
  const pad = 80;
  const start = Math.max(0, index - pad);
  const end = Math.min(text.length, index + length + pad);
  let quote = text.slice(start, end).trim();
  if (start > 0) quote = `…${quote}`;
  if (end < text.length) quote = `${quote}…`;
  if (quote.length > VERIFY_ASSIST_QUOTE_LIMIT) {
    quote = `${quote.slice(0, VERIFY_ASSIST_QUOTE_LIMIT - 1)}…`;
  }
  return { quote, source_url: sourceUrl };
}

export function quoteIsVerbatim(quote: string, text: string): boolean {
  const needle = quote.replace(/[….]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (needle.length < 8) return false;
  const hay = text.replace(/\s+/g, ' ').toLowerCase();
  const fragment = needle.slice(0, Math.min(needle.length, 80));
  return hay.includes(fragment);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function ymd(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function contextWindow(text: string, index: number, span = 140): string {
  return text.slice(Math.max(0, index - span), Math.min(text.length, index + span));
}

interface DatedHit {
  iso: string;
  index: number;
  length: number;
}

function collectDates(text: string): DatedHit[] {
  const hits: DatedHit[] = [];
  const named = new RegExp(NAMED_DATE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = named.exec(text)) !== null) {
    const month = MONTHS[match[1].toLowerCase().replace(/\.$/, '')];
    const iso = month ? ymd(Number(match[3]), Number(month), Number(match[2])) : null;
    if (iso) hits.push({ iso, index: match.index, length: match[0].length });
  }
  const isoRe = new RegExp(ISO_DATE.source, 'g');
  while ((match = isoRe.exec(text)) !== null) {
    const iso = ymd(Number(match[1]), Number(match[2]), Number(match[3]));
    if (iso) hits.push({ iso, index: match.index, length: match[0].length });
  }
  const usRe = new RegExp(US_DATE.source, 'g');
  while ((match = usRe.exec(text)) !== null) {
    const iso = ymd(Number(match[3]), Number(match[1]), Number(match[2]));
    if (iso) hits.push({ iso, index: match.index, length: match[0].length });
  }
  return hits;
}

function extractDeadline(text: string, sourceUrl: string): { value: string | null; evidence?: VerifyAssistEvidence } {
  const hits = collectDates(text);
  const deadlineHits = hits.filter((hit) => {
    const ctx = contextWindow(text, hit.index);
    if (HEARING_HINT.test(ctx)) return false;
    return DEADLINE_HINT.test(ctx);
  });
  const chosen = deadlineHits[0] ?? null;
  if (!chosen) return { value: null };
  return {
    value: chosen.iso,
    evidence: quoteAround(text, chosen.index, chosen.length, sourceUrl),
  };
}

function extractClaimsStatus(
  text: string,
  sourceUrl: string,
): { value: VerifyAssistClaimsStatus; evidence?: VerifyAssistEvidence } {
  const classified = classifyHeldSiteBody(text);
  if (classified === 'claims_closed') {
    const match = text.match(
      /claims?\s+(are|is|have been)\s+closed|claim\s+period\s+has\s+(ended|closed|expired)|no longer accepting\s+(claims?|filings?)|this settlement is closed/i,
    );
    return {
      value: 'closed',
      evidence: match
        ? quoteAround(text, match.index ?? 0, match[0].length, sourceUrl)
        : { quote: 'Claims are closed.', source_url: sourceUrl },
    };
  }
  if (classified === 'still_open') {
    const match = text.match(/file (a|your) claim|submit (a|your) claim|claim form|start (a|your) claim/i);
    return {
      value: 'open',
      evidence: match
        ? quoteAround(text, match.index ?? 0, match[0].length, sourceUrl)
        : { quote: 'File a claim.', source_url: sourceUrl },
    };
  }
  return { value: 'unknown' };
}

function extractProof(
  text: string,
  sourceUrl: string,
): { value: ProofVerified | null; evidence?: VerifyAssistEvidence } {
  const optional = text.match(PROOF_OPTIONAL);
  if (optional) {
    return {
      value: 'optional',
      evidence: quoteAround(text, optional.index ?? 0, optional[0].length, sourceUrl),
    };
  }
  const no = text.match(PROOF_NO);
  if (no) {
    return {
      value: 'no',
      evidence: quoteAround(text, no.index ?? 0, no[0].length, sourceUrl),
    };
  }
  const yes = text.match(PROOF_YES);
  if (yes) {
    return {
      value: 'yes',
      evidence: quoteAround(text, yes.index ?? 0, yes[0].length, sourceUrl),
    };
  }
  return { value: null };
}

function extractAdministrator(
  text: string,
  sourceUrl: string,
): { value: string | null; evidence?: VerifyAssistEvidence } {
  const names = [...KNOWN_ADMINISTRATORS.map((row) => row.name), 'Gilardi', 'A.B. Data', 'Strategic Claims'].sort(
    (a, b) => b.length - a.length,
  );
  for (const name of names) {
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const match = text.match(re);
    if (match) {
      const known = KNOWN_ADMINISTRATORS.find((row) => row.name.toLowerCase() === match[0].toLowerCase());
      return {
        value: known?.name ?? match[0],
        evidence: quoteAround(text, match.index ?? 0, match[0].length, sourceUrl),
      };
    }
  }
  const labeled = text.match(
    /\b(?:settlement administrator|claims administrator|administrator)[:\s]+([A-Z][A-Za-z0-9&.,' -]{2,80})/,
  );
  if (labeled) {
    const value = labeled[1].replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/, '');
    if (value.length >= 3) {
      return {
        value,
        evidence: quoteAround(text, labeled.index ?? 0, labeled[0].length, sourceUrl),
      };
    }
  }
  return { value: null };
}

function extractWhoQualifies(
  text: string,
  sourceUrl: string,
): { value: string | null; evidence?: VerifyAssistEvidence } {
  const match = text.match(WHO_HINT);
  if (!match || match.index == null) return { value: null };
  const start = match.index;
  const slice = text.slice(start, start + 420).trim();
  const sentence = slice.split(/(?<=[.!?])\s+/)[0] ?? slice;
  const value = sentence.slice(0, 500).trim();
  if (value.length < 12) return { value: null };
  return {
    value,
    evidence: quoteAround(text, start, Math.min(sentence.length, 200), sourceUrl),
  };
}

export function emptyExtraction(extractor: VerifyAssistExtractor = 'heuristic'): VerifyAssistExtraction {
  return {
    deadline: null,
    claims_status: 'unknown',
    eligibility_verified: null,
    proof_verified: null,
    administrator: null,
    evidence: {},
    extractor,
  };
}

/** Deterministic extraction from page text. Unknown when the page does not say. */
export function extractVerificationDraftHeuristic(pageText: string, sourceUrl: string): VerifyAssistExtraction {
  const text = pageText.slice(0, VERIFY_ASSIST_BODY_LIMIT);
  const claims = extractClaimsStatus(text, sourceUrl);
  const deadline = extractDeadline(text, sourceUrl);
  const proof = extractProof(text, sourceUrl);
  const administrator = extractAdministrator(text, sourceUrl);
  const who = extractWhoQualifies(text, sourceUrl);
  const evidence: VerifyAssistEvidenceMap = {};
  if (deadline.evidence) evidence.deadline = deadline.evidence;
  if (claims.evidence) evidence.claims_status = claims.evidence;
  if (who.evidence) evidence.eligibility_verified = who.evidence;
  if (proof.evidence) evidence.proof_verified = proof.evidence;
  if (administrator.evidence) evidence.administrator = administrator.evidence;
  return {
    deadline: deadline.value,
    claims_status: claims.value,
    eligibility_verified: who.value,
    proof_verified: proof.value,
    administrator: administrator.value,
    evidence,
    extractor: 'heuristic',
  };
}

export interface LlmVerificationDraft {
  deadline?: string | null;
  claims_status?: string | null;
  eligibility_verified?: string | null;
  proof_verified?: string | null;
  administrator?: string | null;
  evidence?: Partial<Record<string, { quote?: string | null; source_url?: string | null } | null>>;
}

function keepQuotedField<T>(
  value: T | null | undefined,
  evidence: VerifyAssistEvidence | undefined,
  text: string,
): { value: T | null; evidence?: VerifyAssistEvidence } {
  if (value == null || value === '') return { value: null };
  if (!evidence?.quote || !quoteIsVerbatim(evidence.quote, text)) {
    return { value: null };
  }
  return { value, evidence };
}

/** Drop LLM fields whose quote is missing or not found in the page text. */
export function sanitizeLlmExtraction(
  raw: LlmVerificationDraft,
  pageText: string,
  sourceUrl: string,
): VerifyAssistExtraction {
  const text = pageText.slice(0, VERIFY_ASSIST_BODY_LIMIT);
  const evidenceIn = raw.evidence ?? {};
  function ev(key: string): VerifyAssistEvidence | undefined {
    const row = evidenceIn[key];
    const quote = typeof row?.quote === 'string' ? row.quote.trim() : '';
    if (!quote) return undefined;
    return {
      quote: quote.slice(0, VERIFY_ASSIST_QUOTE_LIMIT),
      source_url: typeof row?.source_url === 'string' && row.source_url.trim() ? row.source_url.trim() : sourceUrl,
    };
  }

  const claimsRaw = raw.claims_status;
  const claimsValue: VerifyAssistClaimsStatus =
    claimsRaw === 'open' || claimsRaw === 'closed' || claimsRaw === 'unknown' ? claimsRaw : 'unknown';
  const claims = keepQuotedField(claimsValue === 'unknown' ? null : claimsValue, ev('claims_status'), text);

  const deadlineIso =
    typeof raw.deadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.deadline) ? raw.deadline : null;
  const deadline = keepQuotedField(deadlineIso, ev('deadline'), text);

  const who =
    typeof raw.eligibility_verified === 'string' && raw.eligibility_verified.trim()
      ? keepQuotedField(raw.eligibility_verified.trim().slice(0, 2000), ev('eligibility_verified'), text)
      : { value: null };

  const proofRaw = raw.proof_verified;
  const proofValue = isProofVerified(proofRaw) ? proofRaw : null;
  const proof = keepQuotedField(proofValue, ev('proof_verified'), text);

  const admin =
    typeof raw.administrator === 'string' && raw.administrator.trim()
      ? keepQuotedField(raw.administrator.trim().slice(0, 200), ev('administrator'), text)
      : { value: null };

  const evidence: VerifyAssistEvidenceMap = {};
  if (deadline.evidence) evidence.deadline = deadline.evidence;
  if (claims.evidence) evidence.claims_status = claims.evidence;
  if (who.evidence) evidence.eligibility_verified = who.evidence;
  if (proof.evidence) evidence.proof_verified = proof.evidence;
  if (admin.evidence) evidence.administrator = admin.evidence;

  return {
    deadline: deadline.value,
    claims_status: claims.value ?? 'unknown',
    eligibility_verified: who.value,
    proof_verified: proof.value,
    administrator: admin.value,
    evidence,
    extractor: 'anthropic',
  };
}

export function mergeExtractions(
  llm: VerifyAssistExtraction | null,
  heuristic: VerifyAssistExtraction,
): VerifyAssistExtraction {
  if (!llm) return heuristic;
  const evidence: VerifyAssistEvidenceMap = { ...heuristic.evidence };
  const out: VerifyAssistExtraction = {
    deadline: heuristic.deadline,
    claims_status: heuristic.claims_status,
    eligibility_verified: heuristic.eligibility_verified,
    proof_verified: heuristic.proof_verified,
    administrator: heuristic.administrator,
    evidence,
    extractor: 'heuristic',
  };
  let usedLlm = false;
  if (llm.deadline) {
    out.deadline = llm.deadline;
    if (llm.evidence.deadline) evidence.deadline = llm.evidence.deadline;
    usedLlm = true;
  }
  if (llm.claims_status !== 'unknown') {
    out.claims_status = llm.claims_status;
    if (llm.evidence.claims_status) evidence.claims_status = llm.evidence.claims_status;
    usedLlm = true;
  }
  if (llm.eligibility_verified) {
    out.eligibility_verified = llm.eligibility_verified;
    if (llm.evidence.eligibility_verified) evidence.eligibility_verified = llm.evidence.eligibility_verified;
    usedLlm = true;
  }
  if (llm.proof_verified) {
    out.proof_verified = llm.proof_verified;
    if (llm.evidence.proof_verified) evidence.proof_verified = llm.evidence.proof_verified;
    usedLlm = true;
  }
  if (llm.administrator) {
    out.administrator = llm.administrator;
    if (llm.evidence.administrator) evidence.administrator = llm.evidence.administrator;
    usedLlm = true;
  }
  if (usedLlm) out.extractor = 'anthropic';
  return out;
}

export function draftSuggestsClosed(draft: {
  claims_status: VerifyAssistClaimsStatus | null | undefined;
  evidence?: VerifyAssistEvidenceMap | null;
}): boolean {
  return draft.claims_status === 'closed' && Boolean(draft.evidence?.claims_status?.quote?.trim());
}

export function draftSuggestsOpenFuture(
  draft: {
    claims_status: VerifyAssistClaimsStatus | null | undefined;
    deadline?: string | null;
  },
  now: Date = new Date(),
): boolean {
  if (draft.claims_status !== 'open') return false;
  if (!draft.deadline) return false;
  return !isDeadlinePassed(draft.deadline, now);
}

export { PROOF_VERIFIED_VALUES };
