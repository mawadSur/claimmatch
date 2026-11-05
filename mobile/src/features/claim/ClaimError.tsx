import { usePathname, useRouter } from 'expo-router';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Button, Notice } from '@/components/ui';
import { LogIn } from '@/components/ui/icons';
import { claim as copy } from '@/copy/claim';
import { userFacingError } from '@/data/errors';
import { loginHref } from '@/features/shared';
import { space } from '@/theme/tokens';

/**
 * An error from a claim request (src/components/claims/ClaimError.tsx): the
 * server's text as sent (errorMessageFor rewrites only "Refresh the page"),
 * announced when it appears. A lost session adds "Log in again", which comes
 * back to this claim.
 */
export function ClaimError({ error, style, testID }: { error: unknown; style?: StyleProp<ViewStyle>; testID?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const shown = userFacingError(error);
  if (!shown) return null;
  return (
    <Notice tone="error" body={shown.message} style={style} testID={testID}>
      {shown.status === 401 ? (
        <Button
          label={copy.logInAgain.text}
          variant="secondary"
          icon={LogIn}
          onPress={() => router.push(loginHref(pathname))}
          style={styles.logIn}
        />
      ) : null}
    </Notice>
  );
}

const styles = StyleSheet.create({
  logIn: {
    alignSelf: 'flex-start',
    marginTop: space[2],
  },
});
