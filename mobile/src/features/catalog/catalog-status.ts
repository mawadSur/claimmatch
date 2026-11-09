import { catalog } from '@/copy/catalog';

/**
 * The status line under the filters (src/app/lawsuits/page.tsx, role
 * "status"): how many open settlements are shown, then the active filters,
 * with the category and the search term in bold.
 */

export interface CatalogStatusInput {
  /** The catalog could not be loaded (and there is nothing to show). */
  failed: boolean;
  /** Rows shown after search and filters. */
  count: number;
  category?: string | null;
  /** The cleaned search term (cleanSearchTerm). */
  q?: string;
  hasDeadline?: boolean;
  proofNotRequired?: boolean;
}

export interface StatusSegment {
  text: string;
  /** Shown in bold (the web's font-semibold text-ink), such as the category. */
  strong?: boolean;
}

/** The status line as text segments, in the web's order. */
export function catalogStatusSegments(input: CatalogStatusInput): StatusSegment[] {
  if (input.failed) return [{ text: catalog.statusError.text }];

  const noun = input.count === 1 ? catalog.statusSettlement.text : catalog.statusSettlements.text;
  const segments: StatusSegment[] = [
    {
      text:
        input.count === 0
          ? catalog.statusNone.text
          : `${catalog.statusShowing.text} ${input.count} ${catalog.statusOpen.text} ${noun}`,
    },
  ];
  if (input.category) {
    segments.push({ text: ` ${catalog.statusIn.text} ` }, { text: input.category, strong: true });
  }
  if (input.q) {
    segments.push({ text: ` ${catalog.statusMatching.text} “` }, { text: input.q, strong: true }, { text: '”' });
  }
  if (input.hasDeadline) segments.push({ text: ` ${catalog.statusWithDeadline.text}` });
  if (input.proofNotRequired) segments.push({ text: ` ${catalog.statusProofNotRequired.text}` });
  return segments;
}

/** The status line as one string, as screen readers announce it. */
export function catalogStatusText(input: CatalogStatusInput): string {
  return catalogStatusSegments(input)
    .map((segment) => segment.text)
    .join('');
}
