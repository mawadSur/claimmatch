import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { getAdminUser } from '@/lib/admin';
import { AdminNav } from '@/components/admin/AdminNav';

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
          <AdminNav />
        </div>
      </div>

      <div className="container-page py-8 sm:py-10">{children}</div>
    </div>
  );
}
