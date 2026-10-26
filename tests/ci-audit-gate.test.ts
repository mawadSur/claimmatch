import { describe, expect, it } from 'vitest';
import { blockingAdvisories } from '../scripts/audit-gate';

// Shaped like `npm audit --omit=dev --json` (npm 11) on this repo today.
function report(extra: Record<string, unknown> = {}) {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      postcss: {
        name: 'postcss',
        severity: 'high',
        via: [
          { source: 1117015, name: 'postcss', title: 'a', url: 'https://github.com/advisories/GHSA-qx2v-qp2m-jg93', severity: 'moderate' },
          { source: 1124252, name: 'postcss', title: 'b', url: 'https://github.com/advisories/GHSA-6g55-p6wh-862q', severity: 'high' },
          { source: 1130709, name: 'postcss', title: 'c', url: 'https://github.com/advisories/GHSA-fxqj-rqcc-2cmp', severity: 'moderate' },
          { source: 1139510, name: 'postcss', title: 'd', url: 'https://github.com/advisories/GHSA-r28c-9q8g-f849', severity: 'high' },
        ],
      },
      next: { name: 'next', severity: 'high', via: ['postcss'] },
      dompurify: {
        name: 'dompurify',
        severity: 'low',
        via: [{ name: 'dompurify', title: 'e', url: 'https://github.com/advisories/GHSA-p98j-92pf-mc4p', severity: 'low' }],
      },
      ...extra,
    },
  };
}

describe('audit gate', () => {
  it('passes the known postcss advisories and next through postcss', () => {
    expect(blockingAdvisories(report())).toEqual([]);
  });

  it('fails on a new high advisory in next itself', () => {
    const r = report();
    (r.vulnerabilities.next.via as unknown[]).push({
      name: 'next',
      title: 'Cache poisoning',
      url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
      severity: 'high',
    });
    expect(blockingAdvisories(r)).toEqual([
      'high in next: Cache poisoning (https://github.com/advisories/GHSA-aaaa-bbbb-cccc)',
    ]);
  });

  it('fails on a critical advisory in any runtime package and ignores moderate ones', () => {
    const problems = blockingAdvisories(
      report({
        resend: {
          name: 'resend',
          severity: 'critical',
          via: [{ name: 'resend', title: 'RCE', url: 'https://github.com/advisories/GHSA-1111-2222-3333', severity: 'critical' }],
        },
        zod: {
          name: 'zod',
          severity: 'moderate',
          via: [{ name: 'zod', title: 'ReDoS', url: 'https://github.com/advisories/GHSA-4444-5555-6666', severity: 'moderate' }],
        },
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^critical in resend: RCE/);
  });

  it('fails a high advisory with no GHSA link', () => {
    const problems = blockingAdvisories(
      report({ react: { name: 'react', severity: 'high', via: [{ name: 'react', title: 'x', severity: 'high' }] } }),
    );
    expect(problems).toEqual(['high in react: x (no link)']);
  });

  it('fails closed when npm could not audit', () => {
    expect(() => blockingAdvisories({ error: { code: 'ENOTFOUND', summary: 'getaddrinfo ENOTFOUND' } })).toThrow(
      /npm audit failed: getaddrinfo ENOTFOUND/,
    );
    expect(() => blockingAdvisories(null)).toThrow(/did not produce/);
    expect(() => blockingAdvisories({ advisories: {} })).toThrow(/no "vulnerabilities"/);
  });
});
