'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Client-side auth links so marketing pages can skip session middleware
 * and still show the correct signed-in state.
 */
export function NavAuthLinks() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load(userId: string | undefined) {
      if (!userId) {
        if (!cancelled) {
          setSignedIn(false);
          setIsAdmin(false);
        }
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .maybeSingle();
      if (!cancelled) {
        setSignedIn(true);
        setIsAdmin(!!data?.is_admin);
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      void load(data.session?.user.id);
    }).catch(() => {
      if (!cancelled) setSignedIn(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session?.user.id);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  if (signedIn === null) {
    return <div className="h-9 w-28" aria-hidden />;
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
