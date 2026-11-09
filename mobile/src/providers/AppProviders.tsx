import type { ReactNode } from 'react';

import { AuthProvider } from './AuthProvider';
import { ConfigProvider } from './ConfigProvider';
import { QueryProvider } from './QueryProvider';

/** App-wide providers: memory-only React Query, then auth and config. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>
        <ConfigProvider>{children}</ConfigProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
