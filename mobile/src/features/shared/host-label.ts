/** U+200B ZERO WIDTH SPACE: a place where a line may break, showing nothing. */
const ZERO_WIDTH_SPACE = '​';

/**
 * A website host as shown on screen: a zero-width space after each dot, so a
 * host too long for its line ("personalcareproductssettlement.com") wraps at
 * a dot instead of mid-word. For visible text only.
 */
export function breakableHost(host: string): string {
  return host.split('.').join(`.${ZERO_WIDTH_SPACE}`);
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
