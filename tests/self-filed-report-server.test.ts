import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    user_id: string;
    lawsuit_id: string;
    claim_id: string;
    confirmation_storage_path: string | null;
    confirmation_mime: string | null;
    confirmation_bytes: number | null;
  }>,
  removed: [] as string[],
  signed: [] as string[],
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table !== 'self_filed_reports') throw new Error(table);
      return {
        select: () => ({
          eq: (column: string, value: unknown) => ({
            maybeSingle: async () => ({
              data: h.rows.find((row) => (row as Record<string, unknown>)[column] === value) ?? null,
              error: null,
            }),
          }),
        }),
        update: (patch: Record<string, unknown>) => ({
          eq: (c1: string, v1: unknown) => ({
            eq: (c2: string, v2: unknown) => ({
              select: () => ({
                maybeSingle: async () => {
                  const row = h.rows.find(
                    (r) => (r as Record<string, unknown>)[c1] === v1 && (r as Record<string, unknown>)[c2] === v2,
                  );
                  if (!row) return { data: null, error: { code: 'PGRST116' } };
                  Object.assign(row, patch);
                  return { data: row, error: null };
                },
              }),
            }),
          }),
        }),
      };
    },
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          h.removed.push(...paths);
          return { error: null };
        },
        createSignedUploadUrl: async (path: string) => {
          h.signed.push(path);
          return { data: { signedUrl: `https://upload.example/${path}` }, error: null };
        },
      }),
    },
  }),
}));

import { createSelfFiledScreenshotSlot, deleteSelfFiledScreenshot } from '@/lib/self-filed-report-server';

const LAWSUIT = '00000000-0000-4000-8000-0000000000a1';
const REPORT = '00000000-0000-4000-8000-0000000000b1';
const OWNER = '00000000-0000-4000-8000-0000000000c1';
const OTHER = '00000000-0000-4000-8000-0000000000d1';

const owned = {
  id: REPORT,
  user_id: OWNER,
  lawsuit_id: LAWSUIT,
  claim_id: 'c1',
  confirmation_storage_path: null as string | null,
  confirmation_mime: null as string | null,
  confirmation_bytes: null as number | null,
};

beforeEach(() => {
  h.rows = [];
  h.removed = [];
  h.signed = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('self-filed screenshot slot', () => {
  it('404s when the flag is off', async () => {
    h.rows = [{ ...owned }];
    const out = await createSelfFiledScreenshotSlot({
      userId: OWNER,
      reportId: REPORT,
      mime: 'image/png',
      bytes: 12,
    });
    expect(out).toMatchObject({ ok: false, status: 404 });
    expect(h.signed).toEqual([]);
  });

  it('404s for another user’s report and never signs an upload', async () => {
    vi.stubEnv('SELF_FILED_REPORT_ENABLED', '1');
    h.rows = [{ ...owned }];
    const out = await createSelfFiledScreenshotSlot({
      userId: OTHER,
      reportId: REPORT,
      mime: 'image/png',
      bytes: 12,
    });
    expect(out).toMatchObject({ ok: false, status: 404 });
    expect(h.signed).toEqual([]);
  });

  it('refuses a disallowed type or a file over 10 MB before talking to storage', async () => {
    vi.stubEnv('SELF_FILED_REPORT_ENABLED', '1');
    h.rows = [{ ...owned }];
    expect(
      await createSelfFiledScreenshotSlot({ userId: OWNER, reportId: REPORT, mime: 'application/zip', bytes: 12 }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await createSelfFiledScreenshotSlot({
        userId: OWNER,
        reportId: REPORT,
        mime: 'image/png',
        bytes: 10 * 1024 * 1024 + 1,
      }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(h.signed).toEqual([]);
  });

  it('returns a signed upload URL for the owner on an allowed image', async () => {
    vi.stubEnv('SELF_FILED_REPORT_ENABLED', '1');
    h.rows = [{ ...owned }];
    const out = await createSelfFiledScreenshotSlot({
      userId: OWNER,
      reportId: REPORT,
      mime: 'image/png',
      bytes: 12,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.upload.signed_url).toContain(OWNER);
    expect(out.report.hasScreenshot).toBe(true);
    expect(h.signed[0]).toBe(`${OWNER}/${REPORT}/confirmation.png`);
  });

  it('lets the owner delete their screenshot', async () => {
    vi.stubEnv('SELF_FILED_REPORT_ENABLED', '1');
    h.rows = [
      {
        ...owned,
        confirmation_storage_path: `${OWNER}/${REPORT}/confirmation.png`,
        confirmation_mime: 'image/png',
        confirmation_bytes: 12,
      },
    ];
    const out = await deleteSelfFiledScreenshot({ userId: OWNER, reportId: REPORT });
    expect(out.ok).toBe(true);
    expect(h.removed).toEqual([`${OWNER}/${REPORT}/confirmation.png`]);
    if (!out.ok) return;
    expect(out.report.hasScreenshot).toBe(false);
  });

  it('404s when another user tries to delete the screenshot', async () => {
    vi.stubEnv('SELF_FILED_REPORT_ENABLED', '1');
    h.rows = [
      {
        ...owned,
        confirmation_storage_path: `${OWNER}/${REPORT}/confirmation.png`,
        confirmation_mime: 'image/png',
        confirmation_bytes: 12,
      },
    ];
    const out = await deleteSelfFiledScreenshot({ userId: OTHER, reportId: REPORT });
    expect(out).toMatchObject({ ok: false, status: 404 });
    expect(h.removed).toEqual([]);
  });
});
