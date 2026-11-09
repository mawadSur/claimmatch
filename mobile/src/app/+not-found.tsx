import { useRouter } from 'expo-router';

import { Button, EmptyState, Screen } from '@/components/ui';
import { Compass, Search } from '@/components/ui/icons';
import { app } from '@/copy/app';

/**
 * Unknown link (src/app/not-found.tsx). The root layout anchors on (tabs), so
 * the tabs already sit under this screen: dismissTo returns to them, where a
 * replace would stack a second tab navigator (and Back would lead from the
 * catalog to another catalog).
 */
export default function NotFound() {
  const router = useRouter();
  return (
    <Screen centered>
      <EmptyState
        icon={Compass}
        title={app.notFoundTitle.text}
        body={app.notFoundBody.text}
        action={
          <Button
            label={app.browseOpenSettlements.text}
            icon={Search}
            onPress={() => router.dismissTo('/lawsuits')}
            fullWidth
          />
        }
      />
    </Screen>
  );
}
