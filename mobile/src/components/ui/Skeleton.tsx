import { useEffect, useState } from 'react';
import { Animated, StyleSheet, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { colors, motion, radii } from '@/theme/tokens';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Loading placeholder block. It pulses gently, and stays static when the
 * user asked to reduce motion. Hidden from screen readers: wrap a group of
 * skeletons in a view with accessibilityLabel={common.loading.text}.
 */
export function Skeleton({ width = '100%', height = 16, radius = radii.md, style }: SkeletonProps) {
  const reduceMotion = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: motion.pulse, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: motion.pulse, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [reduceMotion, opacity]);

  return (
    <Animated.View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { width, height, borderRadius: radius, opacity }, style]}
    />
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.skeleton,
  },
});
