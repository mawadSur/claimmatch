'use client';

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { AGENT_AUTH_V1, AGENT_AUTH_V2, effectiveDeskChallengeMode } from '@/lib/filing/v2/authorization-text';
import { DeskChallengeRequestSchema } from '@/lib/filing/v2/contract-staff';
import { AnySuccessSchema, staffJson, staffPaths, type ApiError, type FieldIssue } from './api';
import { formatDateTime } from './format';
import { zodIssues } from './forms';
import type { ControlsView, FilingPermissions } from './types';
import { AreaField, Badge, ErrorNote, FieldIssues } from './ui';

export const DESK_CHALLENGE_LABEL = {
  stop: 'Stop at any check (default)',
  staff_completes_captcha: 'Staff may complete a CAPTCHA by hand',
} as const;

/**
 * A settlement's desk challenge rule (0045). Shown to everyone in the
 * console; only a legal reviewer can change it, and loosening it needs notes
 * on what the law firm reviewed. Codes, identity checks and logins always stop.
 */
export function DeskChallengeCard({
  permissions,
  lawsuitId,
  view,
  onChanged,
}: {
  permissions: FilingPermissions;
  lawsuitId: string;
  view: ControlsView | null;
  onChanged: () => void;
}) {
  const mode = view?.desk_challenge_mode ?? 'stop';
  // From the server (AGENT_AUTH_CURRENT_VERSION); the browser has no env, so never read it here.
  const signing = view?.current_authorization_version ?? AGENT_AUTH_V1;
  const next = mode === 'stop' ? 'staff_completes_captcha' : 'stop';
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [issues, setIssues] = useState<FieldIssue[]>([]);

  async function change() {
    setError(null);
    setIssues([]);
    const parsed = DeskChallengeRequestSchema.safeParse({
      lawsuit_id: lawsuitId,
      mode: next,
      notes: notes.trim() === '' ? null : notes,
    });
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    setBusy(true);
    const res = await staffJson(staffPaths.deskChallenge(), AnySuccessSchema, { method: 'POST', body: parsed.data });
    setBusy(false);
    if (!res.ok) setError(res.error);
    else {
      setNotes('');
      onChanged();
    }
  }

  return (
    <div className="mt-4 space-y-2 rounded-xl border border-gray-100 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">Desk rule for checks on the official form</span>
        <Badge tone={mode === 'stop' ? 'gray' : 'gold'}>{DESK_CHALLENGE_LABEL[mode]}</Badge>
        {view?.desk_challenge_changed_at ? (
          <span className="text-xs text-ink-muted">since {formatDateTime(view.desk_challenge_changed_at)}</span>
        ) : null}
      </div>
      {mode !== 'stop' && view?.desk_challenge_notes ? (
        <p className="whitespace-pre-wrap text-xs text-ink-muted">Law firm notes: {view.desk_challenge_notes}</p>
      ) : null}
      {mode !== 'stop' && effectiveDeskChallengeMode(mode, signing) === 'stop' ? (
        <p className="text-xs font-semibold text-ink">
          Not in effect yet: the authorization members sign now ({signing}) says the agent stops at any robot check.
          This rule applies only to claims signed under {AGENT_AUTH_V2}, which says a desk agent may complete a CAPTCHA
          by hand. Members sign it once the law firm approves it and AGENT_AUTH_CURRENT_VERSION is set to {AGENT_AUTH_V2}.
        </p>
      ) : null}
      {mode !== 'stop' && effectiveDeskChallengeMode(mode, signing) !== 'stop' ? (
        <p className="text-xs text-ink-muted">
          In effect for claims signed under {AGENT_AUTH_V2} only. A claim signed under {AGENT_AUTH_V1} still stops at
          any robot check.
        </p>
      ) : null}
      <p className="text-xs text-ink-muted">
        Codes by email or text, identity checks and logins are always a hard stop. Lawsuit AI never sees, solves or
        passes on a check; this only decides whether a desk agent may complete a CAPTCHA themselves.
      </p>
      {permissions.canApprove ? (
        <div className="space-y-2">
          {next !== 'stop' ? (
            <AreaField
              id={`desk-challenge-notes-${lawsuitId}`}
              label="What the law firm reviewed (required)"
              value={notes}
              rows={2}
              onChange={setNotes}
            />
          ) : null}
          <FieldIssues issues={issues} />
          <ErrorNote error={error} />
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-sm"
            disabled={busy || (next !== 'stop' && notes.trim() === '')}
            onClick={() => void change()}
          >
            <ShieldAlert className="h-4 w-4" aria-hidden />
            {next === 'stop' ? 'Go back to stopping at any check' : 'Allow staff to complete a CAPTCHA'}
          </button>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">Only a legal reviewer can change this rule.</p>
      )}
    </div>
  );
}
