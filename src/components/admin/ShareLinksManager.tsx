'use client';

import { useState } from 'react';
import { Copy, Check, Link2, Loader2 } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';
import { SITE } from '@/lib/utils';
import { attributionSearch } from '@/lib/attribution';
import { shortShareUrl, trackedCampaignUrl } from '@/lib/share-links';
import type { ShareLinkStats } from '@/lib/share-links';

export function ShareLinksManager({ initialLinks }: { initialLinks: ShareLinkStats[] }) {
  const posthog = usePostHog();
  const [links, setLinks] = useState(initialLinks);
  const [label, setLabel] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmContent, setUtmContent] = useState('');
  const [destination, setDestination] = useState('/');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setError('');
    try {
      const res = await fetch('/api/admin/share-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label || undefined,
          utm_source: utmSource || undefined,
          utm_medium: utmMedium || undefined,
          utm_campaign: utmCampaign || undefined,
          utm_content: utmContent || undefined,
          destination: destination || '/',
          code: code || undefined,
        }),
      });
      const json = (await res.json()) as { link?: ShareLinkStats; error?: string };
      if (!res.ok || !json.link) throw new Error(json.error || 'Could not create the link.');
      setLinks((prev) => [json.link as ShareLinkStats, ...prev]);
      posthog?.capture('share_link_created', {
        code: json.link.code,
        utm_source: json.link.utm_source,
        utm_medium: json.link.utm_medium,
        utm_campaign: json.link.utm_campaign,
      });
      setLabel('');
      setUtmSource('');
      setUtmMedium('');
      setUtmCampaign('');
      setUtmContent('');
      setDestination('/');
      setCode('');
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the link.');
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
    <div className="space-y-8">
      <form onSubmit={create} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
        <h2 className="text-lg font-bold">New tracked link</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Builds a long URL on the homepage and a short{' '}
          <span className="font-mono text-xs">/r/code</span> that keeps the UTMs
          and ref through signup.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field id="label" label="Label" value={label} onChange={setLabel} placeholder="Twitter launch" />
          <Field id="code" label="Code (optional)" value={code} onChange={setCode} placeholder="auto" />
          <Field
            id="utm_source"
            label="utm_source"
            value={utmSource}
            onChange={setUtmSource}
            placeholder="twitter"
          />
          <Field
            id="utm_medium"
            label="utm_medium"
            value={utmMedium}
            onChange={setUtmMedium}
            placeholder="social"
          />
          <Field
            id="utm_campaign"
            label="utm_campaign"
            value={utmCampaign}
            onChange={setUtmCampaign}
            placeholder="launch"
          />
          <Field
            id="utm_content"
            label="utm_content"
            value={utmContent}
            onChange={setUtmContent}
            placeholder="bio"
          />
          <Field
            id="destination"
            label="Destination path"
            value={destination}
            onChange={setDestination}
            placeholder="/"
          />
        </div>
        {error && <p className="mt-3 text-sm text-danger-700">{error}</p>}
        <button type="submit" className="btn-primary mt-4" disabled={status === 'saving'}>
          {status === 'saving' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Link2 className="h-4 w-4" />
              Create link
            </>
          )}
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-card">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-semibold">Label</th>
              <th className="px-4 py-3 font-semibold">Links</th>
              <th className="px-4 py-3 font-semibold tabular-nums">Clicks</th>
              <th className="px-4 py-3 font-semibold tabular-nums">Signups</th>
            </tr>
          </thead>
          <tbody>
            {links.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-muted">
                  No campaign links yet. Create one above.
                </td>
              </tr>
            )}
            {links.map((link) => {
              const attr = {
                utm_source: link.utm_source,
                utm_medium: link.utm_medium,
                utm_campaign: link.utm_campaign,
                utm_content: link.utm_content,
                ref: link.code,
              };
              const longUrl = trackedCampaignUrl(SITE.url, link.destination, attr);
              const shortUrl = shortShareUrl(SITE.url, link.code);
              return (
                <tr key={link.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-3 align-top">
                    <div className="font-semibold">{link.label || link.code}</div>
                    <div className="mt-0.5 font-mono text-xs text-ink-soft">{link.code}</div>
                    <div className="mt-0.5 text-xs text-ink-soft">
                      {attributionSearch(attr).replace(/^\?/, '') || 'no UTMs'}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <CopyRow
                      value={shortUrl}
                      copied={copied === `${link.id}-short`}
                      onCopy={() => copy(shortUrl, `${link.id}-short`)}
                    />
                    <CopyRow
                      value={longUrl}
                      copied={copied === `${link.id}-long`}
                      onCopy={() => copy(longUrl, `${link.id}-long`)}
                    />
                  </td>
                  <td className="px-4 py-3 align-top tabular-nums">{link.clicks}</td>
                  <td className="px-4 py-3 align-top tabular-nums">{link.signups}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label htmlFor={id}>
      <span className="text-xs font-semibold text-ink-muted">{label}</span>
      <input
        id={id}
        className="field-input mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function CopyRow({
  value,
  copied,
  onCopy,
}: {
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="field-input !py-1.5 font-mono text-xs"
        aria-label="Tracked link"
      />
      <button type="button" onClick={onCopy} className="btn-secondary !px-2 !py-1.5 text-xs">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
