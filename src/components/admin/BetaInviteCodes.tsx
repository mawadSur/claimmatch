'use client';

import { useState } from 'react';
import { Check, Copy, Link2, Loader2 } from 'lucide-react';
import type { BetaInviteStats } from '@/lib/beta-invite';

export function BetaInviteCodes({ initialInvites }: { initialInvites: BetaInviteStats[] }) {
  const [invites, setInvites] = useState(initialInvites);
  const [label, setLabel] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError('');
    try {
      const res = await fetch('/api/admin/beta-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          code: code.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { invite?: BetaInviteStats; error?: string };
      if (!res.ok || !json.invite) throw new Error(json.error || 'Could not create the invite.');
      setInvites((prev) => [json.invite as BetaInviteStats, ...prev]);
      setLabel('');
      setCode('');
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the invite.');
      setStatus('idle');
    }
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="mt-6 border-t border-gray-100 pt-4">
      <h4 className="text-sm font-bold text-ink">Per-tester invite codes</h4>
      <p className="mt-1 text-xs text-ink-muted">
        One named code per tester or community. Attribution stays on first-touch{' '}
        <span className="font-mono">ref</span>. Counts are current totals — no
        projections. Prefer the short <span className="font-mono">/r/code</span>{' '}
        link; <span className="font-mono">/invite?code=</span> needs the invite
        landing flag too.
      </p>

      <form onSubmit={create} className="mt-3 grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
        <input
          className="field-input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Tester or community name"
          maxLength={80}
          required
          aria-label="Invite name"
        />
        <input
          className="field-input font-mono text-sm"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="code (optional)"
          maxLength={32}
          aria-label="Invite code"
        />
        <button type="submit" className="btn-primary" disabled={status === 'saving'}>
          {status === 'saving' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Link2 className="h-4 w-4" />
              Create
            </>
          )}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-danger-700">{error}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="py-2 pr-3 font-semibold">Invite</th>
              <th className="py-2 pr-3 font-semibold tabular-nums">Visits</th>
              <th className="py-2 pr-3 font-semibold tabular-nums">Signups</th>
              <th className="py-2 pr-3 font-semibold tabular-nums">Profiles</th>
              <th className="py-2 pr-3 font-semibold tabular-nums">Matches</th>
              <th className="py-2 pr-3 font-semibold tabular-nums">Forms</th>
              <th className="py-2 font-semibold tabular-nums">Filings</th>
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-ink-muted">
                  No tester codes yet.
                </td>
              </tr>
            )}
            {invites.map((invite) => (
              <tr key={invite.id} className="border-b border-gray-50 last:border-0">
                <td className="py-2 pr-3 align-top">
                  <div className="font-semibold">{invite.label || invite.code}</div>
                  <div className="font-mono text-xs text-ink-soft">{invite.code}</div>
                  <CopyMini
                    value={invite.shortUrl}
                    copied={copied === `${invite.id}-short`}
                    onCopy={() => copy(invite.shortUrl, `${invite.id}-short`)}
                    label="Copy short link"
                  />
                  <CopyMini
                    value={invite.inviteUrl}
                    copied={copied === `${invite.id}-invite`}
                    onCopy={() => copy(invite.inviteUrl, `${invite.id}-invite`)}
                    label="Copy invite link"
                  />
                </td>
                <td className="py-2 pr-3 align-top tabular-nums">{invite.visits}</td>
                <td className="py-2 pr-3 align-top tabular-nums">{invite.signups}</td>
                <td className="py-2 pr-3 align-top tabular-nums">{invite.profilesCompleted}</td>
                <td className="py-2 pr-3 align-top tabular-nums">{invite.matchesViewed}</td>
                <td className="py-2 pr-3 align-top tabular-nums">{invite.officialFormsOpened}</td>
                <td className="py-2 align-top tabular-nums">{invite.filingsReported}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CopyMini({
  value,
  copied,
  onCopy,
  label,
}: {
  value: string;
  copied: boolean;
  onCopy: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="mt-1 flex max-w-xs items-center gap-1 truncate text-left text-xs text-brand-700 hover:underline"
      aria-label={label}
    >
      {copied ? <Check className="h-3 w-3 shrink-0" /> : <Copy className="h-3 w-3 shrink-0" />}
      <span className="truncate">{value}</span>
    </button>
  );
}
