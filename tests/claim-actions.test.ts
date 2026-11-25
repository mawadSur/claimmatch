import { describe, expect, it } from 'vitest';
import {
  CLAIM_ACTION_TYPES,
  EASY_SUBMIT_BADGE,
  NO_CLAIM_NEEDED_HEADING,
  NOT_OPEN_ALERT,
  SUBMIT_CLAIM_CTA,
  claimActionCta,
  isClaimActionType,
} from '@/lib/claim-actions';
import { CLAIM_ACTION_CATALOG } from '@/lib/claim-action-catalog';

describe('claim action types', () => {
  it('covers the six public CTAs', () => {
    expect(CLAIM_ACTION_TYPES).toEqual([
      'desk_file',
      'online_form',
      'needs_notice_id',
      'mail_in',
      'automatic_payment',
      'not_open',
    ]);
    expect(isClaimActionType('desk_file')).toBe(true);
    expect(isClaimActionType('other')).toBe(false);
  });

  it('hides the file button for automatic payment and not_open', () => {
    const auto = claimActionCta({ type: 'automatic_payment', slug: 'millcreek' });
    expect(auto.hideFileButton).toBe(true);
    expect(auto.heading).toBe(NO_CLAIM_NEEDED_HEADING);
    const closed = claimActionCta({ type: 'not_open', slug: 'theranos' });
    expect(closed.hideFileButton).toBe(true);
    expect(closed.alert).toBe(NOT_OPEN_ALERT);
  });

  it('promotes desk_file with Easy submit and Submit a claim', () => {
    const desk = claimActionCta({ type: 'desk_file', slug: 'realpage-rental-software-antitrust-settlement' });
    expect(desk.badge).toBe(EASY_SUBMIT_BADGE);
    expect(desk.primary?.label).toBe(SUBMIT_CLAIM_CTA);
    expect(desk.hideFileButton).toBe(false);
  });
});

describe('claim action catalog', () => {
  it('classifies 122 open published rows without duplicate slugs', () => {
    const slugs = CLAIM_ACTION_CATALOG.map((r) => r.slug);
    expect(slugs).toHaveLength(122);
    expect(new Set(slugs).size).toBe(122);
  });

  it('matches the audit buckets and final action types', () => {
    const byType = (t: string) => CLAIM_ACTION_CATALOG.filter((r) => r.action_type === t).length;
    const byBucket = (t: string) => CLAIM_ACTION_CATALOG.filter((r) => r.audit_bucket === t).length;
    expect(byType('desk_file')).toBe(2);
    expect(byType('online_form')).toBe(21);
    expect(byType('needs_notice_id')).toBe(52);
    expect(byType('mail_in')).toBe(6);
    expect(byType('automatic_payment')).toBe(21);
    expect(byType('not_open')).toBe(20);
    expect(byBucket('desk_file') + byBucket('online_form') + byBucket('needs_notice_id') + byBucket('link_out') + byBucket('automatic_payment') + byBucket('past_deadline') + byBucket('dead_or_closing') + byBucket('duplicate') + byBucket('misc') + byBucket('test')).toBe(122);
    expect(CLAIM_ACTION_CATALOG.filter((r) => r.link_out).length).toBe(15);
  });

  it('keeps RealPage and Deere as desk_file and the test row as not_open', () => {
    const bySlug = new Map(CLAIM_ACTION_CATALOG.map((r) => [r.slug, r]));
    expect(bySlug.get('realpage-rental-software-antitrust-settlement')?.action_type).toBe('desk_file');
    expect(bySlug.get('john-deere-repair-services-antitrust-settlement')?.action_type).toBe('desk_file');
    expect(bySlug.get('lawsuit-ai-one-click-test-settlement')?.action_type).toBe('not_open');
    expect(bySlug.get('hyundai-kia-vehicle-theft')?.action_type).toBe('online_form');
    expect(bySlug.get('moss-krivin-v-penske-media-corporation')?.action_type).toBe('online_form');
  });
});
