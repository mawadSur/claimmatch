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
