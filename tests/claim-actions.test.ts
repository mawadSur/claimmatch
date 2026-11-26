import { describe, expect, it } from 'vitest';
import {
  CLAIM_ACTION_TYPES,
  EASY_SUBMIT_BADGE,
  NO_CLAIM_NEEDED_HEADING,
  NOT_OPEN_ALERT,
  SUBMIT_CLAIM_CTA,
  cardCtaLabel,
  claimActionCta,
  hidesFileQualifySignup,
  isClaimActionType,
  signupPromptFor,
  statusChipLabel,
} from '@/lib/claim-actions';
import { CLAIM_ACTION_CATALOG, claimActionOwnerApplyRows } from '@/lib/claim-action-catalog';
import { claimActionTypesSql } from '../scripts/claim-action-types';

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
    expect(auto.heading).toBe('Get paid automatically');
    expect(auto.body).toContain(NO_CLAIM_NEEDED_HEADING);
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

  it('routes notice-id and mail-in to the public settlement page, never signup', () => {
    const notice = claimActionCta({ type: 'needs_notice_id', slug: 'simpluris-example' });
    expect(notice.primary?.href).toBe('/lawsuits/simpluris-example#notice-id');
    const mail = claimActionCta({ type: 'mail_in', slug: 'mail-example' });
    expect(mail.primary?.href).toBe('/lawsuits/mail-example#mail-in');
    expect(hidesFileQualifySignup('automatic_payment')).toBe(true);
    expect(hidesFileQualifySignup('online_form')).toBe(false);
    expect(statusChipLabel('automatic_payment', true).label).toBe('No claim needed');
    expect(cardCtaLabel('desk_file')).toBe(SUBMIT_CLAIM_CTA);
    expect(signupPromptFor('automatic_payment')).toBeNull();
    expect(signupPromptFor('desk_file')?.label).toBe('Sign in to Easy submit');
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
    expect(byType('desk_file')).toBe(10);
    expect(byType('online_form')).toBe(15);
    expect(byType('needs_notice_id')).toBe(44);
    expect(byType('mail_in')).toBe(6);
    expect(byType('automatic_payment')).toBe(22);
    expect(byType('not_open')).toBe(25);
    expect(byBucket('desk_file') + byBucket('online_form') + byBucket('needs_notice_id') + byBucket('link_out') + byBucket('automatic_payment') + byBucket('past_deadline') + byBucket('dead_or_closing') + byBucket('duplicate') + byBucket('misc') + byBucket('test')).toBe(122);
    expect(CLAIM_ACTION_CATALOG.filter((r) => r.link_out).length).toBe(15);
  });

  it('keeps RealPage and Deere as desk_file and the test row as not_open', () => {
    const bySlug = new Map(CLAIM_ACTION_CATALOG.map((r) => [r.slug, r]));
    expect(bySlug.get('realpage-rental-software-antitrust-settlement')?.action_type).toBe('desk_file');
    expect(bySlug.get('john-deere-repair-services-antitrust-settlement')?.action_type).toBe('desk_file');
    expect(bySlug.get('lawsuit-ai-one-click-test-settlement')?.action_type).toBe('not_open');
    expect(bySlug.get('hyundai-kia-vehicle-theft')?.action_type).toBe('desk_file');
    expect(bySlug.get('rolling-stone-magazine-lifetime-subscription')?.action_type).toBe('desk_file');
    expect(bySlug.get('tenet-healthcare-pixel-tracking-settlement')?.action_type).toBe('desk_file');
    expect(bySlug.get('seatgeek-ticket-fees-nevada-class-action-settlement')?.action_type).toBe('desk_file');
    expect(bySlug.get('dental-intelligence-5-75m-privacy-class-action-settlement')?.action_type).toBe('desk_file');
    expect(bySlug.get('blue-ridge-rural-water-company-data-breach-class-action-settlement')?.action_type).toBe('desk_file');
    expect(bySlug.get('vida-y-salud-health-systems-data-breach-class-action-settlement')?.action_type).toBe('desk_file');
    expect(bySlug.get('educational-computer-systems-data-breach-class-action-settlement')?.action_type).toBe('desk_file');
    expect(bySlug.get('allstate-arizona-depreciation-settlement')?.action_type).not.toBe('desk_file');
    expect(bySlug.get('kroger-prescription-drug-prices-class-action-settlement')?.action_type).not.toBe('desk_file');
    expect(bySlug.get('moss-krivin-v-penske-media-corporation')?.action_type).toBe('not_open');
    expect(bySlug.get('international-motors-wellness-program-surcharge-settlement')?.action_type).toBe(
      'automatic_payment',
    );
    expect(bySlug.get('naro-v-walgreen-co')?.action_type).toBe('automatic_payment');
    expect(bySlug.get('sanyo-solar-panels-delamination')?.claim_url).toBe(
      'https://www.sanyosolarclaims.com/documents',
    );
  });

  it('owner-apply SQL skips closed, hidden, and unpublished rows', () => {
    const apply = claimActionOwnerApplyRows();
    const skipped = CLAIM_ACTION_CATALOG.filter((r) => r.skip_owner_apply);
    expect(skipped.map((r) => r.slug).sort()).toEqual(
      [
        'acen-data-breach-settlement',
        'central-valley-meat-co-data-breach',
        'cook-county-5-68m-race-discrimination-in-hiring-settlement',
        'kia-hyundai-settlement-offers-cash-and-security-upgrades-to-owners',
        'lawsuit-ai-one-click-test-settlement',
        'metlife-auto-insurance-1-2m-class-action-settlement',
        'moss-krivin-v-penske-media-corporation',
        'nibco-pex-tubing-settlement',
        'pope-v-benson-health',
        'southstate-bank-data-breach',
      ].sort(),
    );
    expect(apply).toHaveLength(112);
    expect(apply.some((r) => r.slug === 'rolling-stone-magazine-lifetime-subscription')).toBe(true);
    expect(apply.some((r) => r.slug === 'hyundai-kia-vehicle-theft')).toBe(true);
    const sql = claimActionTypesSql();
    expect(sql).toContain("and status = 'open'");
    expect(sql).toContain("and review_status = 'published'");
    expect(sql).toContain("where slug = 'rolling-stone-magazine-lifetime-subscription'");
    expect(sql).not.toContain("where slug = 'moss-krivin-v-penske-media-corporation'");
    expect(sql).not.toContain("where slug = 'kia-hyundai-settlement-offers-cash-and-security-upgrades-to-owners'");
    expect(sql).not.toContain("where slug = 'nibco-pex-tubing-settlement'");
    expect(sql).toContain("https://www.sanyosolarclaims.com/documents");
  });
});
