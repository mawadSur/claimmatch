/**
 * The "What we still need" form: what each packet item looks like as an
 * input, how a typed value becomes an answer, the PATCH body, and where each
 * error belongs. Pure, so tests/filing-ui-model.test.ts covers it. Values are
 * checked lightly here; the server and Jev check them again.
 */
import { ONE_CLICK_COPY } from '@/lib/copy';
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  type AnswerValue,
  type DocumentMime,
  type FilingErrorBody,
  type JevIssueView,
  type PacketItemView,
  type UpdatePacketRequest,
} from '@/lib/filing/v2/contract';

/** What an input holds: text for most types, 'yes' | 'no' | '' for yes_no, option values for multi_choice. */
export type FieldDraft = string | string[];

const COPY = ONE_CLICK_COPY.need;

/** A DOM id for a packet path (stable, so errors can link to it and focus can move to it). */
export function itemDomId(path: string): string {
  return `filing-${path.replace(/[^a-z0-9_]+/gi, '-')}`;
}

/** Jev reads documents as doc_count.<kind>; the packet calls them documents.<kind>. */
export function packetPathOfJevField(field: string | null): string | null {
  if (!field) return null;
  return field.startsWith('doc_count.') ? `documents.${field.slice('doc_count.'.length)}` : field;
}

/** An item the member can type into (not a document, not locked). */
export function isEditable(item: PacketItemView): boolean {
  return item.kind !== 'document' && item.locked === null;
}

/** Profile details already in place go into a short summary; everything else is asked. */
export function splitItems(items: readonly PacketItemView[]): { profile: PacketItemView[]; ask: PacketItemView[] } {
  const profile: PacketItemView[] = [];
  const ask: PacketItemView[] = [];
  for (const item of items) {
    const settled = item.kind === 'member' && !item.missing && item.issues.length === 0 && item.locked === null;
    (settled ? profile : ask).push(item);
  }
  return { profile, ask };
}

/** The input's starting value from the packet. */
export function draftFromValue(item: PacketItemView): FieldDraft {
  const value = item.value;
  if (item.type === 'multi_choice') return Array.isArray(value) ? [...value] : [];
  if (item.type === 'yes_no') return value === true ? 'yes' : value === false ? 'no' : '';
  if (value === null || value === undefined || Array.isArray(value)) return '';
  return String(value);
}

export function draftsFromItems(items: readonly PacketItemView[]): Record<string, FieldDraft> {
  return Object.fromEntries(items.filter((i) => i.kind !== 'document').map((i) => [i.path, draftFromValue(i)]));
}

function sameDraft(a: FieldDraft, b: FieldDraft): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = Array.isArray(a) ? [...a].sort() : [];
    const y = Array.isArray(b) ? [...b].sort() : [];
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return a.trim() === b.trim();
}

/** How a value reads in the review list and the copy panel. */
export function displayValue(item: PacketItemView): string {
  const value = item.value;
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0) || value === '') return COPY.empty;
  const label = (v: string) => item.options?.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map(label).join(', ');
  if (typeof value === 'boolean') return value ? COPY.yes : COPY.no;
  if (item.type === 'money') return `$${value}`;
  if (item.options) return label(String(value));
  return String(value);
}

type Parsed = { ok: true; value: AnswerValue } | { ok: false; error: string };

/** A typed value as the answer the API takes (empty clears it). */
export function parseDraft(item: PacketItemView, draft: FieldDraft): Parsed {
  if (item.type === 'multi_choice') {
    const values = (Array.isArray(draft) ? draft : []).filter(Boolean);
    return { ok: true, value: values.length ? [...new Set(values)].sort() : null };
  }
  const raw = (Array.isArray(draft) ? '' : draft).trim();
  if (raw === '') return { ok: true, value: null };
  switch (item.type) {
    case 'yes_no':
      return { ok: true, value: raw === 'yes' };
    case 'integer':
      return /^-?\d{1,15}$/.test(raw) ? { ok: true, value: Number(raw) } : { ok: false, error: COPY.invalidWhole };
    case 'decimal':
      return /^-?\d{1,15}(?:\.\d{1,6})?$/.test(raw) ? { ok: true, value: Number(raw) } : { ok: false, error: COPY.invalidNumber };
    case 'money': {
      const amount = raw.replace(/^\$\s*/, '').replace(/,/g, '');
      const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(amount);
      if (!match) return { ok: false, error: COPY.invalidMoney };
      return { ok: true, value: `${match[1]}.${(match[2] ?? '').padEnd(2, '0')}` };
    }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? { ok: true, value: raw } : { ok: false, error: COPY.invalidEmail };
    case 'zip':
      return /^\d{5}(?:-\d{4})?$/.test(raw) ? { ok: true, value: raw } : { ok: false, error: COPY.invalidZip };
    case 'us_state':
      return { ok: true, value: raw.toUpperCase() };
    case 'vin':
      return { ok: true, value: raw.toUpperCase().replace(/\s+/g, '') };
    default:
      return { ok: true, value: raw };
  }
}

type MemberPatch = NonNullable<UpdatePacketRequest['member']>;
type AddressKey = 'line1' | 'line2' | 'city' | 'state' | 'zip';

