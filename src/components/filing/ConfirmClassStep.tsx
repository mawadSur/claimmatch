'use client';

import { useState } from 'react';
import { ONE_CLICK_COPY } from '@/lib/copy';
import type { ClaimFilingView } from '@/lib/filing/v2/contract';
import { ExternalTextLink } from './claim-flow-parts';
import type { FilingResult } from './filing-api';
import type { PacketPatch } from './packet-form';
import { FormMessage, TickBox } from './ui';

const COPY = ONE_CLICK_COPY.confirm;

/**
 * Step 1: the settlement's own class definition, word for word, a link to
 * the official site, and "This describes me", which only the member ticks
 * (it starts from what they saved; Lawsuit AI never ticks it).
 */
export function ConfirmClassStep({
  view,
  busy,
  save,
}: {
  view: ClaimFilingView;
  busy: boolean;
  save: (patch: PacketPatch) => Promise<FilingResult<ClaimFilingView>>;
}) {
  const packet = view.packet;
  const spec = packet?.spec;
  const saved = packet?.choices.class_definition_confirmed ?? false;
  const [checked, setChecked] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  if (!packet || !spec) return null;
  const locked = packet.status !== 'open' || !view.actions.can_edit;
  const official = spec.official_form_url || view.settlement.official_url;

  async function toggle(next: boolean) {
    setChecked(next);
    setError(null);
    const result = await save({ class_definition_confirmed: next });
    if (!result.ok) {
      setChecked(!next);
      setError(result.error.error);
    }
  }

  return (
    <div className="mt-2">
      <p className="text-sm leading-relaxed text-ink-muted">{COPY.intro}</p>
      <blockquote className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border-l-4 border-brand-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed text-ink">
        {spec.class_definition.text}
      </blockquote>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <ExternalTextLink href={spec.class_definition.source_url}>{COPY.source}</ExternalTextLink>
        {official && official !== spec.class_definition.source_url ? (
          <ExternalTextLink href={official}>{spec.form_title ?? COPY.officialForm}</ExternalTextLink>
        ) : null}
      </p>
      <div className="mt-3">
        <TickBox id="filing-class-definition" checked={checked} onChange={toggle} disabled={busy || locked}>
          <span className="font-semibold">{COPY.checkbox}</span>
        </TickBox>
      </div>
      <p className="text-sm leading-relaxed text-ink-muted">{COPY.warning}</p>
      {error && <FormMessage tone="error">{error}</FormMessage>}
    </div>
  );
}
