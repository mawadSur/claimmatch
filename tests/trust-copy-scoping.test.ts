import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ONE_CLICK_SELF_FILE_NOTE, PREFILL_SELF_FILE_NOTE } from '@/lib/copy';

/**
 * Fix 9: every limitation has to be true of the listing or the claim it sits
 * beside, so the same member is never told two different things.
 *
 * Two contradictions this locks down. (a) /lawsuits carried a page-wide "we
 * haven't checked them against the official notices yet" above cards that say
 * "Verified" or "Checked against the official notice on <date>"; per-listing
 * truth now comes from ListingVerification on each card. (b) The claim page
 * printed "Lawsuit AI doesn't file claims for you" and "Lawsuit AI never files
 * for you" while the global footer's SHORT_DISCLAIMER offers Easy submit on
 * eligible claims. Both statements are now scoped to the claim on screen.
 *
 * These are source-text guards, so they hold whatever the flags are set to.
 * The footer line itself is deliberately untouched: it is accurate, and
 * tests/home-sections.test.ts pins it word for word.
 */

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8').replace(
    /&rsquo;|&#x27;|&apos;/g,
    '’',
  );

const ABSOLUTE_STATUS = /Lawsuit AI doesn[’']t file claims for you/;
const ABSOLUTE_PACKET = /Lawsuit AI never files for you/;

describe('claim-scoped limitations, not site-wide denials', () => {
  it.each(['src/components/claims/ClaimFlow.tsx', 'src/components/claims/PrefillPacket.tsx'])(
    '%s states no absolute denial',
    (file) => {
      const text = read(file);
      expect(text).not.toMatch(ABSOLUTE_STATUS);
      expect(text).not.toMatch(ABSOLUTE_PACKET);
    },
  );

  it('both reach for the per-claim wording instead', () => {
    expect(read('src/components/claims/ClaimFlow.tsx')).toContain('ONE_CLICK_SELF_FILE_NOTE');
    expect(read('src/components/claims/PrefillPacket.tsx')).toContain('PREFILL_SELF_FILE_NOTE');
    for (const note of [ONE_CLICK_SELF_FILE_NOTE, PREFILL_SELF_FILE_NOTE]) {
      expect(note).toContain('file this claim for you');
      expect(note).not.toMatch(ABSOLUTE_STATUS);
      expect(note).not.toMatch(ABSOLUTE_PACKET);
    }
  });
});

describe('the catalog denies nothing page-wide', () => {
  it('/lawsuits makes no blanket unchecked claim, in the body or the meta', () => {
    const page = read('src/app/lawsuits/page.tsx');
    expect(page).not.toContain('checked them against the official notices');
    expect(page).not.toContain('Listings are not yet verified by Lawsuit AI');
  });

  it('the card carries the per-listing line instead', () => {
    expect(read('src/components/LawsuitCard.tsx')).toContain('ListingVerification');
  });
});
