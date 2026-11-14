import type { CSSProperties } from 'react';
import Link from 'next/link';
import {
  ArrowRight, BellRing, ClipboardCopy, FileSearch, ListChecks, MailPlus, Search, TrendingUp,
} from 'lucide-react';
import { flags } from '@/lib/flags';

interface Feature {
  icon: typeof Search;
  title: string;
  body: string;
}

type FeatureFlags = Pick<typeof flags, 'deadlineReminders' | 'matchAlertEmails' | 'noticeLookup'>;

/**
 * What the product does today. Same rule as HomeTrust: every line must stay
 * literally true, so features behind a flag only appear when the flag is on.
 */
export function homeFeatures(f: FeatureFlags = flags): Feature[] {
  const list: Feature[] = [
    {
      icon: Search,
      title: 'Open settlements in one place',
      body: 'Search by company or filter by category. Each listing shows the payout, the deadline and the proof rule as the source states them.',
    },
    {
      icon: TrendingUp,
      title: 'Biggest payouts and nearest deadlines',
      body: 'See the settlements with the highest listed payouts and the ones closing soonest, so the time-sensitive ones don’t slip by.',
    },
    {
      icon: ClipboardCopy,
      title: 'Your details, ready to copy',
      body: 'Save your name, address and email once. Copy them into each official claim form instead of typing them again.',
    },
    {
      icon: ListChecks,
      title: 'One list for every claim',
      body: 'Mark what you filed and save the confirmation number from the official site. Claims are grouped by what to do next.',
    },
  ];
  if (f.deadlineReminders()) {
    list.push({
      icon: BellRing,
      title: 'Deadline reminders',
      body: 'If you opt in to email, we remind you 7 days and 1 day before the deadline on a claim you haven’t filed yet.',
    });
  }
  if (f.matchAlertEmails()) {
    list.push({
      icon: MailPlus,
      title: 'New match alerts',
      body: 'Opt in and we email you when a newly verified settlement may fit your profile, at most once a week.',
    });
  }
  if (f.noticeLookup()) {
    list.push({
      icon: FileSearch,
      title: 'Check a notice you got',
      body: 'Paste the settlement name, administrator or claim ID from a notice to find the listing and its official link.',
    });
  }
  return list;
}

export function HomeFeatures({ items = homeFeatures() }: { items?: Feature[] }) {
  return (
    <section aria-labelledby="features-heading" className="section-y bg-white">
      <div className="container-page">
        <div
          className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between"
          data-reveal
        >
          <div className="max-w-2xl">
            <p className="eyebrow">Features</p>
            <h2 id="features-heading" className="mt-3 text-4xl font-medium leading-[1.08] sm:text-5xl">
              Everything you need to stay on top of your claims
            </h2>
          </div>
          <Link href="/how-it-works" className="btn-secondary shrink-0">
            How it works <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ icon: Icon, title, body }, i) => (
            <li
              key={title}
              data-reveal
              style={{ '--reveal-at': (i % 3) * 6 } as CSSProperties}
              className="surface p-6"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-slate-200">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
