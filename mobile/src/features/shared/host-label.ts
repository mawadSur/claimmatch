/** U+200B ZERO WIDTH SPACE: a place where a line may break, showing nothing. */
const ZERO_WIDTH_SPACE = '​';

/**
 * The longest host shown whole. Hosts get the least room in the 16 pt label
 * of a full-width button in a card, such as the settlement page's "Official
 * claim site (…)": on a 360 pt wide phone the screen, card and button
 * padding, the borders and the button's icon leave 212 pt. Hosts average
 * 7.6 pt a character in that font (acusettlement.com is 134 pt,
 * personalcareproductssettlement.com 261 pt), so 26 characters and the
 * parentheses around them (10 pt) fit on a line of their own at the
 * default text size.
 */
const LONGEST_WHOLE_HOST = 26;

/**
 * A website host as shown on screen. A host too long for a line
 * ("personalcareproductssettlement.com") gets a zero-width space after each
 * dot, so it wraps at a dot instead of mid-word. A shorter one stays whole:
 * the line breaks before it ("Official claim site" / "(acusettlement.com)"),
 * not after its dot ("Official claim site (acusettlement." / "com)"). For
 * visible text only.
 */
export function breakableHost(host: string): string {
  return host.length > LONGEST_WHOLE_HOST ? host.split('.').join(`.${ZERO_WIDTH_SPACE}`) : host;
}

/**
 * The visible label and the accessibility label of a button or link whose
 * label names a host, built by `label` (the host alone by default). Only the
 * visible one gets the breaks: screen readers announce the host as it is.
 */
export function hostLabels(
  host: string,
  label: (host: string) => string = (shown) => shown,
): { label: string; accessibilityLabel: string } {
  return { label: label(breakableHost(host)), accessibilityLabel: label(host) };
}
