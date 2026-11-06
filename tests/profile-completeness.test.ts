import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProfileCompletenessCard } from '@/components/dashboard/ProfileCompletenessCard';
import {
  catalogMatcherKeys,
  profileCompleteness,
  shouldShowCompletenessCard,
  unansweredMatcherKeys,
} from '@/lib/profile-completeness';
import { makeLawsuit, makeProfile } from './helpers';

describe('profile completeness math', () => {
  const now = new Date('2026-11-06T15:00:00Z');

  it('ignores health keys and counts unanswered matcher questions that appear in the catalog', () => {
    expect(unansweredMatcherKeys({ took_medication: true })).toContain('had_data_breach');
    expect(unansweredMatcherKeys({ took_medication: true })).not.toContain('took_medication');
    expect(catalogMatcherKeys({ requires: ['had_data_breach', 'took_medication'] })).toEqual(['had_data_breach']);
  });

  it('estimates additional open settlements from unanswered catalog keys', () => {
    const profile = makeProfile({
      state: 'CA',
      attributes: { had_data_breach: true },
      onboarded: true,
    });
    const openBreach = makeLawsuit(
      { states: ['CA'], requires: ['had_data_breach'] },
      { id: 'already', slug: 'already', status: 'open', review_status: 'published', deadline: '2099-01-01' },
    );
    const openBanking = makeLawsuit(
      { states: ['CA'], requires: ['used_banking'] },
      { id: 'unlock', slug: 'unlock', status: 'open', review_status: 'published', deadline: '2099-01-01' },
    );
    const otherState = makeLawsuit(
      { states: ['NY'], requires: ['used_banking'] },
      { id: 'ny', slug: 'ny', status: 'open', review_status: 'published', deadline: '2099-01-01' },
    );
    const closed = makeLawsuit(
      { states: ['CA'], requires: ['used_banking'] },
      { id: 'closed', slug: 'closed', status: 'closed', review_status: 'published', deadline: '2099-01-01' },
    );

    const result = profileCompleteness(profile, [openBreach, openBanking, otherState, closed], now);
    expect(result.hasMatchSignals).toBe(true);
    expect(result.unansweredKeys).toEqual(['used_banking']);
    expect(result.additionalSettlements).toBe(1);
    expect(shouldShowCompletenessCard(result)).toBe(true);
  });

  it('hides the card when there are no match signals or the profile is complete for the catalog', () => {
    const empty = profileCompleteness(makeProfile({ state: null, attributes: {} }), [
      makeLawsuit(
        { requires: ['had_data_breach'] },
        { status: 'open', review_status: 'published', deadline: '2099-01-01' },
      ),
    ], now);
    expect(empty.hasMatchSignals).toBe(false);
    expect(shouldShowCompletenessCard(empty)).toBe(false);

    const complete = profileCompleteness(
      makeProfile({
        state: 'CA',
        attributes: {
          had_data_breach: false,
          owns_vehicle: false,
          used_banking: false,
          bought_consumer_goods: false,
          uses_social_media: false,
          used_streaming: false,
          employed_hourly: false,
        },
      }),
      [
        makeLawsuit(
          { states: ['CA'], requires: ['had_data_breach'] },
          { status: 'open', review_status: 'published', deadline: '2099-01-01' },
        ),
      ],
      now,
    );
    expect(complete.complete).toBe(true);
    expect(shouldShowCompletenessCard(complete)).toBe(false);
  });

  it('does not treat vehicle_brands as unanswered when the user said they have no vehicle', () => {
    expect(unansweredMatcherKeys({ owns_vehicle: false })).not.toContain('vehicle_brands');
    expect(unansweredMatcherKeys({ owns_vehicle: true })).toContain('vehicle_brands');
    expect(unansweredMatcherKeys({})).toContain('vehicle_brands');
  });
});

describe('profile completeness card', () => {
  it('renders real unanswered and unlock counts, not a payout total', () => {
    const html = renderToStaticMarkup(
      createElement(ProfileCompletenessCard, {
        result: {
          unansweredCount: 2,
          unansweredKeys: ['used_banking', 'owns_vehicle'],
          additionalSettlements: 4,
          hasMatchSignals: true,
          complete: false,
        },
      }),
    );
    expect(html).toContain('Answer 2 more questions to unlock ~4 more matches');
    expect(html).toContain('/onboarding');
    expect(html).not.toMatch(/\$/);
    expect(html).toContain('not payment amounts');
  });
});
