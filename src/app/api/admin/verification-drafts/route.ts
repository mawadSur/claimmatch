import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin';
import { flags } from '@/lib/flags';
import { isJsonRequest } from '@/lib/json-request';
import {
  listPendingVerificationDrafts,
  persistVerificationDrafts,
  reviewVerificationDraft,
} from '@/lib/verification-drafts-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PatchBody = z.object({
  id: z.string().uuid(),
  action: z.enum(['accept', 'reject', 'close', 'republish_verify']),
  notes: z.string().max(2000).optional(),
  fields: z
    .object({
      eligibility_verified: z.string().max(4000).nullable().optional(),
      proof_verified: z.string().max(20).nullable().optional(),
      administrator: z.string().max(200).nullable().optional(),
      deadline: z.string().max(10).nullable().optional(),
    })
    .optional(),
});

const PostBody = z.object({
  lawsuitId: z.string().uuid().optional(),
});

/**
 * GET — pending drafts (flag on). POST — run a fetch for one listing or a
 * small batch. PATCH — accept / reject / close / republish+verify. Admin only.
 * Never auto-closes. Never stamps verified_at without this human action.
 */
export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  if (!flags.verifyAssist()) {
    return NextResponse.json({ drafts: [], enabled: false });
  }
  const drafts = await listPendingVerificationDrafts();
  return NextResponse.json({ drafts, enabled: true });
}

export async function POST(req: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  if (!flags.verifyAssist()) {
    return NextResponse.json({ error: 'Verification drafts are turned off.' }, { status: 404 });
  }
  if (!isJsonRequest(req)) {
    return NextResponse.json({ error: 'JSON required.' }, { status: 415 });
  }
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Optional lawsuitId must be a uuid.' }, { status: 400 });
  }
  const summary = await persistVerificationDrafts({ lawsuitId: parsed.data.lawsuitId });
  return NextResponse.json({ ok: true, summary });
}

export async function PATCH(req: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  if (!flags.verifyAssist()) {
    return NextResponse.json({ error: 'Verification drafts are turned off.' }, { status: 404 });
  }
  if (!isJsonRequest(req)) {
    return NextResponse.json({ error: 'JSON required.' }, { status: 415 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A draft id and action is required.' }, { status: 400 });
  }
  const result = await reviewVerificationDraft({
    id: parsed.data.id,
    action: parsed.data.action,
    adminId: admin.id,
    fields: parsed.data.fields,
    notes: parsed.data.notes ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }
  return NextResponse.json({ ok: true, lawsuit: result.lawsuit ?? null });
}
