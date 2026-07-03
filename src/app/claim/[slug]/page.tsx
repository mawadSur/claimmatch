import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, FileText, ShieldCheck, ListChecks } from 'lucide-react';
import { getLawsuitBySlug } from '@/lib/lawsuits';
import { createClient } from '@/lib/supabase/server';
import { ClaimForm } from '@/components/ClaimForm';
import type { Profile } from '@/lib/types';

export const metadata: Metadata = { title: 'File your claim' };

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let userId: string | null = null;
  let profile: Profile | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      profile = (data as Profile | null) ?? null;
    }
  } catch {
    userId = null;
  }

  if (!userId) redirect(`/login?next=/claim/${slug}`);

  const lawsuit = await getLawsuitBySlug(slug);
  if (!lawsuit) notFound();

  return (
    <section className="container-narrow py-12">
      <Link
        href={`/lawsuits/${lawsuit.slug}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to settlement
      </Link>

      <span className="badge-brand mt-5">{lawsuit.category}</span>
      <h1 className="mt-3 text-3xl font-extrabold leading-tight">File your claim</h1>
      <p className="mt-2 text-lg font-semibold text-brand-700">{lawsuit.title}</p>

      <div className="mt-6 rounded-2xl border border-gray-100 bg-gray-50 p-5">
        <h2 className="text-sm font-bold">What happens when you file</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-muted">
          <li className="flex items-start gap-2">
            <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            We record your claim and give you a receipt number to track it from
            your dashboard.
          </li>
          <li className="flex items-start gap-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            We pre-fill the details the official claim form asks for, using your
            profile.
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            You finish and submit on the settlement administrator’s official site.
            ClaimMatch is not a law firm.
          </li>
        </ul>
      </div>

      <div className="mt-8">
        <ClaimForm lawsuit={lawsuit} profile={profile} />
      </div>
    </section>
  );
}
