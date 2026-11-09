import {
  SETTLEMENT_GUIDES,
  SETTLEMENT_GUIDES_VERSION,
  setGuideOverrides,
  type SettlementGuide,
} from '@shared/lib/settlement-guides';
import type { QueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { dataKeys } from './keys';

/**
 * The official-notice guides the catalog and settlement screens overlay
 * (src/lib/settlement-guides.ts, read by ./catalog, which also takes the
 * settlement screen's proof note and FAQ from them). GET /api/mobile/config
 * serves the server's, which its claim screen, dashboard and reminders
 * already use, so a guide edit reaches every screen without a store update.
 * Until the config answers, and when it has none (an older server, or a list
 * that does not parse), the guides bundled with the app are used.
 */

const text = z.string().trim().min(1);
/** A malformed optional fact reads as missing, as on a catalog row. */
const optionalText = text.optional().catch(undefined);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Catalog slugs only: they go into the catalog query's filter. */
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/**
 * The facts that decide what a row shows are required; a proof rule the app
 * does not know reads as unknown. The app never shows sourceChecked.
 */
const guideSchema = z.object({
  slugs: z.array(slug).min(1),
  officialUrl: z.string().regex(/^https:\/\/\S+$/),
  sourceChecked: z.string().catch(''),
  administrator: optionalText,
  eligibilityText: text,
  typicalPayout: text,
  deadline: isoDate,
  proof: z.enum(['yes', 'no', 'optional', 'unknown']).catch('unknown'),
  proofDetail: text,
  summary: optionalText,
  description: optionalText,
  extraFaqs: z.array(z.object({ q: text, a: text })).optional().catch(undefined),
});

/** The config's guide list. One unreadable guide drops the list, and the bundled guides stay. */
export const configGuidesSchema = z.array(guideSchema).max(500).optional().catch(undefined);

/** The config's guidesVersion (guidesVersion in src/lib/settlement-guides.ts). */
export const guidesVersionSchema = z
  .string()
  .regex(/^[0-9a-z]{1,32}$/)
  .optional()
  .catch(undefined);

export interface GuidesInUse {
  /** Their guidesVersion, sent with the next config request. */
  version: string;
  guides: readonly SettlementGuide[];
  /** The server's: sent with the config, or confirmed by its version. False for the bundled ones. */
  fromServer: boolean;
}

const BUNDLED: GuidesInUse = { version: SETTLEMENT_GUIDES_VERSION, guides: SETTLEMENT_GUIDES, fromServer: false };
let inUse: GuidesInUse = BUNDLED;

/** The guides the catalog and settlement screens apply now. */
export function guidesInUse(): GuidesInUse {
  return inUse;
}

/**
 * Takes the guides of a config answer, before React renders it: its list when
 * it sent one; the guides in use when its version says the app already has
 * them; otherwise the bundled ones. True when that changes the guides in use
 * (their version), so screens built with the old ones must be read again.
 */
export function applyConfigGuides(config: { guidesVersion?: string; guides?: SettlementGuide[] }): boolean {
  const { guidesVersion: version, guides } = config;
  const next: GuidesInUse =
    version && guides
      ? { version, guides, fromServer: true }
      : version && version === inUse.version
        ? { ...inUse, fromServer: true }
        : BUNDLED;
  const changed = next.version !== inUse.version;
  inUse = next;
  setGuideOverrides(next.guides === SETTLEMENT_GUIDES ? null : next.guides);
  return changed;
}

/**
 * Reads the catalog and every settlement screen again, mounted or not, with
 * the guides now in use. A catalog read still on its way is cancelled first:
 * its filter named the old guides' slugs, and invalidating does not restart
 * a read before the catalog has rows (the first one, at a cold start), so a
 * slug only the new guides name would stay missing until the next refresh.
 */
export async function refetchGuidedQueries(client: QueryClient): Promise<void> {
  await client.cancelQueries({ queryKey: dataKeys.catalog });
  await Promise.all([
    client.invalidateQueries({ queryKey: dataKeys.catalog, refetchType: 'all' }),
    client.invalidateQueries({ queryKey: dataKeys.settlements, refetchType: 'all' }),
  ]);
}
