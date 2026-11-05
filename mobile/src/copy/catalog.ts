import { defineCopy } from './types';

/**
 * The Settlements tab, /lawsuits (plan 3.3 "Settlements (catalog)"): the
 * page (src/app/lawsuits/page.tsx), its filter bar
 * (src/components/LawsuitFilters.tsx) and the settlement card
 * (src/components/LawsuitCard.tsx). The status line is built from fragments
 * that each appear verbatim in the page, joined with single spaces.
 */
export const catalog = defineCopy({
  title: {
    text: 'Open settlements',
    source: 'src/app/lawsuits/page.tsx',
  },
  intro: {
    text: 'Class action settlements that are taking claims now. Check who qualifies on the official site, file there for free, and keep track of your claim in ClaimMatch.',
    source: 'src/app/lawsuits/page.tsx',
  },

  // Search and filters (src/components/LawsuitFilters.tsx) -------------------
  searchLabel: {
    text: 'Search open settlements',
    source: 'src/components/LawsuitFilters.tsx',
  },
  searchPlaceholder: {
    text: 'Search: data breach, overdraft fees, vehicle…',
    source: 'src/components/LawsuitFilters.tsx',
  },
  clearSearch: {
    text: 'Clear search',
    source: 'src/components/LawsuitFilters.tsx',
  },
  all: {
    text: 'All',
    source: 'src/components/LawsuitFilters.tsx',
  },
  hasDeadline: {
    text: 'Has a deadline',
    source: 'src/components/LawsuitFilters.tsx',
  },
  noProofRequired: {
    text: 'No proof required',
    source: 'src/components/LawsuitFilters.tsx',
  },
  clearAllFilters: {
    text: 'Clear all filters',
    source: 'src/components/LawsuitFilters.tsx',
  },

  // Status line (src/app/lawsuits/page.tsx) ----------------------------------
  statusError: {
    text: 'Settlements didn’t load.',
    source: 'src/app/lawsuits/page.tsx',
  },
  statusNone: {
    text: 'No open settlements found',
    source: 'src/app/lawsuits/page.tsx',
  },
  /** "Showing {count} open settlement(s)". */
  statusShowing: {
    text: 'Showing',
    source: 'src/app/lawsuits/page.tsx',
  },
  statusOpen: {
    text: 'open',
    source: 'src/app/lawsuits/page.tsx',
  },
  statusSettlement: {
    text: 'settlement',
    source: 'src/app/lawsuits/page.tsx',
  },
  statusSettlements: {
    text: 'settlements',
    source: 'src/app/lawsuits/page.tsx',
  },
  /** " in {category}". */
  statusIn: {
    text: 'in',
    source: 'src/app/lawsuits/page.tsx',
  },
  /** " matching “{q}”". */
  statusMatching: {
    text: 'matching',
    source: 'src/app/lawsuits/page.tsx',
  },
  statusWithDeadline: {
    text: 'with a listed deadline',
    source: 'src/app/lawsuits/page.tsx',
  },
  statusProofNotRequired: {
    text: 'that list proof as not required',
    source: 'src/app/lawsuits/page.tsx',
  },

  // Error and empty states (src/app/lawsuits/page.tsx) -----------------------
  errorTitle: {
    text: 'We couldn’t load settlements right now',
    source: 'src/app/lawsuits/page.tsx',
  },
  errorBody: {
    text: 'This is on our side. Please try again in a few minutes.',
    source: 'src/app/lawsuits/page.tsx',
  },
  emptyFilteredTitle: {
    text: 'No open settlements match your search',
    source: 'src/app/lawsuits/page.tsx',
  },
  emptyFilteredBody: {
    text: 'Try a different word, or clear your filters to see every open settlement.',
    source: 'src/app/lawsuits/page.tsx',
  },
  emptyTitle: {
    text: 'No open settlements to show right now',
    source: 'src/app/lawsuits/page.tsx',
  },
  emptyBody: {
    text: 'Check back soon. We update this list every day.',
    source: 'src/app/lawsuits/page.tsx',
  },
  clearFilters: {
    text: 'Clear filters',
    source: 'src/app/lawsuits/page.tsx',
  },

  // The settlement card (src/components/LawsuitCard.tsx) ---------------------
  noDeadlineListed: {
    text: 'No deadline listed',
    source: 'src/components/LawsuitCard.tsx',
  },
  deadline: {
    text: 'Deadline',
    source: 'src/components/LawsuitCard.tsx',
  },
  proof: {
    text: 'Proof',
    source: 'src/components/LawsuitCard.tsx',
  },
  payoutAsListed: {
    text: 'Payout, as listed',
    source: 'src/components/LawsuitCard.tsx',
  },
  notStated: {
    text: 'Not stated',
    source: 'src/components/LawsuitCard.tsx',
  },
  /** Spoken as "Start your claim for {title}" (shared.linkForTitle). */
  startYourClaim: {
    text: 'Start your claim',
    source: 'src/components/LawsuitCard.tsx',
  },
  details: {
    text: 'Details',
    source: 'src/components/LawsuitCard.tsx',
  },
  /** Spoken name of "Details" (the web's sr-only " about {title}"). */
  detailsAbout: {
    text: 'Details about {title}',
    source: 'src/components/LawsuitCard.tsx',
    mobileOnly: true,
  },
});
