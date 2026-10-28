import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminUser } from '@/lib/admin';
import { flags } from '@/lib/flags';
import { listPendingEligibilityDrafts, reviewEligibilityDraft } from '@/lib/eligibility-drafts-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchBody = z.object({
  id: z.string().uuid(),
  action: z.enum(['approve', 'reject']),
  notes: z.string().max(2000).optional(),
});

export async function GET() {
  if (!(await getAdminUser())) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  if (!flags.eligibilityDrafts()) {
    return NextResponse.json({ drafts: [], enabled: false });
  }
  const drafts = await listPendingEligibilityDrafts();
  return NextResponse.json({ drafts, enabled: true });
}

export async function PATCH(req: Request) {
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }
  if (!flags.eligibilityDrafts()) {
    return NextResponse.json({ error: 'Eligibility drafts are turned off.' }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A draft id and approve or reject is required.' }, { status: 400 });
  }
  const result = await reviewEligibilityDraft({
    id: parsed.data.id,
    action: parsed.data.action,
    reviewerId: admin.id,
    notes: parsed.data.notes ?? null,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
