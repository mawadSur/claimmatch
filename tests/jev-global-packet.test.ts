import { describe, expect, it } from 'vitest';
import { runJev } from '@/lib/jev';
import { JEV_REFUSE_TO_STORE_CODES } from '@/lib/jev/types';
import type { FilingSpecContentInput, PacketDraft } from '@/lib/filing/v2/contract';
import { DOC_ID, SPEC_INPUT, codes, find, jevInput, sha, specContent } from './jev-fixtures';

type Doc = PacketDraft['documents'][number];
const doc = (n: number, kind: string, mime: Doc['mime'] = 'application/pdf', size = 2048): Doc => ({
  id: DOC_ID(n),
  kind,
  sha256: sha(`file ${n}`),
  mime,
  size_bytes: size,
});

describe('global.member_identity', () => {
  it('needs a legal name: info while filling, block before signing', () => {
    expect(find(runJev(jevInput({ mode: 'partial' }, { member: { legal_name: null } })), 'required_missing')?.severity).toBe('info');
    expect(find(runJev(jevInput({}, { member: { legal_name: '  ' } })), 'required_missing')?.field).toBe('member.legal_name');
  });

  it.each([
    ['A', 'invalid_value'],
    ['12 34', 'invalid_value'],
    ['x'.repeat(201), 'too_long'],
    ['Ada', 'legal_name_incomplete'],
  ])('flags the legal name %j as %s', (legal_name, code) => {
    expect(codes(runJev(jevInput({}, { member: { legal_name } })))).toEqual([code]);
  });

  it('accepts names in any script and with accents', () => {
    expect(runJev(jevInput({}, { member: { legal_name: 'José Núñez-García' } })).issues).toEqual([]);
    expect(runJev(jevInput({}, { member: { legal_name: '李 小龍' } })).issues).toEqual([]);
  });

  it('asks for first and last name only when the form splits the name, and checks they match', () => {
    const content = specContent({
      member_fields: [
        ...SPEC_INPUT.member_fields,
        { field: 'first_name', official_label: 'First Name', required: true },
        { field: 'last_name', official_label: 'Last Name', required: true },
      ],
    });
    expect(runJev(jevInput({}, { content })).issues.map((i) => i.field)).toEqual(['member.first_name', 'member.last_name']);
    expect(runJev(jevInput({}, { content, member: { first_name: 'Ada', last_name: 'Lovelace' } })).issues).toEqual([]);
    const mismatch = runJev(jevInput({}, { content, member: { first_name: 'Ada', last_name: 'Byron' } }));
    expect(mismatch.issues).toEqual([expect.objectContaining({ code: 'name_parts_mismatch', severity: 'warn', field: 'member.last_name' })]);
  });

  it('checks the email and, when given, the phone', () => {
    expect(codes(runJev(jevInput({}, { member: { email: 'ada@example' } })))).toEqual(['invalid_email']);
    expect(codes(runJev(jevInput({}, { member: { email: null } })))).toEqual(['required_missing']);
    expect(runJev(jevInput({}, { member: { phone: '(212) 555-0123' } })).issues).toEqual([]);
    expect(runJev(jevInput({}, { member: { phone: '+1 212.555.0123' } })).issues).toEqual([]);
    expect(codes(runJev(jevInput({}, { member: { phone: '555-123-4567' } })))).toEqual(['invalid_phone']);
    const phoneRequired = specContent({
      member_fields: SPEC_INPUT.member_fields.map((m) => (m.field === 'phone' ? { ...m, required: true } : m)),
    });
    expect(codes(runJev(jevInput({}, { content: phoneRequired })))).toEqual(['required_missing']);
  });
});

describe('global.member_address', () => {
  it.each([
    [{ line1: null }, 'member.address.line1', 'required_missing'],
    [{ city: '' }, 'member.address.city', 'required_missing'],
    [{ state: 'ZZ' }, 'member.address.state', 'invalid_state'],
    [{ zip: '9411' }, 'member.address.zip', 'invalid_zip'],
    [{ zip: '00000' }, 'member.address.zip', 'invalid_zip'],
    [{ line2: 'y'.repeat(201) }, 'member.address.line2', 'too_long'],
  ])('flags %j', (address, field, code) => {
    const result = runJev(jevInput({ lane: 'self_file' }, { address: address as Partial<PacketDraft['member']['address']> }));
    expect(result.issues.map((i) => [i.field, i.code])).toEqual([[field, code]]);
  });

  it('accepts ZIP+4, territories and military mail, and leaves line 2 optional', () => {
    expect(runJev(jevInput({ lane: 'self_file' }, { address: { zip: '94110-1234', state: 'PR' } })).issues).toEqual([]);
    expect(runJev(jevInput({ lane: 'self_file' }, { address: { state: 'AE', zip: '09001' } })).issues).toEqual([]);
  });
});

