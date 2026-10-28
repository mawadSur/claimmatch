import { describe, expect, it } from 'vitest';
import {
  HEALTH_FEATURE_KEYS,
  attributeOverlap,
  buildMatchFeatures,
  sanitizeMatchedSignals,
} from '@/lib/match-features';
import { isMatchEventType, isMatchLabelKind, posthogMatchEventName, posthogMatchProperties } from '@/lib/match-events';
import { parseSettingsInput } from '@/lib/settings-input';
import { makeLawsuit, makeProfile } from './helpers';

describe('match features exclude health answers', () => {
  it('never includes took_medication in overlap or signals', () => {
    expect(HEALTH_FEATURE_KEYS.has('took_medication')).toBe(true);
    const profile = makeProfile({
      state: 'NY',
      attributes: {
        had_data_breach: true,
        owns_vehicle: true,
        took_medication: true,
      },
    });
    const lawsuit = makeLawsuit({
      requires: ['had_data_breach', 'took_medication'],
      anyOf: { vehicle_brands: ['Toyota'] },
    }, {
      category: 'Data Breach',
      deadline: '2026-12-01',
      proof_required: true,
      payout_min: 25,
      payout_max: 75,
    });
    const features = buildMatchFeatures(profile, lawsuit, new Date('2026-10-28T12:00:00Z'));
    expect(features.attribute_overlap).toEqual(['had_data_breach']);
    expect(features.attribute_overlap).not.toContain('took_medication');
    expect(features.state).toBe('NY');
    expect(features.category).toBe('Data Breach');
    expect(features.deadline_days).toBe(34);
    expect(features.proof_required).toBe('yes');
    expect(features.payout_size).toBe(75);
    expect(attributeOverlap(profile, { requires: ['took_medication'] })).toEqual([]);
    expect(sanitizeMatchedSignals(['had_data_breach', 'took_medication', 1])).toEqual(['had_data_breach']);
  });
});

describe('match event catalog', () => {
  it('accepts the planned event types and labels', () => {
    for (const type of ['impression', 'view', 'save', 'dismiss', 'open_form', 'filed', 'user_reported_payout']) {
      expect(isMatchEventType(type)).toBe(true);
    }
    expect(isMatchEventType('click')).toBe(false);
    expect(isMatchLabelKind('not_relevant')).toBe(true);
    expect(isMatchLabelKind('filed')).toBe(true);
    expect(isMatchLabelKind('paid')).toBe(true);
    expect(isMatchLabelKind('maybe')).toBe(false);
    expect(posthogMatchEventName('dismiss')).toBe('match_dismissed');
    expect(posthogMatchProperties({ lawsuitId: 'l1', score: 0.8, matchedSignals: ['had_data_breach'] })).toMatchObject({
      lawsuit_id: 'l1',
      score: 0.8,
      matched_signals: ['had_data_breach'],
    });
  });
});

describe('match-metrics consent', () => {
  it('records or clears the settings timestamp', () => {
    const on = parseSettingsInput({ match_metrics_consent: true });
    expect(on.ok).toBe(true);
    if (on.ok) {
      expect(on.patch.match_metrics_consent_at).toMatch(/T/);
    }
    expect(parseSettingsInput({ match_metrics_consent: false })).toEqual({
      ok: true,
      patch: { match_metrics_consent_at: null },
    });
  });
});
