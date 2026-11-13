import { describe, expect, it } from 'vitest';
import {
  draftSuggestsClosed,
  draftSuggestsOpenFuture,
  extractVerificationDraftHeuristic,
  htmlToText,
  mergeExtractions,
  quoteIsVerbatim,
  sanitizeLlmExtraction,
} from '@/lib/verification-draft';
import { robotsAllowsPath } from '@/lib/verification-draft-fetch';

describe('htmlToText', () => {
  it('strips tags and scripts', () => {
    const text = htmlToText('<html><script>secret()</script><p>File a claim by May 1, 2027.</p></html>');
    expect(text).toContain('File a claim by May 1, 2027.');
    expect(text).not.toContain('secret');
  });
});

describe('heuristic extraction', () => {
  const url = 'https://example.test/claim';

  it('extracts a deadline, open status, proof, and administrator from notice copy', () => {
    const text = `
      The claim deadline is January 15, 2027. File a claim using the form below.
      No proof of purchase required. The settlement administrator is Epiq.
      Who is included: US residents who bought the blender between 2019 and 2024.
    `;
    const draft = extractVerificationDraftHeuristic(text, url);
    expect(draft.deadline).toBe('2027-01-15');
    expect(draft.claims_status).toBe('open');
    expect(draft.proof_verified).toBe('no');
    expect(draft.administrator).toBe('Epiq');
    expect(draft.eligibility_verified).toMatch(/US residents who bought the blender/i);
    expect(draft.evidence.deadline?.quote).toMatch(/January 15, 2027/i);
    expect(draft.evidence.deadline?.source_url).toBe(url);
    expect(draft.extractor).toBe('heuristic');
  });

  it('marks claims closed from official copy and leaves unknown proof alone', () => {
    const draft = extractVerificationDraftHeuristic(
      'The claim period has ended. This settlement is closed. Thank you.',
      url,
    );
    expect(draft.claims_status).toBe('closed');
    expect(draft.evidence.claims_status?.quote).toBeTruthy();
    expect(draft.proof_verified).toBeNull();
  });

  it('does not treat a hearing date as the claim deadline', () => {
    const draft = extractVerificationDraftHeuristic(
      'The final approval hearing is March 3, 2027. File a claim using the form below.',
      url,
    );
    expect(draft.deadline).toBeNull();
    expect(draft.claims_status).toBe('open');
  });

  it('detects optional proof', () => {
    const draft = extractVerificationDraftHeuristic(
      'Proof of purchase is optional. File a claim today.',
      url,
    );
    expect(draft.proof_verified).toBe('optional');
  });
});

describe('LLM sanitizer', () => {
  const page = 'Claims must be submitted by May 1, 2027. File a claim on this site. Administrator: Kroll.';

  it('keeps quoted fields found on the page and drops invented ones', () => {
    const llm = sanitizeLlmExtraction(
      {
        deadline: '2027-05-01',
        claims_status: 'open',
        eligibility_verified: 'Martians who own a spaceship',
        proof_verified: 'yes',
        administrator: 'Kroll',
        evidence: {
          deadline: { quote: 'submitted by May 1, 2027', source_url: 'https://example.test/claim' },
          claims_status: { quote: 'File a claim on this site', source_url: 'https://example.test/claim' },
          eligibility_verified: { quote: 'Martians who own a spaceship', source_url: 'https://example.test/claim' },
          proof_verified: { quote: 'receipts are required', source_url: 'https://example.test/claim' },
          administrator: { quote: 'Administrator: Kroll', source_url: 'https://example.test/claim' },
        },
      },
      page,
      'https://example.test/claim',
    );
    expect(llm.deadline).toBe('2027-05-01');
    expect(llm.claims_status).toBe('open');
    expect(llm.administrator).toBe('Kroll');
    expect(llm.eligibility_verified).toBeNull();
    expect(llm.proof_verified).toBeNull();
    expect(llm.extractor).toBe('anthropic');
  });

  it('merges LLM fields over heuristics when quotes survive', () => {
    const heuristic = extractVerificationDraftHeuristic(page, 'https://example.test/claim');
    const llm = sanitizeLlmExtraction(
      {
        deadline: '2027-05-01',
        claims_status: 'open',
        administrator: 'Kroll Settlement Administration',
        evidence: {
          deadline: { quote: 'submitted by May 1, 2027', source_url: 'https://example.test/claim' },
          administrator: { quote: 'Administrator: Kroll', source_url: 'https://example.test/claim' },
        },
      },
      page,
      'https://example.test/claim',
    );
    const merged = mergeExtractions(llm, heuristic);
    expect(merged.deadline).toBe('2027-05-01');
    expect(merged.extractor).toBe('anthropic');
  });

  it('quoteIsVerbatim requires a real fragment', () => {
    expect(quoteIsVerbatim('File a claim on this site', page)).toBe(true);
    expect(quoteIsVerbatim('not on the page at all really', page)).toBe(false);
  });
});

describe('triage helpers', () => {
  const now = new Date('2026-11-13T12:00:00-05:00');

  it('requires closed evidence before suggesting close', () => {
    expect(draftSuggestsClosed({ claims_status: 'closed', evidence: {} })).toBe(false);
    expect(
      draftSuggestsClosed({
        claims_status: 'closed',
        evidence: { claims_status: { quote: 'The claim period has ended.', source_url: 'https://x.test' } },
      }),
    ).toBe(true);
  });

  it('requires open status and a future deadline to republish', () => {
    expect(draftSuggestsOpenFuture({ claims_status: 'open', deadline: '2026-11-12' }, now)).toBe(false);
    expect(draftSuggestsOpenFuture({ claims_status: 'open', deadline: '2027-01-15' }, now)).toBe(true);
    expect(draftSuggestsOpenFuture({ claims_status: 'closed', deadline: '2027-01-15' }, now)).toBe(false);
  });
});

describe('robotsAllowsPath', () => {
  it('honors Disallow for * and a more specific Allow', () => {
    const txt = `User-agent: *\nDisallow: /\n\nUser-agent: ClaimMatchVerifyAssist\nAllow: /claim\nDisallow: /admin\n`;
    expect(robotsAllowsPath(txt, 'ClaimMatchVerifyAssist/1.0', '/claim')).toBe(true);
    expect(robotsAllowsPath(txt, 'ClaimMatchVerifyAssist/1.0', '/admin')).toBe(false);
    expect(robotsAllowsPath(txt, 'OtherBot/1.0', '/claim')).toBe(false);
  });

  it('allows when robots.txt has no matching disallow', () => {
    expect(robotsAllowsPath('User-agent: *\nDisallow: /secret\n', 'ClaimMatchVerifyAssist/1.0', '/claim')).toBe(true);
  });
});
