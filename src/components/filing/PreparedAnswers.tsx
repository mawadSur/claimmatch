'use client';

import { useState } from 'react';
import { Copy } from 'lucide-react';
import { ONE_CLICK_COPY } from '@/lib/copy';
import type { ClaimFilingView } from '@/lib/filing/v2/contract';
import { displayValue } from './packet-form';

const COPY = ONE_CLICK_COPY.prepared;

/**
 * The self-file copy panel for a claim prepared in Lawsuit AI: the
 * settlement's questions and choices with the member's answers, in the
 * official form's order, each with a copy button. Contact details stay in
 * PrefillPacket below it. Nothing here is sent anywhere.
 */
export function PreparedAnswers({ view }: { view: ClaimFilingView }) {
  const [copied, setCopied] = useState<string | null>(null);
  const stored = (path: string) =>
    view.packet?.items.find((item) => item.path === path)?.proof?.documents.filter((d) => d.status === 'stored').length ?? 0;
  const answered = (view.packet?.items ?? []).filter((item) =>
    item.kind === 'member' ? false : item.kind === 'document' ? stored(item.path) > 0 : displayValue(item) !== ONE_CLICK_COPY.need.empty,
  );
  if (answered.length === 0) return null;

  async function copy(path: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(path);
      window.setTimeout(() => setCopied((current) => (current === path ? null : current)), 1600);
    } catch {
      setCopied(null);
    }
  }

  return (
    <section aria-labelledby="prepared-answers" className="mt-5 rounded-xl border border-gray-100 bg-gray-50/80 p-4">
      <h3 id="prepared-answers" className="text-sm font-bold">
        {COPY.title}
      </h3>
      <p className="mt-1 text-sm text-ink-muted">{COPY.intro}</p>
      <dl className="mt-3 space-y-3">
        {answered.map((item) => {
          const text = item.kind === 'document' ? COPY.files(stored(item.path)) : displayValue(item);
          return (
            <div key={item.path} className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <dt className="text-xs font-semibold text-ink-muted">{item.label}</dt>
                <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-ink">{text}</dd>
              </div>
              {item.kind !== 'document' && (
                <button
                  type="button"
                  className="btn-secondary shrink-0 !px-3 !py-2 text-xs"
                  onClick={() => copy(item.path, text)}
                  aria-label={`${COPY.copy}: ${item.label}`}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {copied === item.path ? COPY.copied : COPY.copy}
                </button>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
