import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Link2 } from 'lucide-react';
import { getAdminUser } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/server';
import { ShareLinksManager } from '@/components/admin/ShareLinksManager';
import type { ShareLinkStats } from '@/lib/share-links';

export const metadata: Metadata = { title: 'Share links' };
export const dynamic = 'force-dynamic';

export default async function AdminShareLinksPage() {
  if (!(await getAdminUser())) redirect('/login?next=/admin/share-links');
  const svc = createServiceClient();

  let items: ShareLinkStats[] = [];
  try {
    const { data: links } = await svc
      .from('share_links')
      .select('id, code, destination, utm_source, utm_medium, utm_campaign, utm_content, label, created_at')
      .order('created_at', { ascending: false });
    const rows = (links ?? []) as Array<{
      id: string;
      code: string;
      destination: string | null;
      utm_source: string | null;
      utm_medium: string | null;
      utm_campaign: string | null;
      utm_content: string | null;
      label: string | null;
      created_at: string;
    }>;
    const codes = rows.map((r) => r.code);
    const clicksByCode = new Map<string, number>();
    const signupsByCode = new Map<string, number>();
    if (codes.length > 0) {
      const [{ data: clicks }, { data: signups }] = await Promise.all([
        svc.from('share_link_clicks').select('code').in('code', codes),
        svc.from('profiles').select('first_ref').in('first_ref', codes),
      ]);
      for (const row of (clicks ?? []) as Array<{ code: string }>) {
        clicksByCode.set(row.code, (clicksByCode.get(row.code) ?? 0) + 1);
      }
      for (const row of (signups ?? []) as Array<{ first_ref: string | null }>) {
        if (row.first_ref) {
          signupsByCode.set(row.first_ref, (signupsByCode.get(row.first_ref) ?? 0) + 1);
        }
      }
    }
    items = rows.map((r) => ({
      id: r.id,
      code: r.code,
      destination: r.destination || '/',
      utm_source: r.utm_source,
      utm_medium: r.utm_medium,
      utm_campaign: r.utm_campaign,
      utm_content: r.utm_content,
      label: r.label,
      created_at: r.created_at,
      clicks: clicksByCode.get(r.code) ?? 0,
      signups: signupsByCode.get(r.code) ?? 0,
    }));
  } catch {
    items = [];
  }

  return (
    <div className="space-y-6">
      <header>
        <span className="badge-brand gap-1.5">
          <Link2 className="h-3.5 w-3.5" /> Tracked links
        </span>
        <h2 className="mt-2 text-2xl font-extrabold">Share links</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Create campaign URLs with UTMs and a ref code. The short path{' '}
          <span className="font-mono text-xs">/r/code</span> logs the click and
          redirects with those parameters so signup still gets first-touch
          attribution. Clicks come from{' '}
          <span className="font-mono text-xs">share_link_clicks</span>; signups
          from <span className="font-mono text-xs">profiles.first_ref</span>.
        </p>
      </header>
      <ShareLinksManager initialLinks={items} />
    </div>
  );
}
