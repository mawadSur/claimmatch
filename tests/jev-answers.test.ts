import { describe, expect, it } from 'vitest';
import { runJev } from '@/lib/jev';
import type { AnswerValue, FilingSpecContentInput } from '@/lib/filing/v2/contract';
import { jevInput, specContent } from './jev-fixtures';

const choice = (values: string[]) => values.map((value) => ({ value, official_label: value.toUpperCase() }));

const QUESTIONS: FilingSpecContentInput['questions'] = [
  {
    key: 't_text',
    official_label: 'Product code',
    type: 'text',
    required: false,
    validation: { min_length: 2, max_length: 10, pattern: '^[A-Z]{2}\\d+$', pattern_hint: 'Use two capital letters, then numbers, like AB123.' },
  },
  { key: 't_email', official_label: 'Email used for the order', type: 'email', required: false },
  { key: 't_phone', official_label: 'Phone used for the order', type: 'phone', required: false },
  { key: 't_date', official_label: 'Date of purchase', type: 'date', required: false },
  { key: 't_int', official_label: 'How many?', type: 'integer', required: false, validation: { min: 1, max: 5 } },
  { key: 't_dec', official_label: 'Weight in pounds', type: 'decimal', required: false, validation: { min: 0 } },
  { key: 't_money', official_label: 'Amount paid', type: 'money', required: false, validation: { max: 100 } },
  { key: 't_yes', official_label: 'Did you return it?', type: 'yes_no', required: false },
  { key: 't_one', official_label: 'Color', type: 'single_choice', required: false, options: choice(['red', 'blue']) },
  { key: 't_many', official_label: 'Sizes', type: 'multi_choice', required: false, options: choice(['s', 'm', 'l']), validation: { min: 1, max: 2 } },
  { key: 't_state', official_label: 'State of purchase', type: 'us_state', required: false },
  { key: 't_zip', official_label: 'ZIP of the store', type: 'zip', required: false },
  { key: 't_vin', official_label: 'Vehicle Identification Number', type: 'vin', required: false },
  { key: 't_notice', official_label: 'Notice ID', type: 'notice_id', required: false, validation: { max_length: 12 } },
  { key: 't_unsafe', official_label: 'Code with a broken pattern', type: 'text', required: false, validation: { pattern: '(a+)+$' } },
];

const content = specContent({ questions: QUESTIONS, benefit_tiers: [], payout_options: [], form_field_order: [] });

/** Issues Jev reports on one answer (partial mode, everything else valid). */
function check(key: string, value: AnswerValue, audience: 'member' | 'staff' = 'member') {
  const input = jevInput({ mode: 'partial' }, { content, answers: { [key]: value }, packet: { benefit_tier: null, payout_method: null } });
  return runJev(input).issues.filter((i) => i.field === `answers.${key}` && i.audience === audience);
}
const codesFor = (key: string, value: AnswerValue) => check(key, value).map((i) => i.code);

describe('global.answer_types', () => {
  it('checks text length and the spec’s pattern, using the spec’s hint', () => {
    expect(codesFor('t_text', 'AB123')).toEqual([]);
    const short = check('t_text', 'A');
    expect(short.map((i) => i.code)).toEqual(['pattern_mismatch', 'too_short']);
    expect(short.find((i) => i.code === 'pattern_mismatch')?.message).toBe('Use two capital letters, then numbers, like AB123.');
    expect(codesFor('t_text', 'AB1234567890')).toEqual(['too_long']);
    expect(codesFor('t_text', 42)).toEqual(['invalid_type']);
  });

  it('skips a pattern that is not safe to run and tells staff instead of blocking the member', () => {
    expect(check('t_unsafe', 'aaaa')).toEqual([]);
    expect(check('t_unsafe', 'aaaa', 'staff')).toEqual([expect.objectContaining({ code: 'spec_pattern_invalid', severity: 'warn' })]);
  });

  it.each([
    ['t_email', 'ada@example.com', []],
    ['t_email', 'ada@example', ['invalid_email']],
    ['t_phone', '212-555-0123', []],
    ['t_phone', '911', ['invalid_phone']],
    ['t_date', '2024-02-29', []],
    ['t_date', '2023-02-29', ['invalid_date']],
    ['t_date', '05/01/2023', ['invalid_date']],
    ['t_int', 3, []],
    ['t_int', 3.5, ['not_whole_number']],
    ['t_int', '3', ['not_whole_number']],
    ['t_int', 0, ['out_of_range']],
    ['t_dec', 2.5, []],
    ['t_dec', -1, ['out_of_range']],
    ['t_money', '12.34', []],
    ['t_money', '100', []],
    ['t_money', '12.345', ['invalid_money']],
    ['t_money', '$12', ['invalid_money']],
    ['t_money', '1,000.00', ['invalid_money']],
    ['t_money', '100.01', ['out_of_range']],
    ['t_yes', false, []],
    ['t_yes', 'yes', ['invalid_type']],
    ['t_one', 'red', []],
    ['t_one', 'green', ['invalid_option']],
    ['t_many', ['s', 'l'], []],
    ['t_many', ['s', 'm', 'l'], ['too_many_choices']],
    ['t_many', ['s', 's'], ['invalid_option']],
    ['t_many', ['xl'], ['invalid_option']],
    ['t_state', 'NY', []],
    ['t_state', 'XX', ['invalid_state']],
    ['t_zip', '10001-0001', []],
    ['t_zip', '1000', ['invalid_zip']],
    ['t_notice', 'ABC-123', []],
    ['t_notice', 'ABCDEFGHIJKLM', ['too_long']],
  ] as Array<[string, AnswerValue, string[]]>)('%s = %j gives %j', (key, value, expected) => {
    expect(codesFor(key, value)).toEqual(expected);
  });

  it('explains a number range in plain words', () => {
    expect(check('t_int', 9)[0]?.message).toBe('Enter a number from 1 to 5.');
    expect(check('t_dec', -3)[0]?.message).toBe('Enter a number of at least 0.');
    expect(check('t_money', '250')[0]?.message).toBe('Enter a number of at most 100.');
  });

  it('warns about a date after today in the settlement’s time zone', () => {
    expect(check('t_date', '2026-11-13')).toEqual([expect.objectContaining({ code: 'date_in_future', severity: 'warn' })]);
    expect(codesFor('t_date', '2026-11-12')).toEqual([]);
  });

  it('treats an empty answer as unanswered, not as invalid', () => {
    expect(codesFor('t_many', [])).toEqual([]);
    expect(codesFor('t_text', '   ')).toEqual([]);
    expect(codesFor('t_int', null)).toEqual([]);
  });
});

describe('VINs (ISO 3779 check digit)', () => {
  it.each(['1HGCM82633A004352', '1hgcm82633a004352', '1M8GDM9AXKP042788', '11111111111111111'])('accepts %s', (vin) => {
    expect(codesFor('t_vin', vin)).toEqual([]);
  });

  it.each([
    ['1HGCM82633A004353', 'vin_check_digit'],
    ['1HGCM82643A004352', 'vin_check_digit'],
    ['WP0ZZZ99ZTS392124', 'vin_check_digit'],
    ['IHGCM82633A004352', 'invalid_vin'],
    ['1HGCM82633A00435', 'invalid_vin'],
    ['1HGCM82633A0043522', 'invalid_vin'],
    ['1HGCM 82633A00435', 'invalid_vin'],
  ])('refuses %s (%s)', (vin, code) => {
    const [issue] = check('t_vin', vin);
    expect(issue).toMatchObject({ code, severity: 'block' });
  });
});
