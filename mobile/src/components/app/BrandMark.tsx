import { Image, StyleSheet } from 'react-native';

import { space } from '@/theme/tokens';

/** The Lawsuit AI mark (the website logo), same artwork as the splash screen. Decorative. */
export function BrandMark({ size = space[16] }: { size?: number }) {
  return (
    <Image
      source={require('@/assets/images/splash-icon.png')}
      style={[styles.mark, { width: size, height: size }]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  mark: {
    alignSelf: 'center',
  },
});
