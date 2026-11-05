import { describe, expect, it } from 'vitest';
import {
  catalogFailureFromError,
  FAILURE_SAMPLE_CAP,
  pushCatalogFailure,
  recordCatalogWriteFailure,
  sanitizeCatalogFailureMessage,
  writeLawsuitRow,
} from '@/lib/scraper/catalog-failures';

describe('catalog failure samples', () => {
  it('redacts secrets, emails, and long messages', () => {
    const raw =
      'Bearer secret-token column tags failed for user ops@example.com ' +
      'postgres://user:pass@db.internal/claimmatch ' +
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb ' +
      'x'.repeat(400);
    const cleaned = sanitizeCatalogFailureMessage(raw);
    expect(cleaned).toContain('Bearer [redacted]');
    expect(cleaned).toContain('[redacted-email]');
    expect(cleaned).toContain('[redacted-db-url]');
    expect(cleaned).toContain('[redacted-jwt]');
    expect(cleaned).not.toMatch(/secret-token|ops@example.com|postgres:\/\//);
    expect(cleaned.length).toBeLessThanOrEqual(300);
  });

  it('caps the stored sample at 20', () => {
    const samples: ReturnType<typeof catalogFailureFromError>[] = [];
    for (let i = 0; i < 25; i += 1) {
      pushCatalogFailure(
        samples,
        catalogFailureFromError({ code: '42703', message: `row ${i}` }, { operation: 'update', slug: `s${i}` }),
      );
    }
    expect(samples).toHaveLength(FAILURE_SAMPLE_CAP);
    expect(samples[0].slug).toBe('s0');
    expect(samples[19].slug).toBe('s19');
  });
});

describe('write against a missing column', () => {
  it('records the Postgres 42703 from a tags write', async () => {
    const missing = {
      code: '42703',
      message: 'column "tags" of relation "lawsuits" does not exist',
    };
    const client = {
      from: () => ({
        insert: async (row: Record<string, unknown>) =>
          'tags' in row ? { error: missing } : { error: null },
        update: (patch: Record<string, unknown>) => ({
          eq: async () => ('tags' in patch ? { error: missing } : { error: null }),
        }),
      }),
    };

    const { error } = await writeLawsuitRow(client, {
      operation: 'update',
      slug: 'acme-breach',
      id: '11111111-1111-4111-8111-111111111111',
      patch: { tags: { brands: ['acme'] }, status: 'open' },
    });
    expect(error).toEqual(missing);

    const summary = { failed: 0, failureSamples: [] as ReturnType<typeof catalogFailureFromError>[] };
    const sample = recordCatalogWriteFailure(summary, error, {
      operation: 'update',
      slug: 'acme-breach',
      id: '11111111-1111-4111-8111-111111111111',
    });

    expect(summary.failed).toBe(1);
    expect(summary.failureSamples).toHaveLength(1);
    expect(sample).toMatchObject({
      operation: 'update',
      slug: 'acme-breach',
      id: '11111111-1111-4111-8111-111111111111',
      code: '42703',
    });
    expect(sample.message).toMatch(/column "tags"/);
    expect(JSON.stringify(sample)).not.toMatch(/service.role|secret|eyJ/);
  });
});
