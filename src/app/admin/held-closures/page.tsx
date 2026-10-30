import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { flags } from '@/lib/flags';
import { listHeldClosureQueue } from '@/lib/held-closures';
import { HeldClosuresQueue } from '@/components/admin/HeldClosuresQueue';

export const metadata: Metadata = { title: 'Held closures' };
export const dynamic = 'force-dynamic';

export default async function HeldClosuresPage() {
  await requireAdmin('/admin/held-closures');
  if (!flags.adminHeldClosures()) notFound();
  const items = await listHeldClosureQueue();

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-extrabold">Held closures</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Closures the nightly ingest held because they exceeded the close-share
          limit. Approving applies only that close. Dismissed slugs stay off this
          list until the planned change is different. Nothing is auto-closed.
        </p>
      </header>
      <HeldClosuresQueue items={items} />
    </div>
  );
}