describe('global.required_answers and visibility', () => {
  it('asks tier questions only for that tier', () => {
    const result = runJev(jevInput({}, { packet: { benefit_tier: 'with_proof', documents: [doc(1, 'purchase_proof')] } }));
    expect(result.issues.map((i) => [i.field, i.code])).toEqual([['answers.proof_amount', 'required_missing']]);
  });

  it('asks a visible_when question only when its condition holds', () => {
    const content = specContent({
      questions: [
        ...(SPEC_INPUT.questions ?? []),
        {
          key: 'store_city',
          official_label: 'Which city was the store in?',
          type: 'text',
          required: true,
          visible_when: { field: 'answers.store', op: 'eq', value: 'in_store' },
        },
      ],
    });
    expect(runJev(jevInput({}, { content })).issues).toEqual([]);
    const inStore = runJev(jevInput({}, { content, answers: { purchase_date: '2023-05-01', item_count: 3, store: 'in_store' } }));
    expect(inStore.issues.map((i) => i.field)).toEqual(['answers.store_city']);
  });
});

describe('a visible_when that cannot run', () => {
  it('asks the question anyway and tells staff', () => {
    const content = specContent({
      questions: [
        ...(SPEC_INPUT.questions ?? []),
        { key: 'serial', official_label: 'Serial number', type: 'text', required: true, visible_when: { field: 'answers.store', op: 'matches', pattern: '(a+)+' } },
      ],
    });
    const result = runJev(jevInput({}, { content }));
    expect(result.issues.map((i) => [i.field, i.code, i.audience])).toEqual([
      ['answers.serial', 'required_missing', 'member'],
      ['answers.serial', 'spec_condition_invalid', 'staff'],
    ]);
  });
});

describe('global.unknown_answers', () => {
  it('refuses keys the form does not have, and flags answers that no longer apply', () => {
    const result = runJev(jevInput({}, { answers: { purchase_date: '2023-05-01', item_count: 3, pin: '1234', proof_amount: '12.00' } }));
    expect(result.issues.map((i) => [i.field, i.code, i.severity])).toEqual([
      ['answers.pin', 'unknown_question', 'block'],
      ['answers.proof_amount', 'answer_not_applicable', 'warn'],
    ]);
    expect(JEV_REFUSE_TO_STORE_CODES).toContain('unknown_question');
  });

  it('treats an answer key named like an object property as just a key', () => {
    const result = runJev(jevInput({ mode: 'partial' }, { answers: { purchase_date: '2023-05-01', item_count: 3, constructor: 'x' } }));
    expect(result.issues.map((i) => i.field)).toEqual(['answers.constructor']);
  });
});

describe('global.no_secrets', () => {
  const notes = (value: string) => runJev(jevInput({ mode: 'partial' }, { answers: { purchase_date: '2023-05-01', item_count: 3, notes: value } }));

  it.each([
    'My SSN is 123-45-6789',
    'ssn 123 45 6789',
    'card 4111 1111 1111 1111 exp 12/29',
    'Paid with 5555555555554444',
    'routing number 021000021',
    'my checking account is 000123456789',
    'Notice PIN: 4821',
  ])('refuses %j', (value) => {
    const issue = find(notes(value), 'secret_like_value');
    expect(issue).toMatchObject({ severity: 'block', field: 'answers.notes' });
    expect(JEV_REFUSE_TO_STORE_CODES).toContain('secret_like_value');
  });

  it.each([
    'Bought 3 widgets at Store #1234 on 2023-05-01',
    'Order 112-3456789-1234567',
    'Call me at (212) 555-0123',
    'ZIP 94110-1234',
    'Loyalty card 1234 5678 9012 3456',
  ])('allows %j', (value) => {
    expect(notes(value).issues).toEqual([]);
  });

  it('only warns when the whole answer is nine digits that could be an SSN or routing number', () => {
    expect(find(notes('123456789'), 'possible_secret')?.severity).toBe('warn');
    const content = specContent({
      questions: [...(SPEC_INPUT.questions ?? []), { key: 'notice_id', official_label: 'Notice ID from your postcard', type: 'notice_id', required: false }],
    });
    const notice = (value: string) => runJev(jevInput({ mode: 'partial' }, { content, answers: { purchase_date: '2023-05-01', item_count: 3, notice_id: value } }));
    expect(notice('123456789').issues).toEqual([]);
    expect(find(notice('4111111111111111'), 'possible_secret')?.severity).toBe('warn');
    expect(find(notice('123-45-6789'), 'secret_like_value')?.severity).toBe('block');
  });

  it('names PINs and codes in plain words', () => {
    expect(find(notes('one-time code 482913'), 'secret_like_value')?.message).toBe('This looks like a PIN, password or one-time code. Lawsuit AI never collects those, so remove it.');
    expect(find(notes('SSN 123-45-6789, PIN 4821'), 'secret_like_value')?.message).toMatch(/Social Security/);
  });

  it('checks the member’s own text fields too', () => {
    expect(find(runJev(jevInput({}, { address: { line2: 'Apt 4, SSN 123-45-6789' } })), 'secret_like_value')?.field).toBe('member.address.line2');
  });
});

