/* eslint-disable no-console */
/**
 * Read-only repeatable scan of catalog claim URLs vs the curated action types.
 *
 *   npx tsx scripts/claim-site-audit.ts
 *
 * Fetches each official URL (HEAD then GET) and prints whether the live page
 * still looks like the stored action_type. Never submits a form, never writes
 * to Supabase. Network failures are reported, not guessed.
 */
import { CLAIM_ACTION_CATALOG } from '../src/lib/claim-action-catalog';

const UA =
  'Mozilla/5.0 (compatible; LawsuitAI-claim-site-audit/1.0; +https://lawsuitai.org)';

function looksLikeLogin(text: string): boolean {
  return /loginid|claim form login|unique id and pin|claim number and pin|confirmation code|notice id|noticeid/i.test(text);
}

function looksLikeSubmit(text: string): boolean {
  return /submit(\s+a)?\s+claim|file(\s+a)?\s+claim|claim form/i.test(text);
}

async function probe(url: string): Promise<{ status: number | null; hints: string[]; error?: string }> {
  const hints: string[] = [];
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html' },
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    const slice = text.slice(0, 80_000);
    if (looksLikeLogin(slice)) hints.push('login_or_notice_id');
    if (looksLikeSubmit(slice)) hints.push('claim_form_copy');
    if (/recaptcha|hcaptcha|captcha/i.test(slice)) hints.push('captcha');
    if (res.status >= 400) hints.push(`http_${res.status}`);
    return { status: res.status, hints };
  } catch (error) {
    return { status: null, hints, error: error instanceof Error ? error.message : 'fetch failed' };
  }
}

async function main() {
  const limit = Number(process.env.AUDIT_LIMIT ?? CLAIM_ACTION_CATALOG.length);
  const rows = CLAIM_ACTION_CATALOG.filter((r) => r.claim_url).slice(0, limit);
  console.log(`# claim-site-audit ${new Date().toISOString()} (${rows.length} urls)`);
  for (const row of rows) {
    const result = await probe(row.claim_url!);
    console.log(
      JSON.stringify({
        slug: row.slug,
        action_type: row.action_type,
        audit_bucket: row.audit_bucket,
        url: row.claim_url,
        status: result.status,
        hints: result.hints,
        error: result.error ?? null,
      }),
    );
  }
}

if (process.argv[1] && process.argv[1].includes('claim-site-audit')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { probe, looksLikeLogin, looksLikeSubmit };
