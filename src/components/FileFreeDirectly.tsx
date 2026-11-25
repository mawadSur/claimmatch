import { ExternalLink } from 'lucide-react';
import { FILE_FREE_DIRECTLY, lawsuitAiValueLine } from '@/lib/copy';
import { OfficialFormLink } from '@/components/settlement/OfficialFormLink';
import type { CatalogLink } from '@/lib/lawsuits';

/**
 * Honest “you can file free on the official site” callout for settlement pages.
 */
export function FileFreeDirectly({
  official,
  lawsuitId,
  slug,
}: {
  official: CatalogLink | null;
  lawsuitId: string;
  slug: string;
}) {
  const officialForm = official?.kind === 'official' ? official : null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold">File for free on the official site</h2>
      <p className="mt-2 leading-relaxed text-ink">{FILE_FREE_DIRECTLY}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{lawsuitAiValueLine()}</p>
      {officialForm ? (
        <OfficialFormLink
          href={officialForm.href}
          lawsuitId={lawsuitId}
          slug={slug}
          className="btn-secondary mt-4 inline-flex w-full justify-center sm:w-auto"
        >
          File on the official site <ExternalLink className="h-4 w-4" aria-hidden />
          <span className="sr-only"> (opens in a new tab)</span>
        </OfficialFormLink>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">
          We don’t have the official claim link yet. Use the site named in the
          settlement notice.
        </p>
      )}
    </div>
  );
}
