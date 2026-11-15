'use client';

import { useState } from 'react';
import { Download, ExternalLink, Lock } from 'lucide-react';
import type { DeskPacketView } from '@/lib/filing/v2/contract-staff';
import { fetchStaffDocument, saveBlob, type ApiError } from './api';
import { JobStatusBadge, SlaBadge } from './Badges';
import { CopyButton } from './CopyButton';
import { formatBytes, formatDateTime, formatDay, httpsUrl, shortHash } from './format';
import { claimStatusLabel, LANE_LABEL, MIME_LABEL } from './labels';
import { Badge, ErrorNote, Notice, Panel } from './ui';

const EXT: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/** The rules every desk session starts with (docs/designs/one-click-filing.md, section 1). */
export function DeskRules() {
  return (
    <Notice tone="warn">
      <p className="font-semibold">Desk rules</p>
      <ul className="list-disc space-y-0.5 pl-5">
        <li>
          Use your own normal browser. Open the official form yourself, paste each value exactly as shown, and submit
          it yourself. Lawsuit AI never fills, scripts, embeds or proxies official claim sites.
        </li>
        <li>
          If the site shows a CAPTCHA, a code by email or text, an identity check or a login, stop. Do not solve it
          or ask anyone to. Record “Stopped at a check”: the member finishes on the official site.
        </li>
        <li>
          Send only what the member signed. Never add, change or guess an answer, and never enter bank, card or
          payout account details: payment goes to the member.
        </li>
        <li>
          If you are not sure it went through, record “Not sure whether it went through”. Never submit a claim a
          second time.
        </li>
      </ul>
    </Notice>
  );
}

function DocumentRow({ doc }: { doc: DeskPacketView['documents'][number] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    const res = await fetchStaffDocument(doc.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (res.data.kind === 'url') window.open(res.data.url, '_blank', 'noopener,noreferrer');
    else saveBlob(res.data.blob, `${doc.kind}-${doc.id.slice(0, 8)}.${EXT[doc.mime] ?? 'bin'}`);
  }

  return (
    <li className="rounded-lg border border-gray-100 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-ink">{doc.label}</p>
          <p className="text-xs text-ink-muted">
            {MIME_LABEL[doc.mime]} · {formatBytes(doc.size_bytes)} · SHA-256 <span className="font-mono">{shortHash(doc.sha256)}</span>
          </p>
        </div>
        <button type="button" className="btn-secondary px-3 py-1.5 text-sm" disabled={busy} onClick={() => void download()}>
          <Download className="h-4 w-4" aria-hidden /> {busy ? 'Getting it…' : 'Download'}
        </button>
      </div>
      <ErrorNote error={error} />
    </li>
  );
}

/**
 * One signed claim as the desk works it: the official form link, the Jev
 * pre-send check, every field in the official form's order with a copy
 * button, the proof documents and the member's e-signature block.
 */
export function DeskPacket({ view, now }: { view: DeskPacketView; now: Date }) {
  const formUrl = httpsUrl(view.settlement.official_form_url);
  const blocked = view.checks.outcome === 'block';

  return (
    <div className="space-y-4">
      <Panel
        title={view.settlement.title}
        description={`Deadline ${formatDay(view.settlement.deadline)} · claim ${claimStatusLabel(view.claim.status).toLowerCase()}`}
        actions={
          <>
            <JobStatusBadge status={view.job.status} />
            <SlaBadge job={view.job} now={now} />
            {view.lock.mine ? (
              <Badge tone="brand">
                <Lock className="h-3 w-3" aria-hidden /> Yours until {formatDateTime(view.lock.expires_at)}
              </Badge>
            ) : view.job.locked ? (
              <Badge tone="gray">Someone else has it</Badge>
            ) : null}
          </>
        }
      >
        <div className="space-y-3">
          {formUrl ? (
            <div className="flex flex-wrap items-center gap-3">
              <a href={formUrl} target="_blank" rel="noopener noreferrer" className="btn-primary px-4 py-2 text-sm">
                <ExternalLink className="h-4 w-4" aria-hidden /> Open the official form
              </a>
              <p className="max-w-xl text-xs text-ink-muted">
                Opens in a new tab of your own browser. You fill it in and submit it yourself; nothing here touches
                the official site.
              </p>
            </div>
          ) : (
            <Notice tone="danger">This claim has no usable official form link. Record “Not submitted” and tell the team.</Notice>
          )}
          {view.instructions ? (
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Instructions</p>
              <p className="mt-1 whitespace-pre-wrap text-ink">{view.instructions}</p>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel
        title="Jev check before sending"
        actions={<Badge tone={blocked ? 'red' : view.checks.outcome === 'warn' ? 'gold' : 'green'}>{view.checks.outcome}</Badge>}
      >
        {blocked ? (
          <Notice tone="danger">
            Jev blocks sending this claim. Do not submit it. Record “Not submitted” or, when the member can fix it,
            “the member must fix or add something”.
          </Notice>
        ) : null}
        {view.checks.issues.length === 0 ? (
          <p className="text-sm text-ink-muted">No issues.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {view.checks.issues.map((issue, i) => (
              <li key={`${issue.rule_id}-${i}`} className="flex flex-wrap items-center gap-2">
                <Badge tone={issue.severity === 'block' ? 'red' : issue.severity === 'warn' ? 'gold' : 'gray'}>{issue.severity}</Badge>
                {issue.audience === 'staff' ? <Badge tone="brand">staff only</Badge> : null}
                <span className="text-ink">{issue.message}</span>
                <span className="font-mono text-xs text-ink-muted">{issue.field ?? issue.rule_id}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Fields, in the official form’s order" description="Copy each value exactly. Nothing here is a suggestion: it is what the member signed.">
        <ol className="divide-y divide-gray-100">
          {view.fields.map((field, i) => (
            <li key={field.path} className="flex flex-wrap items-start justify-between gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink-muted">
                  {i + 1}. {field.label}
                  {field.required ? <span className="text-danger-700"> *</span> : null}
                </p>
                <p className="mt-0.5 whitespace-pre-wrap break-words font-mono text-sm text-ink">
                  {field.copy_text === '' ? <span className="text-ink-muted">(empty)</span> : field.copy_text}
                </p>
              </div>
              {field.copy_text !== '' ? <CopyButton text={field.copy_text} label={field.label} /> : null}
            </li>
          ))}
        </ol>
      </Panel>

      {view.documents.length > 0 ? (
        <Panel
          title="Proof documents"
          description="Download each file and attach it on the official form. The server checks every file against the signed fingerprint before you get it."
        >
          <ul className="space-y-2">
            {view.documents.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="The member’s e-signature" description="The sworn statement the member read and signed for this exact packet.">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-ink-muted">Typed name</dt>
            <dd className="flex items-center gap-2 text-ink">
              {view.signature.typed_name} <CopyButton text={view.signature.typed_name} label="typed name" />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-ink-muted">Signed</dt>
            <dd className="text-ink">{formatDateTime(view.signature.signed_at)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-ink-muted">Packet hash (SHA-256)</dt>
            <dd className="break-all font-mono text-xs text-ink">{view.signature.packet_hash}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-ink-muted">Lane signed for</dt>
            <dd className="text-ink">{LANE_LABEL[view.signature.lane]}</dd>
          </div>
        </dl>
        <div className="mt-3 rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Sworn statement, as signed</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{view.signature.statement_text}</p>
        </div>
      </Panel>
    </div>
  );
}
