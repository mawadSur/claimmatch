import { defineCopy } from './types';

/**
 * Store listing text for the App Store and Google Play (plan 5). It lives
 * here so the copy guards and the parity checks read it before it is pasted
 * into App Store Connect or the Play Console; the app never shows it. Only
 * wording the website already uses (SITE in src/lib/utils.ts) is filled in.
 * The rest (promotional text, the full description, keywords, review notes)
 * is written at M7 under the same copy rules, and the fee wording is
 * reviewed with FEE_DISCLOSURE_ENABLED. Never reuse the root package.json
 * description ("you're eligible for"), which the guards ban.
 */
export const store = defineCopy({
  /** Both stores' app name (30 characters at most). */
  name: { text: 'Lawsuit AI', source: 'src/lib/utils.ts' },
  /** App Store subtitle (30 characters at most). */
  subtitle: { text: 'Free claim assistant', source: 'src/lib/utils.ts' },
  /** Google Play short description (80 characters at most). */
  shortDescription: { text: 'Free claim assistant for class-action settlements', source: 'src/lib/utils.ts' },
  /** First paragraph of the full description on both stores (4,000 characters at most in all). */
  descriptionLead: {
    text: 'Find open class-action settlements, check who qualifies on the official notice, file on the official site, and keep track of your claims. Free.',
    source: 'src/lib/utils.ts',
  },
});
