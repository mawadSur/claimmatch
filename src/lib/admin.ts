import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Returns the current user's id if they are a signed-in admin, else null.
 * Admin is driven by profiles.is_admin (set in the DB) OR an ADMIN_EMAILS
 * allowlist env (comma-separated), so the first admin can bootstrap without SQL.
 */
export async function getAdminUser(): Promise<{ id: string; email: string | null } | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const allow = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (user.email && allow.includes(user.email.toLowerCase())) {
      return { id: user.id, email: user.email };
    }

    const { data } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .maybeSingle();
    if (data?.is_admin) return { id: user.id, email: user.email ?? null };
    return null;
  } catch {
    return null;
  }
}

/** Where a non-admin goes for an admin path: signed out → log in, signed in → dashboard. */
export function adminDeniedPath(signedIn: boolean, path: string): string {
  return signedIn ? '/dashboard?denied=admin' : `/login?next=${encodeURIComponent(path)}`;
}

/**
 * Server guard for /admin pages. Returns the admin, or redirects: signed-out
 * visitors to log in (and back), signed-in non-admins to the dashboard with
 * an access-denied message instead of the login page.
 */
export async function requireAdmin(path: string): Promise<{ id: string; email: string | null }> {
  const admin = await getAdminUser();
  if (admin) return admin;
  let signedIn = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  } catch {
    signedIn = false;
  }
  return redirect(adminDeniedPath(signedIn, path));
}
