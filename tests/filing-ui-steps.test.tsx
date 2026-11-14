import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ONE_CLICK_AGENT_TITLE,
  ONE_CLICK_COPY,
  ONE_CLICK_FILED_LABEL,
  ONE_CLICK_LANE_REASONS,
  ONE_CLICK_SELF_FILE_TITLE,
  ONE_CLICK_STATUS,
  ONE_CLICK_TIMING,
} from '@/lib/copy';
import type { ClaimFilingView } from '@/lib/filing/v2/contract';
import { OneClickFiling } from '@/components/filing/OneClickFiling';
import { OneClickEntry } from '@/components/filing/OneClickEntry';
import { DocumentUploader } from '@/components/filing/DocumentUploader';
import { PreparedAnswers } from '@/components/filing/PreparedAnswers';
import { ReauthPrompt } from '@/components/filing/ReauthPrompt';
import {
  AUTH_TEXT,
  CLAIM_ID,
  CLASS_SOURCE,
  CLASS_TEXT,
  DESK_LANE,
  ESIGN_TEXT,
  LAWSUIT_ID,
  SELF_FILE_LANE,
  SIGNATURE_ID,
  HASH,
  STATEMENT,
  defaultItems,
  filingView,
  item,
  readyView,
} from './filing-ui-fixtures';

const render = (view: ClaimFilingView) =>
  renderToStaticMarkup(createElement(OneClickFiling, { view, accountEmail: 'ada@example.com', onChange: () => undefined }));
