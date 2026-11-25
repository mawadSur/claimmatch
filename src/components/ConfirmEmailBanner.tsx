'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, MailCheck } from 'lucide-react';
import { OAUTH_COPY } from '@/lib/copy';
import { SITE } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { SIGNUP_RESEND_COOLDOWN_MS, signupErrorCodeFromMessage, signupErrorMessage } from '@/lib/signup-validation';

/**
 * Soft gate: unconfirmed accounts can still track claims and finish
 * onboarding. This reminder asks them to confirm when they can.
 */
export function ConfirmEmailBanner({ email }: { email: string | null }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);

  async function resend() {
    if (!email || status === 'sending' || Date.now() < cooldownUntil) return;
    setStatus('sending');
    setMessage('');
    try {
      const { error } = await createClient().auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${SITE.url.replace(/\/+$/, '')}/auth/callback` },
      });
      if (error) {
        setStatus('error');
        setMessage(signupErrorMessage(signupErrorCodeFromMessage(error.message)));
      } else {
        setStatus('sent');
        setMessage('We sent another confirmation email.');
      }
    } catch {
      setStatus('error');
      setMessage(signupErrorMessage('unknown'));
    }
    setCooldownUntil(Date.now() + SIGNUP_RESEND_COOLDOWN_MS);
  }

  const cooling = Date.now() < cooldownUntil && status !== 'sending';

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
      <div className="flex-1">
        <p className="font-semibold">Confirm your email when you can</p>
        <p className="mt-1">{OAUTH_COPY.confirmReminder}</p>
        {email && (
          <button
            type="button"
            onClick={() => void resend()}
            disabled={status === 'sending' || cooling}
            className="text-link mt-2 inline-flex min-h-tap items-center gap-1.5 text-sm"
          >
            {status === 'sending' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Sending…
              </>
            ) : (
              'Resend confirmation email'
            )}
          </button>
        )}
        {message && (
          <p className={`mt-1 ${status === 'error' ? 'text-danger-700' : 'text-success-800'}`}>
            {status === 'error' ? <AlertCircle className="mr-1 inline h-3.5 w-3.5" aria-hidden /> : null}
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
