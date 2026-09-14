import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Library } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/admin';
import type { Lawsuit } from '@/lib/types';
import { CatalogTable } from '@/components/admin/CatalogTable';

export const metadata: Metadata = { title: 'Catalog' };

export const dynamic = 'force-dynamic';

/**
 * Full settlement catalog across every review state (100 newest). Admins can
 * feature/unfeature and publish/unpublish inline.
 */
export default async function AdminCatalogPage() {
  if (!(await getAdminUser())) redirect('/login?next=/admin/catalog');
  const svc = createServiceClient();

  let rows: Lawsuit[] = [];
  try {
    const { data } = await svc
      .from('lawsuits')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    rows = (data ?? []) as Lawsuit[];
  } catch {
    rows = [];
  }

  return (
    <div className="space-y-6">
      <header>
        <span className="badge-brand gap-1.5">
          <Library className="h-3.5 w-3.5" /> Full catalog
        </span>
        <h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">
          Settlement catalog
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          The 100 newest settlements across every review state. Feature the best
          ones for the homepage; unpublish anything that shouldn&rsquo;t be live.
          Account holders see published settlements and we file claims on their
          behalf.
        </p>
      </header>

      <CatalogTable rows={rows} />
    </div>
  );
}
