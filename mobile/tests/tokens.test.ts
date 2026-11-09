import { brandPalette, colors, type ColorToken } from '@/theme/tokens';

// Loaded with require, not import: an import would make tsc resolve the
// config's `tailwindcss` types, which live in the web's root node_modules
// (CI installs only mobile/). Jest strips the config's type-only import.
const tailwindConfig = (require('../../tailwind.config') as { default: { theme?: { extend?: { colors?: unknown } } } })
  .default;

function luminance(hex: string): number {
  const channels = hex
    .replace('#', '')
    .match(/.{2}/g)!
    .map((pair) => parseInt(pair, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('design tokens', () => {
  it('use exactly the website Tailwind colors', () => {
    expect(brandPalette).toEqual(tailwindConfig.theme?.extend?.colors);
  });

  // Every text color the UI kit draws, on the surface it is drawn on.
  const pairs: [text: ColorToken, surface: ColorToken][] = [
    ['text', 'background'],
    ['text', 'surface'],
    ['textMuted', 'background'],
    ['textMuted', 'surface'],
    ['textSoft', 'background'],
    ['textSoft', 'surface'],
    ['textLink', 'surface'],
    ['textLink', 'surfaceBrand'],
    ['textPlaceholder', 'surface'],
    ['textInverse', 'surfaceInverse'],
    ['textInverseMuted', 'surfaceInverse'],
    ['onPrimary', 'primary'],
    ['onPrimary', 'primaryPressed'],
    ['onSecondary', 'secondary'],
    ['onSecondary', 'secondaryPressed'],
    ['onGhost', 'background'],
    ['onGhost', 'ghostPressed'],
    ['onSelected', 'selected'],
    ['onSelected', 'primaryPressed'],
    ['textMuted', 'chipPressed'],
    ['text', 'surfacePressed'],
    ['textMuted', 'surfacePressed'],
    ['textSoft', 'surfacePressed'],
    ['dangerAction', 'surface'],
    ['dangerAction', 'dangerActionPressed'],
    ['success', 'successSurface'],
    ['danger', 'dangerSurface'],
    ['warning', 'warningSurface'],
    ['warningStrong', 'warningSurface'],
    ['info', 'infoSurface'],
    ['gold', 'goldSurface'],
  ];

  it.each(pairs)('%s on %s meets 4.5:1', (text, surface) => {
    expect(contrast(colors[text], colors[surface])).toBeGreaterThanOrEqual(4.5);
  });

  // Every pressable control: its resting fill and its pressed fill. A press must show.
  const presses: [control: string, resting: ColorToken, pressed: ColorToken][] = [
    ['primary Button', 'primary', 'primaryPressed'],
    ['secondary Button and ExternalLinkButton', 'secondary', 'secondaryPressed'],
    ['danger Button', 'surface', 'dangerActionPressed'],
    ['ghost Button and IconButton on the screen', 'background', 'ghostPressed'],
    ['ghost Button and IconButton on a card', 'surface', 'ghostPressed'],
    ['ListItem and pressable Card', 'surface', 'surfacePressed'],
    ['unselected Chip', 'surface', 'chipPressed'],
    ['selected Chip', 'selected', 'primaryPressed'],
  ];

  it.each(presses)('the %s fill changes by at least 1.2:1 when pressed', (_control, resting, pressed) => {
    expect(contrast(colors[resting], colors[pressed])).toBeGreaterThanOrEqual(1.2);
  });
});
