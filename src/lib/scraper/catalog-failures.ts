/**
 * Per-row catalog read/write failures stored on the ingest jobs row.
 * Cap the sample so a bad night cannot bloat jsonb. Never store secrets or
 * personal data — slug/id, operation, and the Postgres/PostgREST code+message.
 */

export const FAILURE_SAMPLE_CAP = 20;
export const FAILURE_MESSAGE_MAX = 300;

export type CatalogOperation =
  | 'insert'
  | 'update'
  | 'read_open'
  | 'read_existing'
  | 'read_source'
  | 'write_source';

export interface CatalogFailureSample {
  operation: CatalogOperation;
  slug?: string;
  id?: string;
  code?: string;
  message: string;
}

export interface CatalogWriteError {
  code?: string;
  message?: string;
}

const JWT = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+/g;
const BEARER = /Bearer\s+\S+/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const DB_URL = /postgres(?:ql)?:\/\/\S+/gi;
const KEYISH = /(?:service_role|SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|CRON_SECRET)\s*[:=]\s*\S+/gi;

/** Strip credentials and cap length so a jobs row is safe to show on /admin. */
export function sanitizeCatalogFailureMessage(raw: string): string {
  let text = raw
    .replace(BEARER, 'Bearer [redacted]')
    .replace(JWT, '[redacted-jwt]')
    .replace(DB_URL, '[redacted-db-url]')
    .replace(KEYISH, '[redacted]')
    .replace(EMAIL, '[redacted-email]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) text = 'unknown error';
  if (text.length > FAILURE_MESSAGE_MAX) {
    return `${text.slice(0, FAILURE_MESSAGE_MAX - 3)}...`;
  }
  return text;
}

export function catalogFailureFromError(
  error: CatalogWriteError | null | undefined,
  context: { operation: CatalogOperation; slug?: string; id?: string },
): CatalogFailureSample {
  const sample: CatalogFailureSample = {
    operation: context.operation,
    message: sanitizeCatalogFailureMessage(error?.message || 'unknown error'),
  };
  if (context.slug) sample.slug = context.slug;
  if (context.id) sample.id = context.id;
  if (error?.code) sample.code = String(error.code);
  return sample;
}

/** Append one sample while the list is under the cap. Mutates and returns it. */
export function pushCatalogFailure(
  samples: CatalogFailureSample[],
  failure: CatalogFailureSample,
  cap: number = FAILURE_SAMPLE_CAP,
): CatalogFailureSample[] {
  if (samples.length >= cap) return samples;
  samples.push(failure);
  return samples;
}

/**
 * Record a failed catalog write (or a mocked one in tests). The missing-column
 * case (Postgres 42703) is the Nov 2025 ingest failure mode: code writes
 * lawsuits.tags before that column exists on the target database.
 */
export function recordCatalogWriteFailure(
  target: { failed: number; failureSamples: CatalogFailureSample[] },
  error: CatalogWriteError | null | undefined,
  context: { operation: CatalogOperation; slug?: string; id?: string },
): CatalogFailureSample {
  target.failed += 1;
  const sample = catalogFailureFromError(error, context);
  pushCatalogFailure(target.failureSamples, sample);
  return sample;
}

/**
 * One insert or update against lawsuits. Used by the ingest write loop and by
 * the regression test that reproduces a write against a missing column.
 */
export async function writeLawsuitRow(
  client: { from: (table: string) => Record<string, unknown> },
  write:
    | { operation: 'insert'; slug: string; id?: string; row: object }
    | { operation: 'update'; slug: string; id: string; patch: Record<string, unknown> },
): Promise<{ error: CatalogWriteError | null }> {
  const table = client.from('lawsuits') as {
    insert: (row: object) => PromiseLike<{ error: CatalogWriteError | null }>;
    update: (patch: object) => {
      eq: (col: string, value: string) => PromiseLike<{ error: CatalogWriteError | null }>;
    };
  };
  if (write.operation === 'insert') {
    const { error } = await table.insert(write.row);
    return { error };
  }
  const { error } = await table.update(write.patch).eq('id', write.id);
  return { error };
}
