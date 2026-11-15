'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { DOCUMENT_MIME_TYPES, type BenefitTier, type ProofRequirement } from '@/lib/filing/v2/contract';
import type { FieldIssue } from './api';
import { issuesAt, moveItem, newProof, nullIfBlank, removeItem, replaceItem } from './forms';
import { MIME_LABEL } from './labels';
import { AreaField, CheckField, FieldIssues, IconButton, NumberField, TextField } from './ui';

const num = (n: number | undefined) => n ?? Number.NaN;

function ProofCard({
  id,
  proof,
  onChange,
  onRemove,
  disabled,
}: {
  id: string;
  proof: ProofRequirement;
  onChange: (p: ProofRequirement) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-gray-100 bg-white p-3">
      <div className="grid gap-3 md:grid-cols-[12rem,1fr,auto]">
        <TextField id={`${id}-kind`} label="Proof kind (key)" mono value={proof.kind} maxLength={64} disabled={disabled} onChange={(kind) => onChange({ ...proof, kind })} />
        <TextField id={`${id}-label`} label="Official label" value={proof.official_label} maxLength={500} disabled={disabled} onChange={(official_label) => onChange({ ...proof, official_label })} />
        <div className="flex items-end">
          <IconButton label="Remove this proof" disabled={disabled} onClick={onRemove}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
      </div>
      <AreaField id={`${id}-help`} label="Plain-English help (optional)" value={proof.help ?? ''} rows={2} disabled={disabled} onChange={(help) => onChange({ ...proof, help: nullIfBlank(help) })} />
      <div className="grid gap-3 md:grid-cols-4">
        <NumberField id={`${id}-min`} label="Fewest files" value={proof.min_files} min={0} max={10} disabled={disabled} onChange={(n) => onChange({ ...proof, min_files: num(n) })} />
        <NumberField id={`${id}-max`} label="Most files" value={proof.max_files} min={1} max={10} disabled={disabled} onChange={(n) => onChange({ ...proof, max_files: num(n) })} />
        <CheckField id={`${id}-required`} label="Required" checked={proof.required} disabled={disabled} onChange={(required) => onChange({ ...proof, required })} />
        <CheckField id={`${id}-health`} label="Health data" checked={proof.health_flag} disabled={disabled} onChange={(health_flag) => onChange({ ...proof, health_flag })} />
      </div>
      <fieldset>
        <legend className="field-label text-xs">Accepted file types</legend>
        <div className="flex flex-wrap gap-3">
          {DOCUMENT_MIME_TYPES.map((mime) => (
            <CheckField
              key={mime}
              id={`${id}-mime-${mime.replace(/\W/g, '-')}`}
              label={MIME_LABEL[mime]}
              checked={proof.accepted_mime.includes(mime)}
              disabled={disabled}
              onChange={(checked) =>
                onChange({
                  ...proof,
                  accepted_mime: checked
                    ? DOCUMENT_MIME_TYPES.filter((m) => m === mime || proof.accepted_mime.includes(m))
                    : proof.accepted_mime.filter((m) => m !== mime),
                })
              }
            />
          ))}
        </div>
      </fieldset>
    </div>
  );
}

/** Benefit tiers and the proof each one needs (photos or documents the member uploads). */
export function SpecTiersEditor({
  idPrefix,
  tiers,
  onChange,
  disabled,
  issues,
}: {
  idPrefix: string;
  tiers: readonly BenefitTier[];
  onChange: (tiers: BenefitTier[]) => void;
  disabled?: boolean;
  issues: readonly FieldIssue[];
}) {
  const setTier = (i: number, tier: BenefitTier) => onChange(replaceItem(tiers, i, tier));

  return (
    <div className="space-y-3">
      {tiers.length === 0 ? <p className="text-sm text-ink-muted">No benefit tiers: one claim type, no proof requirements.</p> : null}
      {tiers.map((tier, i) => {
        const id = `${idPrefix}-${i}`;
        return (
          <div key={i} className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-ink">Tier {i + 1}</span>
              <div className="flex gap-1">
                <IconButton label="Move tier up" disabled={disabled || i === 0} onClick={() => onChange(moveItem(tiers, i, -1))}>
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </IconButton>
                <IconButton label="Move tier down" disabled={disabled || i === tiers.length - 1} onClick={() => onChange(moveItem(tiers, i, 1))}>
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </IconButton>
                <IconButton label="Remove tier" disabled={disabled} onClick={() => onChange(removeItem(tiers, i))}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </IconButton>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[12rem,1fr]">
              <TextField id={`${id}-key`} label="Key" mono value={tier.key} maxLength={64} disabled={disabled} onChange={(key) => setTier(i, { ...tier, key })} />
              <TextField id={`${id}-label`} label="Official label" value={tier.official_label} maxLength={500} disabled={disabled} onChange={(official_label) => setTier(i, { ...tier, official_label })} />
            </div>
            <AreaField id={`${id}-description`} label="Description (optional)" value={tier.description ?? ''} rows={2} disabled={disabled} onChange={(d) => setTier(i, { ...tier, description: nullIfBlank(d) })} />
            <div className="space-y-2">
              <p className="field-label text-xs">Proof for this tier</p>
              {tier.proof.length === 0 ? <p className="text-xs text-ink-muted">No proof needed.</p> : null}
              {tier.proof.map((proof, j) => (
                <ProofCard
                  key={j}
                  id={`${id}-proof-${j}`}
                  proof={proof}
                  disabled={disabled}
                  onChange={(p) => setTier(i, { ...tier, proof: replaceItem(tier.proof, j, p) })}
                  onRemove={() => setTier(i, { ...tier, proof: removeItem(tier.proof, j) })}
                />
              ))}
              <button
                type="button"
                className="btn-ghost px-3 py-1.5 text-sm"
                disabled={disabled || tier.proof.length >= 10}
                onClick={() => setTier(i, { ...tier, proof: [...tier.proof, newProof(tier.proof)] })}
              >
                <Plus className="h-4 w-4" aria-hidden /> Add proof
              </button>
            </div>
            <FieldIssues issues={issuesAt(issues, `benefit_tiers.${i}`)} />
          </div>
        );
      })}
      <button
        type="button"
        className="btn-ghost px-3 py-1.5 text-sm"
        disabled={disabled || tiers.length >= 10}
        onClick={() =>
          onChange([...tiers, { key: `tier_${tiers.length + 1}`, official_label: '', description: null, proof: [] }])
        }
      >
        <Plus className="h-4 w-4" aria-hidden /> Add a benefit tier
      </button>
    </div>
  );
}
