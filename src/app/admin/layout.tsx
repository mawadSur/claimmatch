import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { getAdminUser } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/server';
import { AdminNav, type AdminNavCounts } from '@/components/admin/AdminNav';

/**
 * Admin area shell. Server-guards every /admin route: only signed-in admins get
 * past this, everyone else is bounced to login with a return path.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminUser();
  if (!admin) redirect('/login?next=/admin');

  // Fetch counts for nav badges
  const counts = await getNavCounts();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-100 bg-white">
        <div className="container-page flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-lg font-extrabold leading-tight">
                Admin console
              </h1>
              <p className="text-xs text-ink-soft">{admin.email ?? 'Signed in'}</p>
            </div>
          </div>
          <AdminNav counts={counts} />
        </div>
      </div>

      <div className="container-page py-8 sm:py-10">{children}</div>
    </div>
  );
}

async function getNavCounts(): Promise<AdminNavCounts> {
  try {
    const svc = createServiceClient();
    const [pendingRes, payoutRes] = await Promise.all([
      svc
        .from('lawsuits')
        .select('*', { count: 'exact', head: true })
        .eq('review_status', 'pending_review'),
      svc
        .from('recoveries')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'awaiting_payout'),
    ]);
    return {
      pendingReview: pendingRes.count ?? 0,
      awaitingPayout: payoutRes.count ?? 0,
    };
  } catch {
    return { pendingReview: 0, awaitingPayout: 0 };
  }
}
