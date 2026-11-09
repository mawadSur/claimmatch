import { useCallback } from 'react';
import { useWindowDimensions } from 'react-native';

import { maxFontScale } from '@/theme/tokens';

/** U+200B ZERO WIDTH SPACE: a place where a line may break, showing nothing. */
const ZERO_WIDTH_SPACE = '​';

/**
 * Hosts get the least room in the 16 pt label of a full-width button in a
 * card, such as the settlement page's "Official claim site (…)": the screen,
 * card and button padding, the borders and the button's icon take 148 pt of
 * the window's width. At the default text size hosts average 7.6 pt a
 * character in that font (acusettlement.com is 134 pt,
 * personalcareproductssettlement.com 261 pt) and the parentheses around them
 * 10 pt. Both grow with the text size, up to the label's largest multiplier.
 * On a 360 pt phone at the default size, 26 characters fit.
 */
const LABEL_CHROME = 148;
const HOST_CHAR_WIDTH = 7.6;
const PARENS_WIDTH = 10;
const NARROW_PHONE_WIDTH = 360;

/** Whether a host fits whole on a line of its own in the tightest host label, at this window width and text size. */
export function hostFitsWhole(host: string, windowWidth = NARROW_PHONE_WIDTH, fontScale = 1): boolean {
  const scale = Math.min(Math.max(fontScale, 1), maxFontScale.label);
  return (host.length * HOST_CHAR_WIDTH + PARENS_WIDTH) * scale <= windowWidth - LABEL_CHROME;
}

/**
 * A website host as shown on screen. A host too long for a line
 * ("personalcareproductssettlement.com", or a medium one at a large text
 * size) gets a zero-width space after each dot, so it wraps at a dot instead
 * of mid-word. One that fits stays whole: the line breaks before it
 * ("Official claim site" / "(acusettlement.com)"), not after its dot
 * ("Official claim site (acusettlement." / "com)"). For visible text only.
 * Without a width and text size it assumes a 360 pt phone at the default size.
 */
export function breakableHost(host: string, windowWidth?: number, fontScale?: number): string {
  return hostFitsWhole(host, windowWidth, fontScale) ? host : host.split('.').join(`.${ZERO_WIDTH_SPACE}`);
}

/**
 * The visible label and the accessibility label of a button or link whose
 * label names a host, built by `label` (the host alone by default). Only the
 * visible one gets the breaks: screen readers announce the host as it is.
 */
export function hostLabels(
  host: string,
  label: (host: string) => string = (shown) => shown,
  windowWidth?: number,
  fontScale?: number,
): HostLabels {
  return { label: label(breakableHost(host, windowWidth, fontScale)), accessibilityLabel: label(host) };
}

export interface HostLabels {
  label: string;
  accessibilityLabel: string;
}

/** hostLabels for this window's width and text size: a host that no longer fits at a larger text size wraps at a dot. */
export function useHostLabels(): (host: string, label?: (host: string) => string) => HostLabels {
  const { width, fontScale } = useWindowDimensions();
  return useCallback((host, label) => hostLabels(host, label, width, fontScale), [width, fontScale]);
}
