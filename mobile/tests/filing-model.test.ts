import { filing, filingStatus } from '@/copy/filing';
import {
  buildPacketPatch,
  displayValue,
  draftsFromItems,
  errorsByField,
  fileProblem,
  guessMime,
  parseDraft,
  splitItems,
  unplacedIssues,
} from '@/features/filing/form';
import {
  claimNote,
  filingPath,
  filingStatusDisplay,
  isOneClickStatus,
  laneReasonLines,
  laneTiming,
  laneTitle,
  lastDayLine,
  signReadiness,
  timelineRows,
  typedNameMatches,
} from '@/features/filing/model';

import { DESK_LANE, SELF_FILE_LANE, defaultItems, filingView, issue, item, readyView } from './filing-fixtures';

describe('filing model (same decisions as the web filing-model.ts)', () => {
  it('knows the one-click statuses', () => {
    expect(isOneClickStatus('queued')).toBe(true);
    expect(isOneClickStatus('filed_by_claimmatch')).toBe(true);
    expect(isOneClickStatus('self_file')).toBe(false);
    expect(isOneClickStatus(null)).toBe(false);
  });

  it('labels statuses, with the confirmation number once submitted', () => {
    expect(filingStatusDisplay('queued', null)).toEqual({
      label: filingStatus.queuedLabel.text,
      tone: 'brand',
      detail: filingStatus.queuedDetail.text,
    });
    expect(filingStatusDisplay('filed_by_claimmatch', null).label).toBe(filingStatus.filedLabel.text);
    expect(filingStatusDisplay('submitted', 'abc-123').label).toMatch(/^Submitted · #/);
    expect(filingStatusDisplay('needs_you', null).tone).toBe('red');
    expect(filingStatusDisplay('mystery', null)).toEqual({ label: filing.timelineOther.text, tone: 'gray', detail: null });
  });

  it('words the lane: agent title and timing, or the self-file title and reasons', () => {
    expect(laneTitle(DESK_LANE)).toBe(filing.agentTitle.text);
    expect(laneTiming(DESK_LANE)).toMatch(/team member enters your signed claim/);
    expect(lastDayLine(DESK_LANE)).toMatch(/^Sign by .+ so there is time to file it before the deadline\.$/);
    expect(laneTitle(SELF_FILE_LANE)).toBe(filing.selfFileTitle.text);
    expect(laneTiming(SELF_FILE_LANE)).toBeNull();
    expect(laneReasonLines(SELF_FILE_LANE)).toEqual(['Lawsuit AI can’t file claims for this settlement right now.']);
    expect(laneReasonLines(DESK_LANE)).toEqual([]);
  });

  it('picks the status note like the web claim page', () => {
    expect(claimNote({ status: 'queued', lane: SELF_FILE_LANE, offerStart: false })).toBe(filing.agentNote.text);
    expect(claimNote({ status: 'preparing', lane: DESK_LANE, offerStart: false })).toBe(filing.agentNote.text);
    expect(claimNote({ status: 'preparing', lane: SELF_FILE_LANE, offerStart: false })).toBe(filing.selfFileNote.text);
    expect(claimNote({ status: null, lane: null, offerStart: false })).toBe(filing.selfFileNote.text);
  });

  it('places the claim on the status path', () => {
    const path = filingPath('queued');
    expect(path?.map((s) => s.state)).toEqual(['done', 'done', 'done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(filingPath('needs_you')?.[0].state).toBe('current');
    expect(filingPath('submitted')?.at(-1)?.state).toBe('done');
    expect(filingPath('withdrawn')).toBeNull();
  });

  it('reads the timeline as "You" or "Lawsuit AI", in Eastern time', () => {
    const rows = timelineRows([
      { at: '2026-11-12T14:00:00Z', status: 'preparing', from: null, actor: 'you', action: null, confirmation_number: null },
      { at: '2026-11-13T14:00:00Z', status: 'submitted', from: 'filed_by_claimmatch', actor: 'claimmatch', action: null, confirmation_number: 'ab12' },
    ]);
    expect(rows[0]).toMatchObject({ actor: 'You', text: 'Started the claim', confirmation: null });
    expect(rows[0].when).toMatch(/ET$/);
    expect(rows[1]).toMatchObject({ actor: 'Lawsuit AI', text: 'Confirmation number received' });
    expect(rows[1].confirmation).toBeTruthy();
  });

  it('checks the typed name against the legal name', () => {
    expect(typedNameMatches('  ada   LOVELACE ', 'Ada Lovelace')).toBe(true);
    expect(typedNameMatches('Ada', 'Ada Lovelace')).toBe(false);
    expect(typedNameMatches('Ada Lovelace', null)).toBe(false);
  });

  it('gives Jev results before signing', () => {
    const open = signReadiness(filingView());
    expect(open.canSign).toBe(false);
    expect(open.missing.map((i) => i.path)).toContain('member.address.zip');
    expect(signReadiness(readyView()).canSign).toBe(true);
    const blocked = filingView({
      packet: { jev: { mode: 'pre_sign', outcome: 'block', evaluated_at: '2026-11-12T15:00:00Z', issues: [issue({ severity: 'block', message: 'Too many claims.' })] } },
    });
    expect(signReadiness(blocked).blocking.map((i) => i.message)).toEqual(['Too many claims.']);
  });
});

describe('packet form (same rules as the web packet-form.ts)', () => {
  it('splits settled profile details from what is asked', () => {
    const { profile, ask } = splitItems(defaultItems());
    expect(profile.map((i) => i.path)).toContain('member.legal_name');
    expect(ask.map((i) => i.path)).toEqual(expect.arrayContaining(['member.address.zip', 'answers.widget_count', 'documents.receipt']));
  });

  it('parses typed values like the web', () => {
    expect(parseDraft(item({ path: 'answers.n', type: 'integer' }), '12')).toEqual({ ok: true, value: 12 });
    expect(parseDraft(item({ path: 'answers.n', type: 'integer' }), '1.5')).toEqual({ ok: false, error: filing.invalidWhole.text });
    expect(parseDraft(item({ path: 'answers.m', type: 'money' }), '$1,234.5')).toEqual({ ok: true, value: '1234.50' });
    expect(parseDraft(item({ path: 'answers.z', type: 'zip' }), '123')).toEqual({ ok: false, error: filing.invalidZip.text });
    expect(parseDraft(item({ path: 'answers.y', type: 'yes_no' }), 'no')).toEqual({ ok: true, value: false });
    expect(parseDraft(item({ path: 'answers.c', type: 'multi_choice' }), ['b', 'a', 'a'])).toEqual({ ok: true, value: ['a', 'b'] });
  });

  it('sends only what changed, with member details nested', () => {
    const items = defaultItems();
    const drafts = { ...draftsFromItems(items), 'member.address.zip': '94110', 'answers.widget_count': '3' };
    expect(buildPacketPatch({ items, drafts, saveToProfile: true })).toEqual({
      ok: true,
      body: { answers: { widget_count: 3 }, member: { address: { zip: '94110' } }, save_member_to_profile: true },
      changed: ['member.address.zip', 'answers.widget_count'],
    });
    expect(buildPacketPatch({ items, drafts: { ...drafts, 'answers.widget_count': 'many' }, saveToProfile: false })).toEqual({
      ok: false,
      errors: { 'answers.widget_count': filing.invalidWhole.text },
    });
  });

  it('places server errors next to their fields, the rest above the form', () => {
    const items = defaultItems();
    const placed = errorsByField(
      {
        error: 'Fix these.',
        fields: [{ path: 'answers.widget_count', message: 'Too many.' }],
        issues: [issue({ field: 'doc_count.receipt', message: 'Add a photo.' }), issue({ rule_id: 'x', field: null, message: 'General.' })],
      },
      items,
    );
    expect(placed.byPath).toEqual({ 'answers.widget_count': 'Too many.', 'documents.receipt': 'Add a photo.' });
    expect(placed.general).toEqual(['General.']);
    expect(unplacedIssues([issue({ field: 'nowhere' })], items)).toHaveLength(1);
  });

  it('shows values as the review list reads them', () => {
    expect(displayValue(item({ path: 'answers.x' }))).toBe(filing.empty.text);
    expect(displayValue(item({ path: 'answers.m', type: 'money', value: '12.50' }))).toBe('$12.50');
    expect(displayValue(item({ path: 'answers.y', type: 'yes_no', value: true }))).toBe(filing.yes.text);
  });

  it('checks picked files before uploading', () => {
    expect(guessMime({ type: '', name: 'IMG_1.HEIC' })).toBe('image/heic');
    expect(guessMime({ type: 'image/jpg', name: 'x' })).toBe('image/jpeg');
    expect(fileProblem({ size: 100, type: 'image/gif', name: 'a.gif' }, ['image/jpeg'])).toBe(filing.docsWrongType.text);
    expect(fileProblem({ size: 11 * 1024 * 1024, type: 'image/jpeg', name: 'a.jpg' }, ['image/jpeg'])).toBe(filing.docsTooBig.text);
    expect(fileProblem({ size: 100, type: 'application/pdf', name: 'a.pdf' }, ['application/pdf'])).toBeNull();
  });
});
