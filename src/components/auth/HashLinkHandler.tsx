'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Older Supabase email links (implicit flow) put the session in the URL hash
 * (#access_token=...&refresh_token=...&type=recovery), which the server never
 * sees. This picks it up in the browser, starts the session and moves on.
 * Errors in the hash (#error=...&error_code=otp_expired) go to the expired
 * screen. With no hash, it renders its children (the "link isn't complete" view).
 */
export function HashLinkHandler({
  recovery,
  children,
}: {
  recovery: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    const hash = new URLSearchParams(raw);
    const isRecovery = recovery || hash.get('type') === 'recovery';
    const expired = isRecovery ? '/forgot-password?link=expired' : '/login?link=expired';
    if (hash.get('error') || hash.get('error_code')) {
      router.replace(expired);
      return;
    }
    const access_token = hash.get('access_token');
    const refresh_token = hash.get('refresh_token');
    if (!access_token || !refresh_token) return;
    setWorking(true);
    // Drop the tokens from the address bar and history right away.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) router.replace(expired);
        else router.replace(isRecovery ? '/reset-password' : '/dashboard?confirmed=1');
      })
      .catch(() => router.replace(expired));
  }, [recovery, router]);

  if (working) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-6 text-ink-muted">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        Opening your link…
      </div>
    );
  }
  return <>{children}</>;
}
