/**
 * One piece of user-visible copy (plan 3.2, rule 1).
 *
 * Reuse the website's wording verbatim and cite where it came from, so a
 * parity test can find `text` in `source`. Only web-only words (page, tab,
 * click, "refresh the page") may change, and such entries are `mobileOnly`.
 */
export interface CopyEntry {
  /** The exact text people see or hear. */
  readonly text: string;
  /**
   * Repo-relative web file the text is copied from, for example
   * 'src/components/claims/claim-api.ts'. Text with no web original cites the
   * plan section that introduced it.
   */
  readonly source: string;
  /** The wording differs from the web, or has no web original. */
  readonly mobileOnly?: true;
}

/** Keeps entry keys and literal types while checking the shape. */
export function defineCopy<const T extends Record<string, CopyEntry>>(entries: T): T {
  return entries;
}
