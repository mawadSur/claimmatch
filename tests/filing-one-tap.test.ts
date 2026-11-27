import { describe, expect, it } from 'vitest';
import { oneTapReady, pickNextEasySubmit, requiredItemUnfilled, showNextEasySubmitCta } from '@/lib/filing/one-tap';
import type { ClaimFilingSummary } from '@/lib/filing/v2/contract';
import { SELF_FILE_LANE, filingView, item, readyView } from './filing-ui-fixtures';

describe('oneTapReady', () => {
  it('is true when every required field is already filled on an agent lane', () => {
    expect(oneTapReady(readyView())).toBe(true);
  });

  it('is false when required fields are still missing', () => {
    expect(oneTapReady(filingView())).toBe(false);
  });

  it('is false on the self-file lane even with a complete packet', () => {
    expect(oneTapReady(readyView({ lane: SELF_FILE_LANE, authorization: null }))).toBe(false);
  });

  it('is false while health consent is still outstanding', () => {
    expect(oneTapReady(readyView({ packet: { health_consent_text: 'I agree to share my health information.' } }))).toBe(
      false,
    );
  });
});

describe('requiredItemUnfilled', () => {
  it('treats a required empty answer as unfilled even when missing is false', () => {
    expect(requiredItemUnfilled(item({ path: 'answers.class_member', type: 'yes_no', required: true, missing: false }))).toBe(
      true,
    );
  });

  it('accepts a false yes/no as filled', () => {
    expect(
      requiredItemUnfilled(item({ path: 'answers.class_member', type: 'yes_no', required: true, value: false })),
    ).toBe(false);
  });
});

describe('pickNextEasySubmit', () => {
  const summary = (o: Partial<ClaimFilingSummary>): ClaimFilingSummary => ({
    claim_id: '00000000-0000-4000-8000-0000000000c1',
    lawsuit_id: '00000000-0000-4000-8000-0000000000d1',
    slug: 'widget-settlement',
    title: 'Widget settlement',
    status: 'preparing',
    lane: 'filing_desk',
    agent: true,
    deadline: '2026-12-15',
    confirmation_number: null,
    needs_action: true,
    updated_at: '2026-11-12T15:00:00Z',
    ...o,
  });

  it('picks another preparing agent claim and skips the one just signed', () => {
    const next = pickNextEasySubmit(
      [
        summary({ claim_id: '00000000-0000-4000-8000-0000000000c1', status: 'queued' }),
        summary({
          claim_id: '00000000-0000-4000-8000-0000000000c2',
          slug: 'next-one',
          title: 'Next settlement',
          status: 'ready',
        }),
      ],
      '00000000-0000-4000-8000-0000000000c1',
    );
    expect(next).toEqual({ slug: 'next-one', title: 'Next settlement', href: '/claim/next-one#one-click' });
  });

  it('ignores self-file and submitted claims', () => {
    expect(
      pickNextEasySubmit(
        [
          summary({ agent: false, lane: 'self_file' }),
          summary({ claim_id: '00000000-0000-4000-8000-0000000000c3', status: 'submitted' }),
        ],
        null,
      ),
    ).toBeNull();
  });
});

describe('showNextEasySubmitCta', () => {
  it('is on after signing, off while still preparing', () => {
    expect(showNextEasySubmitCta('queued')).toBe(true);
    expect(showNextEasySubmitCta('submitted')).toBe(true);
    expect(showNextEasySubmitCta('preparing')).toBe(false);
  });
});
