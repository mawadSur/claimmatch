import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { logAdminAccess } from '@/lib/admin-access';
import { flags } from '@/lib/flags';
import { createServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!flags.profileV2()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  const admin = await getAdminUser();
  if (!admin) {
    return NextResponse.json({ error: 'Admin only.' }, { status: 403 });
  }
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing user.' }, { status: 400 });

  await logAdminAccess({
    adminId: admin.id,
    action: 'reveal',
    targetUserId: id,
    path: `/admin/users/${id}`,
  });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('profiles')
    .select('full_name, email, phone')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }
  return NextResponse.json({
    full_name: data.full_name ?? null,
    email: data.email ?? null,
    phone: data.phone ?? null,
  });
}
