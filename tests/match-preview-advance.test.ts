import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MATCH_PREVIEW_COOKIE,
  MATCH_PREVIEW_QUESTIONS,
  emptyMatchPreviewDraft,
  mergePreviewIntoAnswers,
  parsePreviewCookie,
  previewCookie,
  previewCookieValue,
} from '@/lib/match-preview';

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), 'utf8');
const preview = read('src/components/match-preview/MatchPreview.tsx');

describe('the cm_preview handoff cookie', () => {
  it('round-trips the answers the preview collected', () => {
    const draft = { state: 'CA', attributes: { had_data_breach: true, used_banking: false } };
    expect(parsePreviewCookie(previewCookieValue(draft))).toEqual(draft);
    // The browser hands back a percent-encoded value.
    expect(parsePreviewCookie(encodeURIComponent(previewCookieValue(draft)))).toEqual(draft);
  });

  it('carries only the preview keys, never the matched settlements', () => {
    const value = previewCookieValue({
      state: 'NY',
      attributes: { used_streaming: true },
    });
    expect(value.split('&').sort()).toEqual(['state=NY', 'used_streaming=1']);
    expect(value).not.toContain('settlement');
  });

  it('is same-site, short-lived, server-only, and Secure on https', () => {
    const draft = { state: 'TX', attributes: {} };
    const secure = previewCookie(draft, true);
    expect(secure.startsWith(`${MATCH_PREVIEW_COOKIE}=`)).toBe(true);
    expect(secure).toContain('Path=/');
    expect(secure).toContain('Max-Age=86400');
    expect(secure).toContain('SameSite=Lax');
    expect(secure).toContain('HttpOnly');
    expect(secure).toContain('; Secure');
    expect(previewCookie(draft, false)).not.toContain('Secure');
  });

  it('refuses junk, an empty value and anything over-long', () => {
    expect(parsePreviewCookie(undefined)).toBeNull();
    expect(parsePreviewCookie('')).toBeNull();
    expect(parsePreviewCookie('%')).toBeNull();
    expect(parsePreviewCookie('state=ZZ')).toBeNull();
    expect(parsePreviewCookie('had_data_breach=maybe')).toBeNull();
    expect(parsePreviewCookie(`state=CA&pad=${'x'.repeat(400)}`)).toBeNull();
    // Keys the preview does not own are dropped, not trusted.
    expect(parsePreviewCookie('state=CA&has_health_condition=1')).toEqual({
      state: 'CA',
      attributes: {},
    });
  });

  it('lets saved profile answers win over the cookie', () => {
    const draft = { state: 'CA', attributes: { had_data_breach: true } };
    expect(mergePreviewIntoAnswers({ had_data_breach: false }, draft)).toEqual({
      had_data_breach: false,
    });
    expect(mergePreviewIntoAnswers({}, draft)).toEqual({ had_data_breach: true });
  });

  it('writes nothing for an empty draft', () => {
    expect(previewCookieValue(emptyMatchPreviewDraft())).toBe('');
    expect(parsePreviewCookie(previewCookieValue(emptyMatchPreviewDraft()))).toBeNull();
  });
});

describe('/preview answers advance on one tap', () => {
  it('records the answer and moves on without a second Continue tap', () => {
    expect(preview).toContain('function answer(value: boolean)');
    expect(preview).toContain('onClick={() => answer(true)}');
    expect(preview).toContain('onClick={() => answer(false)}');
    // The final answer has to carry the new draft: state is not updated yet.
    expect(preview).toContain('void finish(nextDraft)');
    expect(preview).toContain('function finish(source: MatchPreviewDraft = draft)');
  });

  it('keeps Back, the explicit Continue, and the pending feedback', () => {
    expect(preview).toContain('Back');
    expect(preview).toContain('disabled={busy}');
    expect(preview).toContain('Checking settlements…');
    expect(preview).toContain('aria-busy={busy}');
    expect(preview).toContain('match_preview_started');
    expect(preview).toContain('match_preview_completed');
  });

  it('moves focus to the validation message so a mis-tap is not silent', () => {
    expect(preview).toContain('errorRef.current?.focus()');
    expect(preview).toContain('tabIndex={-1}');
    expect(preview).toContain('Choose yes or no to continue.');
    expect(preview).toContain('Pick your state to continue.');
  });

  it('sends the account CTAs to the dashboard list instead of a bare /signup', () => {
    expect(preview).toContain("const SIGNUP_FROM_PREVIEW_NEXT = '/dashboard?welcome=1&preview=1'");
    expect(preview).toContain('`/signup?next=${encodeURIComponent(SIGNUP_FROM_PREVIEW_NEXT)}`');
    expect(preview).not.toContain("return '/signup';");
    // A settlement-scoped preview still continues to that settlement.
    expect(preview).toContain('claimReturnPath(scope.slug)');
  });

  it('still asks the short preview question set', () => {
    expect(MATCH_PREVIEW_QUESTIONS.length).toBeGreaterThan(1);
    expect(MATCH_PREVIEW_QUESTIONS[0]?.key).toBe('state');
  });
});
