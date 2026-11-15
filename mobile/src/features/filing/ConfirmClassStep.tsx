import type { ClaimFilingView } from '@shared/lib/filing/v2/contract';
import { useState } from 'react';
import { View } from 'react-native';

import { CheckboxRow } from '@/components/ui';
import { filing as copy } from '@/copy/filing';
import { ExternalTextLink } from '@/features/shared';
import { toSafeWebUrl } from '@/lib/external-link';

import type { FilingResult } from './api';
import type { PacketPatch } from './form';
import { Message, Muted, Quote, filingStyles } from './parts';

/**
 * Step 1 (the web's ConfirmClassStep): the settlement's own class
 * definition, word for word, a link to read it on the official site, and
 * "This describes me", which only the member ticks (it starts from what
 * they saved; Lawsuit AI never ticks it).
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
  const [checked, setChecked] = useState(packet?.choices.class_definition_confirmed ?? false);
  const [error, setError] = useState<string | null>(null);
  if (!packet || !spec) return null;
  const locked = packet.status !== 'open' || !view.actions.can_edit;
  const source = toSafeWebUrl(spec.class_definition.source_url);
  const official = toSafeWebUrl(spec.official_form_url || view.settlement.official_url);

  async function toggle(next: boolean) {
    setChecked(next);
    setError(null);
    const result = await save({ class_definition_confirmed: next });
    if (!result.ok) {
      setChecked(!next);
      setError(result.error);
    }
  }

  return (
    <View style={filingStyles.stack}>
      <Muted>{copy.confirmIntro.text}</Muted>
      <Quote text={spec.class_definition.text} testID="filing-class-definition" />
      <View style={filingStyles.tight}>
        {source ? <ExternalTextLink url={source} label={copy.confirmSource.text} /> : null}
        {official && official !== source ? (
          <ExternalTextLink url={official} label={spec.form_title ?? copy.confirmOfficialForm.text} />
        ) : null}
      </View>
      <CheckboxRow
        label={copy.confirmCheckbox.text}
        checked={checked}
        onChange={(next) => void toggle(next)}
        disabled={busy || locked}
        testID="filing-class-confirm"
      />
      <Muted>{copy.confirmWarning.text}</Muted>
      <Message tone="error" text={error} />
    </View>
  );
}
