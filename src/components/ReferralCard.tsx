'use client';

import { useState } from 'react';
import { Copy, Check, Gift } from 'lucide-react';
import { SITE } from '@/lib/utils';

export function ReferralCard({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);
  const link = code ? `${SITE.url}/r/${code}` : null;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — no-op; the link is visible to copy manually
    }
  }

  return (
    <div className="rounded-2xl border border-brand-100 bg-brand-50 p-6">
      <div className="flex items-center gap-2 text-brand-700">
        <Gift className="h-5 w-5" />
        <h2 className="text-lg font-bold">Invite friends, spread the payouts</h2>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Most people are owed money from the same settlements — the big data breaches hit
        tens of millions of us. Share your link and help someone claim what they’re owed.
      </p>

      {link ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="field-input flex-1 bg-white font-mono text-xs"
            aria-label="Your referral link"
          />
          <button onClick={copy} className="btn-primary shrink-0">
            {copied ? (
              <><Check className="h-4 w-4" /> Copied</>
            ) : (
              <><Copy className="h-4 w-4" /> Copy link</>
            )}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">
          Your referral link will appear here once your profile finishes setting up.
        </p>
      )}
    </div>
  );
}
