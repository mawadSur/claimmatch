import { describe, expect, it } from 'vitest';
import { ONE_CLICK_COPY } from '@/lib/copy';
import { DOCUMENT_MAX_BYTES, UpdatePacketRequestSchema } from '@/lib/filing/v2/contract';
import {
  acceptAttribute,
  buildPacketPatch,
  displayValue,
  draftFromValue,
  draftsFromItems,
  errorsByField,
  fileProblem,
  firstErrorPath,
  formatBytes,
  guessMime,
  itemDomId,
  packetPathOfJevField,
  parseDraft,
  splitItems,
  unplacedIssues,
} from '@/components/filing/packet-form';
import { defaultItems, issue, item } from './filing-ui-fixtures';

const COPY = ONE_CLICK_COPY.need;

describe('items', () => {
  it('summarizes profile details already in place and asks for the rest, in the official order', () => {
    const { profile, ask } = splitItems(defaultItems());
    expect(profile.map((i) => i.path)).toEqual([
      'member.legal_name',
      'member.email',
      'member.address.line1',
      'member.address.city',
      'member.address.state',
    ]);
    expect(ask.map((i) => i.path)).toEqual([
      'member.address.zip',
      'answers.widget_count',
      'answers.bought_online',
      'benefit_tier',
      'payout_method',
      'documents.receipt',
    ]);
  });

  it('makes stable DOM ids and maps Jev fields to packet paths', () => {
    expect(itemDomId('member.address.zip')).toBe('filing-member-address-zip');
    expect(packetPathOfJevField('doc_count.receipt')).toBe('documents.receipt');
    expect(packetPathOfJevField('answers.x')).toBe('answers.x');
    expect(packetPathOfJevField(null)).toBeNull();
  });

  it('shows values as people read them', () => {
    const items = defaultItems();
    expect(displayValue(items[0])).toBe('Ada Lovelace');
    expect(displayValue(items[5])).toBe(COPY.empty);
    expect(displayValue(items[8])).toBe('Tier B: with proof of purchase');
    expect(displayValue(item({ path: 'answers.a', type: 'yes_no', value: false }))).toBe('No');
    expect(displayValue(item({ path: 'answers.m', type: 'money', value: '12.50' }))).toBe('$12.50');
    expect(
      displayValue(item({ path: 'answers.c', type: 'multi_choice', options: [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana' }], value: ['a', 'b'] })),
    ).toBe('Apple, Banana');
  });
});

describe('typed values', () => {
  const parse = (type: Parameters<typeof item>[0]['type'], draft: string | string[]) => parseDraft(item({ path: 'answers.x', type }), draft);

  it('turns input into the answer types the API takes', () => {
    expect(parse('text', '  hello ')).toEqual({ ok: true, value: 'hello' });
    expect(parse('text', '   ')).toEqual({ ok: true, value: null });
    expect(parse('integer', '3')).toEqual({ ok: true, value: 3 });
    expect(parse('integer', '3.5')).toEqual({ ok: false, error: COPY.invalidWhole });
    expect(parse('decimal', '2.25')).toEqual({ ok: true, value: 2.25 });
    expect(parse('decimal', 'two')).toEqual({ ok: false, error: COPY.invalidNumber });
    expect(parse('money', '$1,234.5')).toEqual({ ok: true, value: '1234.50' });
    expect(parse('money', '12')).toEqual({ ok: true, value: '12.00' });
    expect(parse('money', '12.345')).toEqual({ ok: false, error: COPY.invalidMoney });
    expect(parse('yes_no', 'yes')).toEqual({ ok: true, value: true });
    expect(parse('yes_no', 'no')).toEqual({ ok: true, value: false });
    expect(parse('yes_no', '')).toEqual({ ok: true, value: null });
    expect(parse('multi_choice', ['b', 'a', 'b'])).toEqual({ ok: true, value: ['a', 'b'] });
    expect(parse('multi_choice', [])).toEqual({ ok: true, value: null });
    expect(parse('email', 'ada@example')).toEqual({ ok: false, error: COPY.invalidEmail });
    expect(parse('zip', '94110-1234')).toEqual({ ok: true, value: '94110-1234' });
    expect(parse('zip', '9411')).toEqual({ ok: false, error: COPY.invalidZip });
    expect(parse('vin', '1hgcm 82633a004352')).toEqual({ ok: true, value: '1HGCM82633A004352' });
    expect(parse('date', '2024-03-01')).toEqual({ ok: true, value: '2024-03-01' });
  });

  it('starts inputs from the saved values', () => {
    expect(draftFromValue(item({ path: 'answers.a', type: 'yes_no', value: true }))).toBe('yes');
    expect(draftFromValue(item({ path: 'answers.a', type: 'yes_no', value: null }))).toBe('');
    expect(draftFromValue(item({ path: 'answers.a', type: 'integer', value: 4 }))).toBe('4');
    expect(draftFromValue(item({ path: 'answers.a', type: 'multi_choice', value: ['x'] }))).toEqual(['x']);
    expect(Object.keys(draftsFromItems(defaultItems()))).not.toContain('documents.receipt');
  });
});

describe('the PATCH body', () => {
  const items = defaultItems();

  it('sends only what changed, nested the way the contract expects', () => {
    const drafts = {
      ...draftsFromItems(items),
      'member.address.zip': '94110',
      'answers.widget_count': '3',
      'answers.bought_online': 'yes',
      payout_method: 'check',
    };
    const result = buildPacketPatch({ items, drafts, saveToProfile: true });
    expect(result).toEqual({
      ok: true,
      changed: ['member.address.zip', 'answers.widget_count', 'answers.bought_online', 'payout_method'],
      body: {
        answers: { widget_count: 3, bought_online: true },
        member: { address: { zip: '94110' } },
        payout_method: 'check',
        save_member_to_profile: true,
      },
    });
    if (result.ok) expect(UpdatePacketRequestSchema.safeParse({ revision: 3, ...result.body }).success).toBe(true);
  });

  it('clears an answer with null and leaves locked and document items alone', () => {
    const withValue = items.map((i) => (i.path === 'answers.bought_online' ? { ...i, value: true } : i));
    const locked = withValue.map((i) => (i.path === 'answers.widget_count' ? { ...i, locked: 'health_consent_needed' as const } : i));
    const drafts = { ...draftsFromItems(locked), 'answers.bought_online': '', 'answers.widget_count': '9' };
    expect(buildPacketPatch({ items: locked, drafts, saveToProfile: false })).toEqual({
      ok: true,
      changed: ['answers.bought_online'],
      body: { answers: { bought_online: null } },
    });
  });

  it('returns the errors instead of a body when a value is wrong', () => {
    const drafts = { ...draftsFromItems(items), 'answers.widget_count': 'lots', 'member.address.zip': '12' };
    expect(buildPacketPatch({ items, drafts, saveToProfile: false })).toEqual({
      ok: false,
      errors: { 'member.address.zip': COPY.invalidZip, 'answers.widget_count': COPY.invalidWhole },
    });
  });

  it('sends nothing when nothing changed', () => {
    expect(buildPacketPatch({ items, drafts: draftsFromItems(items), saveToProfile: false })).toEqual({ ok: true, changed: [], body: {} });
  });
});

describe('errors next to their fields', () => {
  const items = defaultItems();

  it('places zod field errors and Jev issues on items; the rest are general', () => {
    const placed = errorsByField(
      {
        error: 'Some answers need attention before you can sign.',
        code: 'jev_blocked',
        fields: [{ path: 'answers.widget_count', message: 'Too big.' }, { path: 'revision', message: 'Required' }],
        issues: [
          issue({ field: 'doc_count.receipt', message: 'Add a receipt.', severity: 'block' }),
          issue({ field: null, message: 'This settlement is closed.', severity: 'block' }),
        ],
      },
      items,
    );
    expect(placed.byPath).toEqual({ 'answers.widget_count': 'Too big.', 'documents.receipt': 'Add a receipt.' });
    expect(placed.general).toEqual(['Required', 'This settlement is closed.']);
    expect(firstErrorPath(items, placed.byPath)).toBe('answers.widget_count');
  });

  it('falls back to the error message', () => {
    expect(errorsByField({ error: 'Too many requests.', code: 'rate_limited' }, items)).toEqual({ byPath: {}, general: ['Too many requests.'] });
    expect(errorsByField(null, items)).toEqual({ byPath: {}, general: [] });
  });

  it('finds Jev issues that belong to no item', () => {
    const loose = unplacedIssues([issue({ field: 'meta.days_to_deadline' }), issue({ field: 'answers.widget_count' }), issue({ field: null })], items);
    expect(loose.map((i) => i.field)).toEqual(['meta.days_to_deadline', null]);
  });
});

describe('files', () => {
  const accepted = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'] as const;

  it('knows HEIC photos from their extension when the phone reports no type', () => {
    expect(guessMime({ type: '', name: 'IMG_0001.HEIC' })).toBe('image/heic');
    expect(guessMime({ type: 'application/octet-stream', name: 'scan.pdf' })).toBe('application/pdf');
    expect(guessMime({ type: 'image/jpeg', name: 'x' })).toBe('image/jpeg');
    expect(guessMime({ type: 'text/plain', name: 'notes.pdf' })).toBeNull();
    expect(guessMime({ type: '', name: 'archive.zip' })).toBeNull();
  });

  it('refuses wrong types and files over 10 MB before uploading', () => {
    expect(fileProblem({ size: 1000, type: 'image/png', name: 'a.png' }, accepted)).toBeNull();
    expect(fileProblem({ size: 1000, type: 'image/webp', name: 'a.webp' }, accepted)).toBe(ONE_CLICK_COPY.docs.wrongType);
    expect(fileProblem({ size: DOCUMENT_MAX_BYTES + 1, type: 'image/png', name: 'a.png' }, accepted)).toBe(ONE_CLICK_COPY.docs.tooBig);
    expect(fileProblem({ size: 0, type: 'image/png', name: 'a.png' }, accepted)).toBe(ONE_CLICK_COPY.docs.tooBig);
  });

  it('builds the accept list and sizes', () => {
    expect(acceptAttribute(['image/heic', 'application/pdf'])).toBe('image/heic,application/pdf,.heic,.pdf');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatBytes(300)).toBe('1 KB');
  });
});
