import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * ClaimMatch design tokens, mirroring the website (tailwind.config.ts and
 * src/app/globals.css). Screens use the semantic `colors`, `space`, `radii`,
 * `shadows` and `typography` below and never raw hex values.
 *
 * Light mode only. Every text color here was checked at 4.5:1 or better
 * against the surface it is paired with, and every pressed fill differs from
 * its resting fill by at least 1.2:1, so a press is visible (tests/tokens.test.ts).
 */

/** Exactly tailwind.config.ts theme.extend.colors (same keys and values). */
export const brandPalette = {
  brand: {
    50: '#F4F7FB',
    100: '#E6EEF6',
    200: '#C5D4E6',
    300: '#8FA8C4',
    400: '#5B7DA3',
    500: '#2E5278',
    600: '#1E3A5F',
    700: '#16304E',
    800: '#0F243C',
    900: '#0A1628',
  },
  cta: {
    50: '#EFF6FF',
    600: '#1D4ED8',
    700: '#1E40AF',
  },
  gold: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#F8E3B0',
    300: '#F1CD7F',
    400: '#E6B455',
    600: '#B45309',
    700: '#92400E',
  },
  success: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    500: '#16A34A',
    600: '#15803D',
    700: '#166534',
  },
  danger: {
    50: '#FEF2F2',
    500: '#DC2626',
    700: '#B91C1C',
  },
  ink: {
    DEFAULT: '#0F172A',
    muted: '#334155',
    soft: '#475569',
  },
} as const;

/**
 * Tailwind 3.4 default colors: the neutrals and the amber "Unverified" notice
 * the website uses, plus red-100 for the app's pressed danger button (the
 * website's hover:bg-danger-50 is too faint to show a press).
 */
export const tailwindDefaults = {
  white: '#FFFFFF',
  slate: {
    50: '#F8FAFC',
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
  },
  amber: {
    50: '#FFFBEB',
    200: '#FDE68A',
    700: '#B45309',
    900: '#78350F',
    950: '#451A03',
  },
  red: {
    100: '#FEE2E2',
  },
} as const;

const { brand, gold, success, danger, ink } = brandPalette;
const { white, slate, amber, red } = tailwindDefaults;

/** Semantic colors. Names describe the job, not the hue. */
export const colors = {
  // Surfaces
  background: brand[50], // body bg-brand-50
  surface: white, // cards and inputs
  surfacePressed: slate[200], // pressed list rows and cards
  surfaceBrand: brand[100],
  surfaceInverse: brand[900],
  skeleton: slate[200],
  overlay: 'rgba(10, 22, 40, 0.4)',

  // Text
  text: ink.DEFAULT,
  textMuted: ink.muted,
  textSoft: ink.soft,
  textInverse: white,
  textInverseMuted: slate[300], // secondary text on surfaceInverse and on dark Liquid Glass
  textLink: brand[700],
  textPlaceholder: slate[500],
  textEyebrow: brand[500],

  // Lines
  border: slate[300], // inputs and secondary buttons (ring-slate-300)
  borderSubtle: 'rgba(226, 232, 240, 0.8)', // cards (border-slate-200/80)
  borderBrand: brand[200],
  divider: slate[200],
  focusRing: brand[400],

  // Actions
  primary: brand[700], // .btn-primary
  primaryPressed: brand[900],
  onPrimary: white,
  secondary: white, // .btn-secondary
  secondaryPressed: slate[200],
  onSecondary: ink.DEFAULT,
  ghostPressed: brand[200], // .btn-ghost and icon buttons, on the background or a card
  onGhost: ink.muted,
  selected: brand[600], // active filter pill
  onSelected: white,
  chipPressed: brand[200], // inactive filter pill
  dangerAction: danger[700],
  dangerActionPressed: red[100],
  dangerActionBorder: 'rgba(220, 38, 38, 0.3)', // border-danger-500/30

  // Status tones (surface, border, foreground, icon)
  successSurface: success[50],
  successBorder: success[100],
  success: success[700],
  successIcon: success[600],
  dangerSurface: danger[50],
  dangerBorder: 'rgba(220, 38, 38, 0.3)',
  danger: danger[700],
  dangerIcon: danger[700],
  warningSurface: amber[50], // "Unverified: check the official site"
  warningBorder: amber[200],
  warning: amber[950],
  warningStrong: amber[900],
  warningIcon: amber[700],
  infoSurface: brand[100],
  infoBorder: brand[200],
  info: ink.DEFAULT,
  infoIcon: brand[700],
  goldSurface: gold[50],
  goldBorder: gold[100],
  gold: gold[700],

  // Shadow ink (rgba(15, 23, 42, …) on the web)
  shadow: ink.DEFAULT,
} as const;

export type ColorToken = keyof typeof colors;

