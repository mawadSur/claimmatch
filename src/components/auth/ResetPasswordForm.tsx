'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export const MIN_PASSWORD_LENGTH = 10;

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  }
  if (password !== confirm) return 'The two passwords don’t match.';
  return null;
}

/** Sets a new password for the session started by the recovery link. */
export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setLoading(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError('We couldn’t update your password. Request a new reset link and try again.');
      return;
    }
    router.replace('/dashboard?password=updated');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
      <label htmlFor="new-password" className="field-label">
        New password
      </label>
      <input
        id="new-password"
        type="password"
        autoComplete="new-password"
        className="field-input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
      />
      <label htmlFor="confirm-password" className="field-label mt-4">
        Confirm new password
      </label>
      <input
        id="confirm-password"
        type="password"
        autoComplete="new-password"
        className="field-input"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary mt-5 w-full" disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Save new password
      </button>
    </form>
  );
}