function setMember(member: MemberPatch, path: string, value: AnswerValue): void {
  const text = typeof value === 'string' ? value : null;
  const field = path.slice('member.'.length);
  if (field.startsWith('address.')) {
    const key = field.slice('address.'.length) as AddressKey;
    member.address = { ...member.address, [key]: text };
    return;
  }
  (member as Record<string, string | null>)[field] = text;
}

/** A PATCH body without the revision (the caller adds the revision it last saw). */
export type PacketPatch = Omit<UpdatePacketRequest, 'revision'>;

export type PatchResult = { ok: true; body: PacketPatch; changed: string[] } | { ok: false; errors: Record<string, string> };

/** The PATCH body: only what the member changed, plus the profile save when they ticked it. */
export function buildPacketPatch(args: {
  items: readonly PacketItemView[];
  drafts: Readonly<Record<string, FieldDraft>>;
  saveToProfile: boolean;
}): PatchResult {
  const errors: Record<string, string> = {};
  const answers: Record<string, AnswerValue> = {};
  const member: MemberPatch = {};
  const body: PacketPatch = {};
  const changed: string[] = [];
  for (const item of args.items) {
    if (!isEditable(item) || !(item.path in args.drafts)) continue;
    const draft = args.drafts[item.path];
    if (sameDraft(draft, draftFromValue(item))) continue;
    const parsed = parseDraft(item, draft);
    if (!parsed.ok) {
      errors[item.path] = parsed.error;
      continue;
    }
    changed.push(item.path);
    if (item.path.startsWith('answers.')) answers[item.path.slice('answers.'.length)] = parsed.value;
    else if (item.path.startsWith('member.')) setMember(member, item.path, parsed.value);
    else if (item.path === 'benefit_tier' || item.path === 'payout_method') {
      body[item.path] = typeof parsed.value === 'string' ? parsed.value : null;
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  if (Object.keys(answers).length > 0) body.answers = answers;
  if (Object.keys(member).length > 0) body.member = member;
  if (args.saveToProfile) body.save_member_to_profile = true;
  return { ok: true, body, changed };
}

export interface FieldErrors {
  byPath: Record<string, string>;
  general: string[];
}

/** Puts each server error next to its field; the rest show above the form. */
export function errorsByField(error: FilingErrorBody | null, items: readonly PacketItemView[]): FieldErrors {
  const out: FieldErrors = { byPath: {}, general: [] };
  if (!error) return out;
  const paths = new Set(items.map((i) => i.path));
  const place = (path: string | null, message: string) => {
    if (path && paths.has(path) && !out.byPath[path]) out.byPath[path] = message;
    else if (!out.general.includes(message)) out.general.push(message);
  };
  for (const field of error.fields ?? []) place(field.path, field.message);
  for (const issue of error.issues ?? []) place(packetPathOfJevField(issue.field), issue.message);
  if (!error.fields?.length && !error.issues?.length) out.general.push(error.error);
  return out;
}

/** The first item with an error, in the official order (focus moves there). */
export function firstErrorPath(items: readonly PacketItemView[], errors: Readonly<Record<string, string>>): string | null {
  return items.find((item) => errors[item.path])?.path ?? null;
}

/** Issues of the last Jev run that belong to no item (shown above the form). */
export function unplacedIssues(issues: readonly JevIssueView[], items: readonly PacketItemView[]): JevIssueView[] {
  const paths = new Set(items.map((i) => i.path));
  return issues.filter((issue) => {
    const path = packetPathOfJevField(issue.field);
    return !path || !paths.has(path);
  });
}

const EXTENSION_MIME: Record<string, DocumentMime> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

/** The file's type, from the browser or (HEIC on some phones reports none) its extension. */
export function guessMime(file: { type: string; name: string }): DocumentMime | null {
  const type = file.type.toLowerCase();
  if ((DOCUMENT_MIME_TYPES as readonly string[]).includes(type)) return type as DocumentMime;
  if (type && type !== 'application/octet-stream') return null;
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
  return EXTENSION_MIME[ext] ?? null;
}

/** Why a chosen file can't be used, before anything is uploaded; null when it can. */
export function fileProblem(
  file: { size: number; type: string; name: string },
  accepted: readonly DocumentMime[],
): string | null {
  const mime = guessMime(file);
  if (!mime || !accepted.includes(mime)) return ONE_CLICK_COPY.docs.wrongType;
  if (file.size < 1 || file.size > DOCUMENT_MAX_BYTES) return ONE_CLICK_COPY.docs.tooBig;
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The accept attribute: the item's types plus the extensions phones use for HEIC. */
export function acceptAttribute(accepted: readonly DocumentMime[]): string {
  const extensions = Object.entries(EXTENSION_MIME)
    .filter(([, mime]) => accepted.includes(mime))
    .map(([ext]) => `.${ext}`);
  return [...accepted, ...extensions].join(',');
}

/** The browser autocomplete hint for member fields. */
export const MEMBER_AUTOCOMPLETE: Readonly<Record<string, string>> = {
  'member.legal_name': 'name',
  'member.first_name': 'given-name',
  'member.last_name': 'family-name',
  'member.email': 'email',
  'member.phone': 'tel',
  'member.address.line1': 'address-line1',
  'member.address.line2': 'address-line2',
  'member.address.city': 'address-level2',
  'member.address.state': 'address-level1',
  'member.address.zip': 'postal-code',
};
