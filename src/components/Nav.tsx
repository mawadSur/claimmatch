import { createClient } from '@/lib/supabase/server';
import { getAdminUser } from '@/lib/admin';
import { flags } from '@/lib/flags';
import { SiteLogo } from './SiteLogo';
import { NavMenu } from './NavMenu';

/**
 * Top navigation. Server component: reads the session to decide whether to
 * show "Dashboard / Sign out" vs "Log in / Get started".
 */
export async function Nav() {
  let signedIn = false;
  let isAdmin = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = !!user;
    if (signedIn) {
      isAdmin = !!(await getAdminUser());
    }
  } catch {
    signedIn = false;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-brand-50/90 backdrop-blur-md">
      <nav className="container-page relative flex h-16 items-center justify-between">
        <SiteLogo />
        <NavMenu
          signedIn={signedIn}
          isAdmin={isAdmin}
          noticeLookup={flags.noticeLookup()}
        />
      </nav>
    </header>
  );
}
