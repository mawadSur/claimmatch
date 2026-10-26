/**
 * Serialize structured data for a <script type="application/ld+json"> tag.
 *
 * JSON.stringify leaves "<" alone, so a value containing "</script>" (for
 * example a settlement title from a third-party feed) would close the tag and
 * inject markup. Escape the HTML-significant characters and the two line
 * terminators that JSON allows but older JavaScript parsers reject.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
