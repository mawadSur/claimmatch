import { ShieldCheck } from 'lucide-react';
import { requireAdmin } from '@/lib/admin';
import { flags } from '@/lib/flags';
import { getStaffUser, type StaffUser } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { AdminNav, type AdminNavCounts } from '@/components/admin/AdminNav';
import { FilingNavLink } from '@/components/admin/filing/FilingNavLink';

/**
 * Admin area shell. Server-guards every /admin route: only signed-in admins get
 * past this, everyone else is bounced to login with a return path. With
 * ONE_CLICK_FILING_ENABLED on, staff who hold a filing role without being
 * admins (the law firm's legal_reviewer, desk filing_agent) also get past it,
 * with only the filing console link: every other /admin page still calls
 * requireAdmin itself, and every /admin/filing page calls requireStaff.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (flags.oneClickFiling()) {
    const staff = await getStaffUser();
    if (staff && !staff.isAdmin) return <FilingStaffShell staff={staff}>{children}</FilingStaffShell>;
  }
  const admin = await requireAdmin('/admin');

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
          {/* One-click filing console link; AdminNav already shows one when the legacy flag is on. */}
          {flags.oneClickFiling() && !flags.assistedFiling() ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <AdminNav counts={counts} />
              <FilingNavLink />
            </div>
          ) : (
            <AdminNav counts={counts} />
          )}
        </div>
      </div>

      <div className="container-page py-8 sm:py-10">{children}</div>
    </div>
  );
}

/** The shell for filing staff who are not admins: the filing console link only, no admin counts. */
function FilingStaffShell({ staff, children }: { staff: StaffUser; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-100 bg-white">
        <div className="container-page flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-lg font-extrabold leading-tight">Filing console</h1>
              <p className="text-xs text-ink-soft">{staff.email ?? 'Signed in'}</p>
            </div>
          </div>
          <FilingNavLink />
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