describe('global.health_consent', () => {
  const content = specContent({
    questions: [...(SPEC_INPUT.questions ?? []), { key: 'diagnosis', official_label: 'Were you diagnosed with a condition?', type: 'yes_no', required: false, health_flag: true }],
    benefit_tiers: [
      ...(SPEC_INPUT.benefit_tiers ?? []),
      { key: 'medical', official_label: 'Medical costs', proof: [{ kind: 'medical_bill', official_label: 'Medical bill', required: true, health_flag: true }] },
    ],
  });
  const answered = { purchase_date: '2023-05-01', item_count: 3, diagnosis: true };

  it('never keeps a flagged answer without the law firm’s consent text and the member’s consent', () => {
    const noText = runJev(jevInput({ mode: 'partial' }, { content, answers: answered }));
    expect(find(noText, 'not_collected')).toMatchObject({ field: 'answers.diagnosis', severity: 'block' });
    const notGiven = runJev(jevInput({ mode: 'partial', healthConsent: { required: true, textAvailable: true, given: false } }, { content, answers: answered }));
    expect(find(notGiven, 'health_consent_required')).toMatchObject({ field: 'answers.diagnosis', severity: 'block' });
    const given = runJev(jevInput({ mode: 'partial', healthConsent: { required: true, textAvailable: true, given: true } }, { content, answers: answered, packet: { confirmations: { class_definition: true, health_data_consent: true } } }));
    expect(given.issues).toEqual([]);
    expect(JEV_REFUSE_TO_STORE_CODES).toEqual(expect.arrayContaining(['not_collected', 'health_consent_required']));
  });

  it('treats flagged proof the same way', () => {
    const result = runJev(jevInput({ mode: 'partial' }, { content, packet: { benefit_tier: 'medical', documents: [doc(1, 'medical_bill')] } }));
    expect(find(result, 'not_collected')?.field).toBe('doc_count.medical_bill');
  });

  it('needs consent before signing on an agent lane, as a to-do while filling', () => {
    const facts = { required: true, textAvailable: true, given: false };
    expect(find(runJev(jevInput({ mode: 'partial', healthConsent: facts }, { content })), 'health_consent_needed')?.severity).toBe('info');
    expect(find(runJev(jevInput({ healthConsent: facts }, { content })), 'health_consent_needed')?.severity).toBe('block');
    expect(codes(runJev(jevInput({ lane: 'self_file', healthConsent: facts }, { content })))).toEqual([]);
    expect(JEV_REFUSE_TO_STORE_CODES).not.toContain('health_consent_needed');
  });

  it('keeps agent lanes off without consent text, telling the member only that it is not offered', () => {
    const result = runJev(jevInput({ healthConsent: { required: true, textAvailable: false, given: false } }, { content }));
    expect(codes(result, 'member')).toEqual(['not_offered_for_settlement']);
    expect(result.issues.filter((i) => i.audience === 'staff').map((i) => [i.rule_id, i.code])).toEqual([['global.lane_allowed', 'health_consent_unavailable']]);
    expect(runJev(jevInput({ mode: 'partial', healthConsent: { required: true, textAvailable: false, given: false } }, { content })).issues).toEqual([]);
  });

  it('tells staff when the packet’s consent flag disagrees with the recorded consent', () => {
    const result = runJev(jevInput({ healthConsent: { required: true, textAvailable: true, given: true } }, { content }));
    expect(codes(result, 'staff')).toEqual(['health_consent_packet_mismatch']);
  });
});

