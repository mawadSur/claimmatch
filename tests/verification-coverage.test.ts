import { describe, expect, it } from 'vitest';
import { computeVerificationCoverage } from '@/lib/verification-coverage';
import { applyAssistDraftToEditor, canCloseFromDraft, canRepublishFromDraft, sortVerifyQueue } from '@/lib/verification-draft-ui';
import { makeLawsuit } from './helpers';
import type { VerificationDraft } from '@/lib/verification-drafts-store';

function draft(overrides: Partial<VerificationDraft> = {}): VerificationDraft {
  return {
    id: 'draft-1',
    lawsuit_id: 'lawsuit-1',
    source_url: 'https://example.test/claim',
    status: 'pending',
    claims_status: 'open',
    deadline: '2027-01-15',
    eligibility_verified: 'US residents.',
    proof_verified: 'no',
    administrator: 'Epiq',
    evidence: {
      claims_status: { quote: 'File a claim using the form.', source_url: 'https://example.test/claim' },
    },
    extractor: 'heuristic',
    http_status: 200,
    robots_allowed: true,
    error: null,
    created_at: '2026-11-13T00:00:00Z',
    reviewed_by: null,
    reviewed_at: null,
    review_notes: null,
    ...overrides,
  };
}

describe('computeVerificationCoverage', () => {
  const now = new Date('2026-11-13T12:00:00-05:00');

  it('counts open published, verified, pending review, and alert-eligible rows', () => {
    const openVerified = makeLawsuit(
      {},
      {
        slug: 'real-open-verified',
        status: 'open',
        review_status: 'published',
        deadline: '2027-01-01',
        verified_at: '2026-01-01T00:00:00Z',
        eligibility_verified: 'US residents.',
        proof_verified: 'no',
        administrator: 'Epiq',
      },
    );
    const openUnverified = makeLawsuit(
      {},
      {
        id: 'l2',
        slug: 'real-open-unverified',
        status: 'open',
        review_status: 'published',
        deadline: '2027-02-01',
        verified_at: null,
      },
    );
    const pending = makeLawsuit(
      {},
      {
        id: 'l3',
        slug: 'real-pending',
        status: 'open',
        review_status: 'pending_review',
        deadline: null,
      },
    );
    const coverage = computeVerificationCoverage([openVerified, openUnverified, pending], now);
    expect(coverage.openPublished).toBe(2);
    expect(coverage.verified).toBe(1);
    expect(coverage.verifiedPercent).toBe(50);
    expect(coverage.pendingReview).toBe(1);
    expect(coverage.alertEligible).toBe(1);
  });

  it('omits fictional slugs', () => {
    const coverage = computeVerificationCoverage(
      [
        makeLawsuit(
          {},
          {
            slug: 'healthcare-provider-data-breach-2025',
            status: 'open',
            review_status: 'published',
            verified_at: '2026-01-01T00:00:00Z',
            administrator: 'Epiq',
          },
        ),
      ],
      now,
    );
    expect(coverage.openPublished).toBe(0);
    expect(coverage.pendingReview).toBe(0);
    expect(coverage.alertEligible).toBe(0);
  });
});

describe('verify queue helpers', () => {
  const now = new Date('2026-11-13T12:00:00-05:00');

  it('sorts unverified closing soonest, then most matches', () => {
    const rows = [
      { lawsuit: makeLawsuit({}, { id: 'a', title: 'A', verified_at: '2026-01-01', deadline: '2026-12-01' }) },
      { lawsuit: makeLawsuit({}, { id: 'b', title: 'B', verified_at: null, deadline: '2027-06-01' }) },
      { lawsuit: makeLawsuit({}, { id: 'c', title: 'C', verified_at: null, deadline: '2026-12-01' }) },
    ];
    const sorted = sortVerifyQueue(rows, {
      a: { matchCount: 9, viewCount: 9 },
      b: { matchCount: 1, viewCount: 0 },
      c: { matchCount: 5, viewCount: 0 },
    }, now);
    expect(sorted.map((row) => row.lawsuit.id)).toEqual(['c', 'b', 'a']);
  });

  it('copies draft fields into the editor', () => {
    const next = applyAssistDraftToEditor(
      { eligibilityVerified: '', proofVerified: '', administrator: 'Old', formFieldOrder: '', finalApprovalHearingAt: '', paymentTimingText: '' },
      draft(),
    );
    expect(next.eligibilityVerified).toBe('US residents.');
    expect(next.proofVerified).toBe('no');
    expect(next.administrator).toBe('Epiq');
  });

  it('gates close and republish on draft evidence', () => {
    expect(canCloseFromDraft(draft({ claims_status: 'closed' }))).toBe(true);
    expect(canCloseFromDraft(draft({ claims_status: 'closed', evidence: {} }))).toBe(false);
    expect(canRepublishFromDraft(draft(), now)).toBe(true);
    expect(canRepublishFromDraft(draft({ deadline: '2026-01-01' }), now)).toBe(false);
  });
});
