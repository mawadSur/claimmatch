import { isOpenForClaims } from '@/lib/open-for-claims';
import { settlementPath } from '@/lib/settlement-seo';
import type { Lawsuit } from '@/lib/types';

export const RELATED_SETTLEMENT_LIMIT = 4;

export interface RelatedSettlement {
  slug: string;
  title: string;
  category: string;
  deadline: string | null;
  path: string;
}

function deadlineSort(a: Pick<Lawsuit, 'deadline' | 'title'>, b: Pick<Lawsuit, 'deadline' | 'title'>): number {
  const aAt = a.deadline ? Date.parse(a.deadline) : Number.POSITIVE_INFINITY;
  const bAt = b.deadline ? Date.parse(b.deadline) : Number.POSITIVE_INFINITY;
  const aOk = Number.isFinite(aAt);
  const bOk = Number.isFinite(bAt);
  if (aOk && bOk && aAt !== bAt) return aAt - bAt;
  if (aOk !== bOk) return aOk ? -1 : 1;
  return a.title.localeCompare(b.title);
}

function toRelated(row: Lawsuit): RelatedSettlement {
  return {
    slug: row.slug,
    title: row.title,
    category: row.category,
    deadline: row.deadline,
    path: settlementPath(row.slug),
  };
}

/**
 * Other open, published settlements for internal links: same category first,
 * then the nearest listed deadlines. Never invents a title, payout or count.
 */
export function relatedSettlements(
  current: Pick<Lawsuit, 'slug' | 'category'>,
  catalog: readonly Lawsuit[],
  limit = RELATED_SETTLEMENT_LIMIT,
  now: Date = new Date(),
): RelatedSettlement[] {
  const cap = Math.max(0, Math.floor(limit));
  if (cap === 0) return [];

  const open = catalog.filter((row) => row.slug !== current.slug && isOpenForClaims(row, now));
  const sameCategory = open
    .filter((row) => row.category === current.category)
    .sort(deadlineSort);
  const picked = new Set<string>();
  const out: RelatedSettlement[] = [];

  for (const row of sameCategory) {
    if (out.length >= cap) break;
    picked.add(row.slug);
    out.push(toRelated(row));
  }
  if (out.length >= cap) return out;

  const byDeadline = open.filter((row) => !picked.has(row.slug)).sort(deadlineSort);
  for (const row of byDeadline) {
    if (out.length >= cap) break;
    out.push(toRelated(row));
  }
  return out;
}
