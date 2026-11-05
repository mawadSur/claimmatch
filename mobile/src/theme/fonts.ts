import { SourceSans3_400Regular } from '@expo-google-fonts/source-sans-3/400Regular';
import { SourceSans3_500Medium } from '@expo-google-fonts/source-sans-3/500Medium';
import { SourceSans3_600SemiBold } from '@expo-google-fonts/source-sans-3/600SemiBold';
import { SourceSans3_700Bold } from '@expo-google-fonts/source-sans-3/700Bold';

import { fontFamilies, type FontFamily } from './tokens';

/**
 * Fonts loaded by the root layout with useFonts, behind the splash screen.
 * Each Source Sans 3 weight is imported from its own subpath so the other
 * weights in the package are not bundled. Keys are the fontFamily names in
 * tokens.ts.
 *
 * Headlines use a display cut of Newsreader 600 (optical size 32, made by
 * scripts/cut-display-font.py from the OFL variable font; license in
 * assets/fonts/OFL-Newsreader.txt). The website draws h1/h2 with
 * font-optical-sizing: auto, and the 16 pt cut in @expo-google-fonts looks
 * heavier and looser at the app's 26-34 pt headline sizes.
 */
export const fontAssets: Record<FontFamily, number> = {
  [fontFamilies.display]: require('@/assets/fonts/NewsreaderDisplay-SemiBold.ttf'),
  [fontFamilies.sans]: SourceSans3_400Regular,
  [fontFamilies.sansMedium]: SourceSans3_500Medium,
  [fontFamilies.sansSemibold]: SourceSans3_600SemiBold,
  [fontFamilies.sansBold]: SourceSans3_700Bold,
};