/** Text colors only; each meets 4.5:1 on its intended surface. */
export type TextColorToken = Extract<
  ColorToken,
  | 'text'
  | 'textMuted'
  | 'textSoft'
  | 'textInverse'
  | 'textInverseMuted'
  | 'textLink'
  | 'textEyebrow'
  | 'success'
  | 'danger'
  | 'warning'
  | 'warningStrong'
  | 'info'
  | 'gold'
  | 'onPrimary'
  | 'onSecondary'
  | 'onGhost'
  | 'onSelected'
  | 'dangerAction'
>;

/**
 * 4/8 pt spacing, keyed like Tailwind's spacing scale so web classes port
 * directly: p-5 is space[5] (20), gap-3 is space[3] (12).
 */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export type SpaceToken = keyof typeof space;

/** Tailwind radii as configured on the web (rounded-lg … rounded-4xl). */
export const radii = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '4xl': 32,
  full: 9999,
} as const;

/** Minimum touch target (Apple HIG 44 pt, the web's min-h-tap). */
export const touchTarget = 44;

export const layout = {
  /** Horizontal screen padding (the web's px-5). */
  screenPadding: space[5],
  /** Gap between stacked sections. */
  sectionGap: space[8],
  /** Readable line length cap for long text. */
  maxContentWidth: 640,
} as const;

/**
 * Shadows: iOS shadow props plus Android elevation, approximating the web's
 * shadow-card, shadow-card-hover and shadow-btn-primary.
 */
export const shadows = {
  none: {},
  card: Platform.select<ViewStyle>({
    ios: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
    android: { shadowColor: colors.shadow, elevation: 2 },
    default: {},
  }),
  raised: Platform.select<ViewStyle>({
    ios: { shadowColor: brand[600], shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 20 },
    android: { shadowColor: brand[600], elevation: 6 },
    default: {},
  }),
  button: Platform.select<ViewStyle>({
    ios: { shadowColor: brand[900], shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.24, shadowRadius: 2 },
    android: { shadowColor: brand[900], elevation: 1 },
    default: {},
  }),
} as const;

/**
 * Font family names. They are the keys registered with useFonts in
 * src/theme/fonts.ts, one family per weight, so styles set fontFamily and
 * never fontWeight. Newsreader is for headlines only and stays at 600
 * (the web caps h1/h2 at 600), in a display optical size (fonts.ts);
 * Source Sans 3 is for all UI and body text.
 */
export const fontFamilies = {
  display: 'NewsreaderDisplay_600SemiBold',
  sans: 'SourceSans3_400Regular',
  sansMedium: 'SourceSans3_500Medium',
  sansSemibold: 'SourceSans3_600SemiBold',
  sansBold: 'SourceSans3_700Bold',
} as const;

export type FontFamily = (typeof fontFamilies)[keyof typeof fontFamilies];

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'labelSmall'
  | 'caption'
  | 'badge';

/** Type scale. Line heights scale with Dynamic Type along with the font size. */
export const typography: Record<TextVariant, TextStyle> = {
  /** Screen headline (the web's h1). */
  display: { fontFamily: fontFamilies.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.5 },
  /** Section headline (the web's h2). */
  title: { fontFamily: fontFamilies.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.3 },
  /** Card and group titles (the web's h3, sans bold). */
  heading: { fontFamily: fontFamilies.sansBold, fontSize: 19, lineHeight: 24, letterSpacing: -0.1 },
  body: { fontFamily: fontFamilies.sans, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fontFamilies.sansSemibold, fontSize: 16, lineHeight: 24 },
  /** Buttons, field labels and list rows. */
  label: { fontFamily: fontFamilies.sansSemibold, fontSize: 16, lineHeight: 20 },
  /** Filter chips and other small controls (the web's text-sm font-medium filter pills). */
  labelSmall: { fontFamily: fontFamilies.sansMedium, fontSize: 14, lineHeight: 20 },
  /** Secondary and helper text (the web's text-sm). */
  caption: { fontFamily: fontFamilies.sans, fontSize: 14, lineHeight: 20 },
  /** Badges (the web's text-xs font-semibold). */
  badge: { fontFamily: fontFamilies.sansSemibold, fontSize: 12, lineHeight: 16 },
};

/**
 * Largest Dynamic Type multiplier per variant: body text can grow to 2x,
 * headlines less because they start large. Layouts wrap instead of truncating.
 */
export const maxFontScale: Record<TextVariant, number> = {
  display: 1.5,
  title: 1.6,
  heading: 1.8,
  body: 2,
  bodyStrong: 2,
  label: 1.8,
  labelSmall: 1.8,
  caption: 2,
  badge: 1.6,
};

/** Default color per variant. */
export const variantColor: Record<TextVariant, TextColorToken> = {
  display: 'text',
  title: 'text',
  heading: 'text',
  body: 'text',
  bodyStrong: 'text',
  label: 'text',
  labelSmall: 'text',
  caption: 'textSoft',
  badge: 'textMuted',
};

/** Lucide icon sizes (the web uses h-3 … h-7). */
export const iconSizes = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
} as const;

export type IconSize = keyof typeof iconSizes;

export const motion = {
  /** Skeleton pulse half-cycle. */
  pulse: 800,
} as const;
