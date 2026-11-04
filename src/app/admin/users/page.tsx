import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Users } from 'lucide-react';
import { requireAdmin } from '@/lib/admin';
import { logAdminAccess, maskEmail, maskName } from '@/lib/admin-access';
import { flags } from '@/lib/flags';
import { createServiceClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Users' };
export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  if (!flags.profileV2()) notFound();
  const admin = await requireAdmin('/admin/users');
  await logAdminAccess({ adminId: admin.id, action: 'list', path: '/admin/users' });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('profiles')
    .select('id, email, full_name, state, onboarded, email_opt_in, created_at, is_internal')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <span className="badge-brand gap-1.5">
          <Users className="h-3.5 w-3.5" aria-hidden /> Users
        </span>
        <h2 className="mt-3 text-2xl font-extrabold">People with accounts</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Contact details are masked. Opening a record or revealing an email is
          written to the admin access log.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-danger-50 bg-white p-4 text-sm">
          We couldn&rsquo;t load users right now.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">State</th>
                <th className="px-4 py-3 font-semibold">Onboarded</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data ?? []).map((row: {
                id: string;
                email: string | null;
                full_name: string | null;
                state: string | null;
                onboarded: boolean;
                email_opt_in: boolean;
                created_at: string;
                is_internal?: boolean | null;
              }) => (
                <tr key={row.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/users/${row.id}`}
                      className="font-semibold text-brand-700 underline hover:text-brand-800"
                    >
                      {maskName(row.full_name) ?? '—'}
                    </Link>
                    {row.is_internal ? (
                      <span className="ml-2 text-xs text-ink-muted">internal</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{maskEmail(row.email) ?? '—'}</td>
                  <td className="px-4 py-3">{row.state ?? '—'}</td>
                  <td className="px-4 py-3">{row.onboarded ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {row.created_at ? new Date(row.created_at).toLocaleDateString('en-US') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(data ?? []).length === 0 && (
            <p className="p-4 text-sm text-ink-muted">No accounts yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
