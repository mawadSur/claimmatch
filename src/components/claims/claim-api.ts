import type { ClaimView } from '@/lib/claims';

/** Browser calls to the claim routes. Every claim change goes through the server. */

export type ClaimApiResult =
  | { ok: true; claim: ClaimView; changed: boolean }
  | { ok: false; status: number; error: string };

async function send(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<ClaimApiResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      error: "We couldn't reach ClaimMatch. Check your internet connection and try again.",
    };
  }
  const json = (await res.json().catch(() => null)) as {
    claim?: ClaimView;
    changed?: boolean;
    created?: boolean;
    error?: string;
  } | null;
  if (res.ok && json?.claim) {
    return { ok: true, claim: json.claim, changed: json.changed ?? json.created ?? true };
  }
  if (res.status === 401) {
    return { ok: false, status: 401, error: 'You were logged out.' };
  }
  return { ok: false, status: res.status, error: json?.error || 'Something went wrong. Please try again.' };
}

/** Starts tracking a settlement ("Not filed yet"), or returns the existing claim. */
export function startTracking(lawsuitId: string): Promise<ClaimApiResult> {
  return send('/api/claims', 'POST', { lawsuit_id: lawsuitId });
}

export function updateClaim(claimId: string, body: Record<string, unknown>): Promise<ClaimApiResult> {
  return send(`/api/claims/${encodeURIComponent(claimId)}`, 'PATCH', body);
}

export type AcknowledgeAllResult =
  | { ok: true; claims: ClaimView[] }
  | { ok: false; status: number; error: string; claims: ClaimView[] };

/** "Got it" for every claim on a fictional settlement, in one request. */
export async function acknowledgeAllFictional(): Promise<AcknowledgeAllResult> {
  let res: Response;
  try {
    res = await fetch('/api/claims/acknowledge-fictional', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    return {
      ok: false,
      status: 0,
      error: "We couldn't reach ClaimMatch. Check your internet connection and try again.",
      claims: [],
    };
  }
  const json = (await res.json().catch(() => null)) as { claims?: ClaimView[]; error?: string } | null;
  const claims = Array.isArray(json?.claims) ? json.claims : [];
  if (res.ok) return { ok: true, claims };
  if (res.status === 401) return { ok: false, status: 401, error: 'You were logged out.', claims };
  return { ok: false, status: res.status, error: json?.error || 'Something went wrong. Please try again.', claims };
}

/** The user's local calendar date as YYYY-MM-DD. */
export function localISODate(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
