/* eslint-disable no-console */
/**
 * CI gate for runtime dependency advisories. Fails on every high or critical
 * advisory that `npm audit --omit=dev` reports, except the ones listed in
 * ALLOWED_ADVISORIES, so a new high advisory in next, react, @supabase/*,
 * resend or posthog-js fails the build.
 *
 *   npm audit --omit=dev --json > audit.json || true
 *   npx tsx scripts/audit-gate.ts audit.json
 *
 * A package that is vulnerable only through another one (npm lists the other
 * package's name in its `via`) is judged by that package's own advisories,
 * which npm reports in that package's own entry.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Known high advisories we accept for now, by GHSA id. next 15 pins postcss
 * 8.4.31 and only next 16 moves past it. Remove these once next is upgraded,
 * or once package.json overrides postcss under next.
 */
export const ALLOWED_ADVISORIES: ReadonlySet<string> = new Set([
  'GHSA-qx2v-qp2m-jg93', // postcss
  'GHSA-6g55-p6wh-862q', // postcss
  'GHSA-fxqj-rqcc-2cmp', // postcss
  'GHSA-r28c-9q8g-f849', // postcss
]);

const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

interface AdvisoryVia {
  source?: number;
  name?: string;
  title?: string;
  url?: string;
  severity?: string;
}

function ghsaId(url: string | undefined): string | null {
  const match = /GHSA(?:-[0-9a-z]{4}){3}/i.exec(url ?? '');
  return match ? match[0].toLowerCase().replace(/^ghsa/, 'GHSA') : null;
}

/**
 * The advisories in an `npm audit --json` report (npm 7 or later) that should
 * fail the build, one line each. Throws when the report is not one npm wrote
 * after a successful audit (for example when the registry could not be
 * reached), so the gate fails closed.
 */
export function blockingAdvisories(
  report: unknown,
  allowed: ReadonlySet<string> = ALLOWED_ADVISORIES,
): string[] {
  if (!report || typeof report !== 'object') {
    throw new Error('npm audit did not produce a JSON report');
  }
  const r = report as { error?: { summary?: string }; vulnerabilities?: unknown };
  if (r.error) {
    throw new Error(`npm audit failed: ${r.error.summary ?? 'unknown error'}`);
  }
  if (!r.vulnerabilities || typeof r.vulnerabilities !== 'object') {
    throw new Error('npm audit report has no "vulnerabilities" object (npm 7 or later is required)');
  }

  const problems: string[] = [];
  for (const [pkg, entry] of Object.entries(r.vulnerabilities as Record<string, unknown>)) {
    const via = (entry as { via?: unknown }).via;
    if (!Array.isArray(via)) continue;
    for (const item of via) {
      // A string names the package this one is vulnerable through; that
      // package's entry carries the advisories.
      if (typeof item === 'string' || !item || typeof item !== 'object') continue;
      const advisory = item as AdvisoryVia;
      const severity = String(advisory.severity ?? '').toLowerCase();
      if (!BLOCKING_SEVERITIES.has(severity)) continue;
      const id = ghsaId(advisory.url);
      if (id && allowed.has(id)) continue;
      problems.push(
        `${severity} in ${advisory.name ?? pkg}: ${advisory.title ?? 'untitled advisory'} (${advisory.url ?? id ?? 'no link'})`,
      );
    }
  }
  return problems;
}

function main(path: string | undefined): number {
  if (!path) {
    console.error('Usage: tsx scripts/audit-gate.ts <npm-audit-report.json>');
    return 2;
  }
  let problems: string[];
  try {
    problems = blockingAdvisories(JSON.parse(readFileSync(path, 'utf8')));
  } catch (err) {
    console.error(`audit-gate: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  if (problems.length > 0) {
    console.error('audit-gate: high or critical advisories in runtime dependencies:');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('Upgrade the package, or (only with a reason) add the GHSA id to ALLOWED_ADVISORIES.');
    return 1;
  }
  console.log(`audit-gate: no high or critical advisories outside the ${ALLOWED_ADVISORIES.size} allowed ones`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv[2]);
}
