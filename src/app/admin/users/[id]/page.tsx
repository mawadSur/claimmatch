import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { logAdminAccess, maskEmail, maskName, maskPhone } from '@/lib/admin-access';
import { flags } from '@/lib/flags';
import { PROFILE_FACT_LABELS } from '@/lib/profile-facts';
import { createServiceClient } from '@/lib/supabase/server';
import type { ProfileFactType } from '@/lib/types';
import { RevealContact } from '@/components/admin/RevealContact';

export const metadata: Metadata = { title: 'User detail' };
export const dynamic = 'force-dynamic';

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!flags.profileV2()) notFound();
  const { id } = await params;
  const admin = await requireAdmin(`/admin/users/${id}`);
  await logAdminAccess({
    adminId: admin.id,
    action: 'detail',
    targetUserId: id,
    path: `/admin/users/${id}`,
  });

  const svc = createServiceClient();
  const [{ data: profile }, { data: facts }, { data: matches }, { data: claims }] = await Promise.all([
    svc.from('profiles').select('*').eq('id', id).maybeSingle(),
    svc
      .from('profile_facts')
      .select('id, type, value, start_date, end_date, source, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: true }),
    svc
      .from('matches')
      .select('id, score, reasons, dismissed, created_at, lawsuit:lawsuits(title, slug)')
      .eq('user_id', id)
      .order('score', { ascending: false }),
    svc
      .from('claims')
      .select('id, lawsuit_title, status, created_at, confirmation_number')
      .eq('user_id', id)
      .order('created_at', { ascending: false }),
  ]);

  if (!profile) notFound();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-ink-muted">
          <Link href="/admin/users" className="font-semibold text-brand-700 underline">
            Users
          </Link>
          <span aria-hidden> / </span>
          Detail
        </p>
        <h2 className="mt-3 text-2xl font-extrabold">{maskName(profile.full_name) ?? 'Account'}</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Contact is masked until you reveal it. Reveal is logged.
        </p>
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
        <h3 className="text-lg font-bold">Profile</h3>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">Name</dt>
            <dd className="font-semibold">{maskName(profile.full_name) ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Email</dt>
            <dd className="font-semibold">{maskEmail(profile.email) ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Phone</dt>
            <dd className="font-semibold">{maskPhone(profile.phone) ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">State</dt>
            <dd className="font-semibold">{profile.state ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Onboarded</dt>
            <dd className="font-semibold">{profile.onboarded ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Email alerts</dt>
            <dd className="font-semibold">{profile.email_opt_in ? 'On' : 'Off'}</dd>
          </div>
        </dl>
        <RevealContact userId={id} />
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
        <h3 className="text-lg font-bold">Profile facts</h3>
        {(facts ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No structured facts.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 text-sm">
            {(facts ?? []).map((fact: {
              id: string;
              type: string;
              value: string;
              start_date: string | null;
              end_date: string | null;
            }) => (
              <li key={fact.id} className="py-2">
                <span className="font-semibold">
                  {PROFILE_FACT_LABELS[fact.type as ProfileFactType] ?? fact.type}
                </span>
                {': '}
                {fact.value}
                {fact.start_date || fact.end_date
                  ? ` (${fact.start_date ?? '?'} – ${fact.end_date ?? '?'})`
                  : ''}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
        <h3 className="text-lg font-bold">Matches</h3>
        {(matches ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No stored matches.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 text-sm">
            {(matches ?? []).map((match: {
              id: string;
              score: number;
              reasons: string[] | null;
              dismissed: boolean;
              lawsuit: { title?: string; slug?: string } | { title?: string; slug?: string }[] | null;
            }) => {
              const lawsuit = Array.isArray(match.lawsuit) ? match.lawsuit[0] : match.lawsuit;
              return (
                <li key={match.id} className="py-2">
                  <span className="font-semibold">{lawsuit?.title ?? 'Settlement'}</span>
                  <span className="text-ink-muted">
                    {' '}
                    · score {Number(match.score).toFixed(2)}
                    {match.dismissed ? ' · dismissed' : ''}
                  </span>
                  {Array.isArray(match.reasons) && match.reasons.length > 0 && (
                    <p className="mt-1 text-ink-muted">{match.reasons.join(' · ')}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
        <h3 className="text-lg font-bold">Claims</h3>
        {(claims ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No claims tracked.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 text-sm">
            {(claims ?? []).map((claim: { id: string; lawsuit_title: string; status: string }) => (
              <li key={claim.id} className="py-2">
                <span className="font-semibold">{claim.lawsuit_title}</span>
                <span className="text-ink-muted"> · {claim.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