/** Visible text with tags dropped and entities decoded enough for these checks. */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** The opening tag of the element with this id. */
const tag = (html: string, id: string) => new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`).exec(html)?.[0] ?? '';
const fileButton = (html: string) => /<button[^>]*>(?:(?!<\/button>).)*File my claim<\/button>/s.exec(html)?.[0] ?? '';

describe('the one-click steps on an agent lane', () => {
  const html = render(filingView());

  it('says Lawsuit AI files this claim, with the channel’s timing and the cutoff', () => {
    expect(html).toContain(ONE_CLICK_AGENT_TITLE);
    expect(html).toContain(ONE_CLICK_TIMING.filing_desk);
    expect(html).toContain('Sign by Dec 10, 2026');
    expect(html).toContain(escape(ONE_CLICK_COPY.payout));
    expect(html).toContain('id="one-click"');
  });

  it('runs the steps in order', () => {
    const t = text(html);
    const at = (s: string) => t.indexOf(s);
    expect(at('Step 1: Confirm this describes you')).toBeGreaterThan(-1);
    expect(at('Step 2: What we still need')).toBeGreaterThan(at('Step 1:'));
    expect(at('Step 3: Review and sign')).toBeGreaterThan(at('Step 2:'));
    expect(at('File my claim')).toBeGreaterThan(at('Step 3:'));
  });

  it('step 1 shows the class definition word for word, the official link, and an unticked box', () => {
    expect(html).toContain(escape(CLASS_TEXT));
    expect(html).toContain('whitespace-pre-wrap');
    expect(html).toContain(`href="${CLASS_SOURCE}"`);
    expect(html).toContain('target="_blank"');
    const box = tag(html, 'filing-class-definition');
    expect(box).toContain('type="checkbox"');
    expect(box).not.toContain('checked');
    expect(html).toContain(ONE_CLICK_COPY.confirm.checkbox);
  });

  it('step 2 summarizes the profile and asks the rest in the official wording, with Jev hints next to fields', () => {
    expect(html).toContain(ONE_CLICK_COPY.need.fromProfile);
    expect(text(html)).toContain('Full legal name Ada Lovelace');
    expect(html).toContain('How many Widgets did you purchase during the Class Period?');
    expect(html).toContain('Count each Widget you bought.');
    // The ZIP hint is linked to its input and sits right after it.
    const zip = tag(html, 'filing-member-address-zip');
    expect(zip).toContain('aria-describedby="filing-member-address-zip-issues"');
    expect(zip).toContain('autoComplete="postal-code"');
    expect(html).toMatch(/id="filing-member-address-zip-issues"[^>]*>.*Add your ZIP code\./s);
    expect(html).toMatch(/<label[^>]*for="filing-answers-widget_count"/);
  });

  it('step 2 offers the camera and a file picker for proof, without file names', () => {
    expect(html).toContain(ONE_CLICK_COPY.docs.takePhoto);
    expect(html).toContain('capture="environment"');
    expect(html).toContain('accept="image/*"');
    expect(html).toContain('accept="image/jpeg,image/png,image/heic,application/pdf,.jpg,.jpeg,.png,.heic,.pdf"');
    expect(html).toContain(ONE_CLICK_COPY.docs.count(0, 2));
  });

  it('step 3 shows the sworn statement word for word, unticked, and keeps "File my claim" off until ready', () => {
    expect(html).toContain(escape(STATEMENT));
    expect(tag(html, 'filing-statement')).not.toContain('checked');
    expect(tag(html, 'filing-authorization')).not.toContain('checked');
    expect(html).toContain(AUTH_TEXT);
    expect(html).toContain(ONE_CLICK_COPY.review.notReady);
    expect(fileButton(html)).toContain('disabled');
    expect(html).not.toContain(ONE_CLICK_COPY.reauth.title);
  });

  it('offers to save details to the profile only as the member’s own tick', () => {
    expect(tag(html, 'filing-save-to-profile')).not.toContain('checked');
    expect(render(filingView({ packet: { save_member_to_profile_available: false } }))).not.toContain('filing-save-to-profile');
  });
});

describe('signing', () => {
  it('a complete packet with consent and a fresh sign-in can be filed', () => {
    const html = render(readyView());
    expect(fileButton(html)).not.toContain('disabled');
    expect(html).toContain(ONE_CLICK_COPY.review.typedNameHint('Ada Lovelace'));
    expect(tag(html, 'filing-typed-name')).toContain('aria-describedby="filing-typed-name-hint filing-sign-hint"');
    expect(html).not.toContain(ONE_CLICK_COPY.review.notReady);
    // "Change" goes to the input, or to the profile summary for details the profile already had.
    expect(html).toContain('href="#filing-answers-widget_count"');
    expect(html).toContain('href="#filing-profile-title"');
    expect(html).not.toContain('href="#filing-member-legal-name"');
  });

  it('asks for E-SIGN consent the first time, and holds the button until then', () => {
    const html = render(readyView({ actions: { needs_esign_consent: true }, esignConsented: false }));
    expect(html).toContain(ONE_CLICK_COPY.esign.title);
    expect(html).toContain(ESIGN_TEXT);
    expect(tag(html, 'filing-esign-consent')).not.toContain('checked');
    expect(fileButton(html)).toContain('disabled');
  });

  it('asks the member to sign in again with their password when the last sign-in is too old', () => {
    const html = render(readyView({ actions: { needs_fresh_sign_in: true } }));
    expect(html).toContain(ONE_CLICK_COPY.reauth.title);
    expect(tag(html, 'filing-reauth-password')).toContain('type="password"');
    expect(html).toContain('href="/forgot-password"');
    expect(html).toContain(ONE_CLICK_COPY.reauth.setPassword);
    expect(fileButton(html)).toContain('disabled');
  });

  it('the re-auth prompt has a visible label and the account email for password managers', () => {
    const html = renderToStaticMarkup(createElement(ReauthPrompt, { email: 'ada@example.com', onSignedIn: async () => undefined }));
    expect(html).toMatch(/<label[^>]*for="filing-reauth-password"[^>]*>Password<\/label>/);
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('value="ada@example.com"');
  });
});

describe('the self-file lane', () => {
  it('says "Finish on the official site" with the reason, and never offers signing', () => {
    const html = render(filingView({ lane: SELF_FILE_LANE, authorization: null, actions: { can_self_file: true } }));
    expect(html).toContain(ONE_CLICK_SELF_FILE_TITLE);
    expect(html).toContain(escape(ONE_CLICK_LANE_REASONS.not_offered_for_settlement));
    expect(html).not.toContain(ONE_CLICK_AGENT_TITLE);
    expect(html).not.toContain('File my claim');
    expect(html).not.toContain(AUTH_TEXT);
    expect(text(html)).toContain(`Step 3: ${ONE_CLICK_SELF_FILE_TITLE}`);
  });
});

describe('health information', () => {
  it('asks for the law firm’s consent text first and locks flagged items until the member ticks it', () => {
    const items = [
      ...defaultItems().slice(0, 5),
      item({ path: 'answers.diagnosis', label: 'Were you diagnosed with a condition?', type: 'yes_no', health_flag: true, locked: 'health_consent_needed' }),
    ];
    const html = render(filingView({ items, packet: { health_consent_text: 'I agree to share my health information with the administrator.' } }));
    expect(html).toContain(ONE_CLICK_COPY.need.healthTitle);
    expect(html).toContain('I agree to share my health information with the administrator.');
    expect(tag(html, 'filing-health-consent')).not.toContain('checked');
    expect(html).toContain(escape(ONE_CLICK_COPY.need.locked.health_consent_needed));
    const radios = [...html.matchAll(/<input[^>]*name="filing-answers-diagnosis"[^>]*>/g)].map((m) => m[0]);
    expect(radios).toHaveLength(2);
    for (const radio of radios) expect(radio).toContain('disabled=""');
  });

  it('never shows an input for something Lawsuit AI does not collect', () => {
    const items = [...defaultItems().slice(0, 5), item({ path: 'answers.notice_pin', label: 'Notice code', locked: 'not_collected' })];
    const html = render(filingView({ items }));
    expect(html).toContain(escape(ONE_CLICK_COPY.need.locked.not_collected));
    expect(html).not.toContain('id="filing-answers-notice_pin"');
  });
});

describe('after signing', () => {
  const timeline: ClaimFilingView['timeline'] = [
    { at: '2026-11-12T14:00:00Z', status: 'preparing', from: null, actor: 'you', action: 'start', confirmation_number: null },
    { at: '2026-11-12T14:30:00Z', status: 'signed', from: 'ready', actor: 'you', action: 'sign', confirmation_number: null },
    { at: '2026-11-12T14:30:01Z', status: 'queued', from: 'signed', actor: 'claimmatch', action: 'enqueue', confirmation_number: null },
  ];
  const signature = { id: SIGNATURE_ID, signed_at: '2026-11-12T14:30:00Z', typed_name: 'Ada Lovelace', packet_hash: HASH, lane: 'filing_desk' as const };
  const signed = (status: string, o: Parameters<typeof filingView>[0] = {}) =>
    render(filingView({ status, timeline, signature, packet: { status: 'signed', packet_hash: HASH, complete: true }, ...o }));

  it('queued: the status, what happens next, the signature and the timeline', () => {
    const html = signed('queued', { actions: { can_reopen: true, can_withdraw: true, can_edit: false } });
    expect(html).toContain(ONE_CLICK_STATUS.queued.label);
    expect(html).toContain(ONE_CLICK_TIMING.filing_desk);
    expect(html).toContain('Signed by Ada Lovelace on Nov 12, 2026, 9:30 AM ET');
    expect(html).toContain(ONE_CLICK_COPY.actions.reopen);
    expect(html).toContain(ONE_CLICK_COPY.actions.withdraw);
    expect(text(html)).toContain('9:30 AM ET · You Signed the claim');
    expect(text(html)).toContain('Lawsuit AI Put in line to be filed');
    expect(html).toContain('aria-current="step"');
    expect(html).not.toContain('Step 1:');
  });

  it('filing: nothing can change while a submission may be under way', () => {
    const html = signed('filing', { actions: { can_reopen: false, can_withdraw: false, can_self_file: false, can_edit: false } });
    expect(html).toContain(ONE_CLICK_STATUS.filing.label);
    expect(html).not.toContain(ONE_CLICK_COPY.actions.reopen);
    expect(html).not.toContain(ONE_CLICK_COPY.actions.withdraw);
  });

  it('filed_by_claimmatch: waiting for the number, never "Submitted", and the member can add it', () => {
    const html = signed('filed_by_claimmatch', { actions: { can_add_confirmation: true, can_withdraw: false, can_self_file: false, can_edit: false } });
    expect(html).toContain(ONE_CLICK_FILED_LABEL);
    expect(html).not.toMatch(/Submitted ·/);
    expect(html).toMatch(/<label[^>]*for="filing-confirmation-number"/);
    expect(html).toContain(ONE_CLICK_COPY.actions.confirmationHelp);
  });

  it('submitted: shows the administrator’s number', () => {
    const html = signed('submitted', { confirmation: 'ABC-123', actions: { can_withdraw: false, can_self_file: false, can_edit: false } });
    expect(html).toContain('Submitted · #ABC-123');
  });

  it('needs_you and filing_rejected say what to do next', () => {
    const needs = render(filingView({ status: 'needs_you' }));
    expect(needs).toMatch(/role="alert"[^>]*>Lawsuit AI needs something from you/);
    expect(needs).toContain('Step 1:');
    const rejected = signed('filing_rejected', { packet: { status: 'closed', packet_hash: HASH, complete: true }, actions: { can_self_file: true, can_edit: false } });
    expect(rejected).toContain(ONE_CLICK_STATUS.filing_rejected.label);
    expect(rejected).toContain(ONE_CLICK_COPY.actions.selfFile);
  });
});

describe('the entry card', () => {
  it('offers "Start my claim" with the lane’s timing, and the self-file steps stay', () => {
    const html = renderToStaticMarkup(createElement(OneClickEntry, { lane: DESK_LANE, lawsuitId: LAWSUIT_ID, onStarted: () => undefined }));
    expect(html).toContain(ONE_CLICK_AGENT_TITLE);
    expect(html).toContain(ONE_CLICK_TIMING.filing_desk);
    expect(html).toContain(ONE_CLICK_COPY.entry.start);
    expect(html).toContain(ONE_CLICK_COPY.entry.orSelfFile);
    expect(html).toContain('id="one-click"');
  });
});

describe('uploads', () => {
  const docItem = readyView().packet!.items.find((i) => i.path === 'documents.receipt')!;
  const up = (o: Partial<typeof docItem> = {}) =>
    renderToStaticMarkup(
      createElement(DocumentUploader, { item: { ...docItem, ...o }, claimId: CLAIM_ID, disabled: false, error: null, onChanged: async () => undefined }),
    );

  it('lists stored files with view and remove, and the count', () => {
    const html = up();
    expect(text(html)).toContain('File 1 (2.0 MB) · Added');
    expect(html).toContain('aria-label="Remove: File 1 (2.0 MB)"');
    expect(html).toContain(ONE_CLICK_COPY.docs.count(1, 2));
  });

  it('stops offering inputs when full or signed, and the camera when only PDFs count', () => {
    const full = up({ proof: { ...docItem.proof!, max_files: 1 } });
    expect(full).toContain(escape(ONE_CLICK_COPY.docs.full));
    expect(full).not.toContain('type="file"');
    const signedItem = up({ locked: 'packet_signed' });
    expect(signedItem).not.toContain('type="file"');
    expect(signedItem).not.toContain('aria-label="Remove');
    const pdf = up({ proof: { ...docItem.proof!, accepted_mime: ['application/pdf'], documents: [] } });
    expect(pdf).not.toContain('capture=');
    expect(pdf).toContain('accept="application/pdf,.pdf"');
  });

  it('shows an error placed on the item next to it', () => {
    const html = renderToStaticMarkup(
      createElement(DocumentUploader, { item: docItem, claimId: CLAIM_ID, disabled: false, error: 'Add a receipt.', onChanged: async () => undefined }),
    );
    expect(html).toMatch(/id="filing-documents-receipt-error"[^>]*>Add a receipt\./);
    expect(tag(html, 'filing-documents-receipt')).toContain('aria-describedby="filing-documents-receipt-error"');
  });
});

describe('prepared answers for the official site', () => {
  it('lists answers in order with copy buttons, and the files to upload there', () => {
    const html = renderToStaticMarkup(createElement(PreparedAnswers, { view: readyView({ status: 'self_file', lane: SELF_FILE_LANE }) }));
    expect(html).toContain(ONE_CLICK_COPY.prepared.title);
    const t = text(html);
    expect(t.indexOf('How many Widgets')).toBeLessThan(t.indexOf('Payment method'));
    expect(t).toContain('Payment method Paper check');
    expect(html).toContain('aria-label="Copy: Payment method"');
    expect(t).toContain(ONE_CLICK_COPY.prepared.files(1));
    expect(t).not.toContain('Ada Lovelace');
  });

  it('shows nothing when nothing was prepared', () => {
    const empty = filingView({ status: 'self_file', items: defaultItems().filter((i) => i.kind === 'member') });
    expect(renderToStaticMarkup(createElement(PreparedAnswers, { view: empty }))).toBe('');
  });
});

describe('tap targets', () => {
  it('every tick box and choice has a 44 pt target', () => {
    const html = render(filingView());
    const boxes = [...html.matchAll(/<label[^>]*>\s*<input[^>]*type="(?:checkbox|radio)"/g)].map((m) => m[0]);
    expect(boxes.length).toBeGreaterThan(3);
    for (const box of boxes) expect(box).toContain('min-h-tap');
  });
});
