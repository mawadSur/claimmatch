import { AuthCallbackScreen } from '@/features/auth/EmailLinkScreens';

/** /auth/callback: universal link from email, exchangeCodeForSession (plan section 4, M8). */
export default function CallbackRoute() {
  return <AuthCallbackScreen />;
}