describe('global.benefit_tier and global.payout_method', () => {
  it('needs a listed tier and payout method when the form has them', () => {
    expect(find(runJev(jevInput({ mode: 'partial' }, { packet: { benefit_tier: null } })), 'required_missing')).toMatchObject({ field: 'benefit_tier', severity: 'info' });
    expect(find(runJev(jevInput({}, { packet: { benefit_tier: 'gold' } })), 'invalid_option')?.field).toBe('benefit_tier');
    expect(find(runJev(jevInput({}, { packet: { payout_method: null } })), 'required_missing')?.field).toBe('payout_method');
    expect(find(runJev(jevInput({}, { packet: { payout_method: 'venmo' } })), 'invalid_option')?.field).toBe('payout_method');
  });

  it('refuses a tier or payout method when the form has none', () => {
    const content = specContent({ benefit_tiers: [], payout_options: [], questions: SPEC_INPUT.questions?.slice(0, 4), form_field_order: [] });
    expect(codes(runJev(jevInput({}, { content })))).toEqual(['invalid_option', 'invalid_option']);
  });
});

describe('global.proof_documents', () => {
  const proof = (documents: Doc[], extra: Partial<PacketDraft> = {}) =>
    runJev(jevInput({}, { packet: { benefit_tier: 'with_proof', documents, ...extra }, answers: { purchase_date: '2023-05-01', item_count: 3, proof_amount: '19.99' } }));

  it('needs the tier’s required proof, within its limits and file types', () => {
    expect(proof([]).issues.map((i) => [i.field, i.code])).toEqual([['doc_count.purchase_proof', 'required_missing']]);
    expect(proof([doc(1, 'purchase_proof')]).issues).toEqual([]);
    expect(codes(proof([doc(1, 'purchase_proof'), doc(2, 'purchase_proof'), doc(3, 'purchase_proof')]))).toEqual(['proof_too_many']);
    const wrongType = find(proof([doc(1, 'purchase_proof', 'image/png')]), 'proof_wrong_type');
    expect(wrongType?.message).toBe('This file type isn’t accepted here. Upload a PDF or JPG file.');
  });

  it('flags the same file twice and files that do not apply to the chosen tier', () => {
    const same = { ...doc(2, 'purchase_proof'), sha256: sha('file 1') };
    expect(codes(proof([doc(1, 'purchase_proof'), same]))).toEqual(['duplicate_document']);
    const result = runJev(jevInput({}, { packet: { documents: [doc(1, 'purchase_proof')] } }));
    expect(result.issues.map((i) => [i.field, i.code, i.severity])).toEqual([['doc_count.purchase_proof', 'document_not_applicable', 'warn']]);
  });

  it('asks for the minimum once some optional proof is uploaded', () => {
    const tiers: FilingSpecContentInput['benefit_tiers'] = [
      { key: 'no_proof', official_label: 'Without proof', proof: [{ kind: 'photo', official_label: 'Photos of the product', required: false, min_files: 2, max_files: 4 }] },
    ];
    const content = specContent({ benefit_tiers: tiers, questions: SPEC_INPUT.questions?.slice(0, 4), form_field_order: [] });
    expect(runJev(jevInput({}, { content })).issues).toEqual([]);
    const one = runJev(jevInput({}, { content, packet: { documents: [doc(1, 'photo', 'image/jpeg')] } }));
    expect(one.issues).toEqual([expect.objectContaining({ code: 'proof_too_few', message: 'Upload at least 2 files for this proof.' })]);
  });
});

describe('global.packet_size', () => {
  it('limits the number and size of answers', () => {
    const many = Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`q${i}`, 'x']));
    expect(codes(runJev(jevInput({ mode: 'partial', spec: null }, { answers: many, packet: { spec: null, benefit_tier: null, payout_method: null } })))).toContain('packet_too_large');
    const long = runJev(jevInput({ mode: 'partial' }, { answers: { purchase_date: '2023-05-01', item_count: 3, notes: 'x'.repeat(2001) } }));
    expect(find(long, 'answer_too_long')?.field).toBe('answers.notes');
    const big = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, 'é'.repeat(900)]));
    const heavy = runJev(jevInput({ mode: 'partial', spec: null }, { answers: big, packet: { spec: null, benefit_tier: null, payout_method: null } }));
    expect(heavy.issues.filter((i) => i.code === 'packet_too_large' && i.field === null)).toHaveLength(1);
  });
});
