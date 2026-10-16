'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { createClient } from '@/lib/supabase/client';

export function NavAuthLinks({
  signedIn,
  isAdmin = false,
}: {
  signedIn: boolean;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const posthog = usePostHog();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Start a new anonymous analytics identity, so on a shared device the next
    // person's activity is never joined to this account (D44).
    posthog?.reset();
    router.push('/');
    router.refresh();
  }

  if (signedIn) {
    return (
      <div className="flex items-center gap-3">
        {isAdmin && (
          <Link href="/admin" className="hidden text-sm font-semibold text-ink-muted hover:text-brand-700 sm:inline">
            Admin
          </Link>
        )}
        <Link href="/settings" className="hidden text-sm font-medium text-ink-muted hover:text-brand-700 sm:inline">
          Settings
        </Link>
        <Link href="/dashboard" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
          Dashboard
        </Link>
        <button onClick={signOut} className="btn-ghost !px-3 !py-2 text-sm">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="/login" className="text-sm font-semibold text-ink-muted hover:text-brand-700">
        Log in
      </Link>
      <Link href="/signup" className="btn-primary !py-2 !px-4 text-sm">
        Get started
      </Link>
    </div>
  );
}
