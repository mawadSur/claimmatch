'use client';

import { useState } from 'react';
import { ONE_CLICK_COPY } from '@/lib/copy';
import type { ClaimFilingView } from '@/lib/filing/v2/contract';
import { giveEsignConsent } from './filing-api';
import { FieldError, FormMessage, TickBox } from './ui';

const COPY = ONE_CLICK_COPY.esign;

/**
 * E-SIGN consent, asked once (per text version) before the member's first
 * electronic signature. The text is the server's (law-firm approved); the
 * member ticks the box themselves, then agrees.
 */
export function EsignConsent({
  view,
  busy,
  onAgreed,
}: {
  view: ClaimFilingView;
  busy: boolean;
  onAgreed: (message: string) => Promise<void>;
}) {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (view.esign.consented) return <FormMessage tone="success">{COPY.done}</FormMessage>;

  async function agree() {
    setError(null);
    if (!checked) {
      setError(COPY.tick);
      document.getElementById('filing-esign-consent')?.focus();
      return;
    }
    setSaving(true);
    const result = await giveEsignConsent(view.claim.id, view.esign.text_version);
    setSaving(false);
    if (!result.ok) {
      setError(result.error.error);
      return;
    }
    await onAgreed(COPY.done);
  }

  return (
    <section aria-labelledby="filing-esign-title" className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <h3 id="filing-esign-title" className="text-sm font-bold">
        {COPY.title}
      </h3>
      <div className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm leading-relaxed text-ink">
        {view.esign.text}
      </div>
      <p className="mt-1 text-xs text-ink-muted">{ONE_CLICK_COPY.review.version(view.esign.text_version)}</p>
      <TickBox
        id="filing-esign-consent"
        checked={checked}
        onChange={setChecked}
        disabled={busy || saving}
        describedBy={error ? 'filing-esign-error' : undefined}
        invalid={Boolean(error)}
      >
        {COPY.checkbox}
      </TickBox>
      <FieldError id="filing-esign-error" message={error} />
      <button type="button" className="btn-secondary mt-2" onClick={agree} disabled={busy || saving}>
        {saving ? COPY.saving : COPY.agree}
      </button>
    </section>
  );
}
