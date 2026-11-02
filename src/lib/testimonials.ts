/**
 * Reviews from real ClaimMatch users, shown on the home page.
 *
 * Only real reviews go here: words a real user wrote or said, published with
 * their written permission. Never write, reword or "seed" a review, and never
 * use AI to draft one. Invented reviews are deceptive to the people reading
 * them and are banned by the FTC's rule on consumer reviews and testimonials
 * (16 CFR Part 465), with civil penalties per violation. The site's policy is
 * the same: no invented payouts, reviews or testimonials.
 *
 * To add one:
 *   1. Ask someone who used ClaimMatch for a sentence or two about it.
 *   2. Get written permission to publish it under the name they choose
 *      (first name and last initial is typical).
 *   3. Paste their words exactly. Trimming for length is fine; rewording is not.
 *   4. Fill in every field. The home page section appears once there are
 *      MIN_TESTIMONIALS publishable entries.
 */
export interface Testimonial {
  /** Their words, verbatim. */
  quote: string;
  /** The name they agreed to show, e.g. "Maria G." */
  name: string;
  /** Optional, if they agreed, e.g. "Austin, TX". */
  location?: string;
  /** Optional context, e.g. "Filed for the Six Flags fees settlement". */
  context?: string;
  /** When we received it, YYYY-MM-DD. */
  receivedOn: string;
  /** Where the words came from, so anyone on the team can trace them. */
  source: 'email' | 'survey' | 'support' | 'review-site';
  /** Written permission to publish with the name shown. */
  consentToPublish: true;
}

export const TESTIMONIALS: readonly Testimonial[] = [];

/** One or two quotes look thin; the section waits until there are this many. */
export const MIN_TESTIMONIALS = 3;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Entries that are complete and consented. Anything else never renders. */
export function publishableTestimonials(
  list: readonly Testimonial[] = TESTIMONIALS,
): Testimonial[] {
  return list.filter(
    (t) =>
      t.consentToPublish === true &&
      t.quote.trim().length > 0 &&
      t.name.trim().length > 0 &&
      DATE.test(t.receivedOn),
  );
}
