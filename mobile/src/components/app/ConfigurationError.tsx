import { StyleSheet, View } from 'react-native';

import { AppText, Notice, Screen } from '@/components/ui';
import { app } from '@/copy/app';
import type { EnvProblem } from '@/lib/env';
import { space } from '@/theme/tokens';

import { BrandMark } from './BrandMark';

/** Shown instead of the app when the build lacks its Supabase settings (a build problem, never user data). */
export function ConfigurationError({ problems }: { problems: EnvProblem[] }) {
  return (
    <Screen headerShown={false} centered testID="configuration-error">
      <BrandMark />
      <AppText variant="title" align="center">
        {app.configErrorTitle.text}
      </AppText>
      <Notice tone="error" body={app.configErrorBody.text}>
        <View style={styles.list}>
          {problems.map(({ name, problem }) => (
            <AppText key={name} variant="caption" color="danger">
              {`${name}: ${problem === 'missing' ? app.configErrorMissing.text : app.configErrorInvalid.text}`}
            </AppText>
          ))}
        </View>
      </Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space[1],
    paddingTop: space[1],
  },
});
