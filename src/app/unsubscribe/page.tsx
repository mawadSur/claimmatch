import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Home, MailX, Settings2 } from 'lucide-react';
import {
  TOKEN_PARAM,
  UNSUBSCRIBE_API_PATH,
  resolveUnsubscribeView,
  type UnsubscribeNotice,
  type UnsubscribeView,
} from '@/lib/unsubscribe';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TITLES: Record<UnsubscribeView['kind'], string> = {
  confirm: 'Unsubscribe from emails',
  done: 'You’re unsubscribed',
  invalid: 'This unsubscribe link doesn’t work',
  failed: 'We couldn’t unsubscribe you',
  missing: 'Unsubscribe from emails',
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const view = resolveUnsubscribeView(await searchParams);
  return {
    title: TITLES[view.kind],
    description: 'Stop getting ClaimMatch emails about new settlements.',
    robots: { index: false, follow: false },
    // The link carries an encoded email address; never send it on as a referrer.
    referrer: 'no-referrer',
  };
}

/**
 * The link's token is an encoded email address. This runs while the page is
 * still loading, before analytics starts, and removes the token from the
 * address bar so page views and clicks never record it. The form below still
 * carries the token.
 */
const CLEAR_TOKEN_FROM_URL =
  "try{history.replaceState(history.state,'',location.pathname)}catch(e){}";

const NOTICES: Record<UnsubscribeNotice, string> = {
  failed: 'We couldn’t save that just now, so nothing changed. Please try again.',
  busy: 'There were too many tries from your network. Wait a minute, then try again.',
};

const textLink =
  'rounded font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2';

export default async function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const view = resolveUnsubscribeView(await searchParams);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
      {view.kind === 'confirm' && (
        <script dangerouslySetInnerHTML={{ __html: CLEAR_TOKEN_FROM_URL }} />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-40 h-72 w-72 rounded-full bg-brand-100/50 blur-3xl"
      />

      <div className="container-narrow relative flex min-h-[60vh] items-center justify-center py-12 sm:py-24">
        <div className="reveal w-full max-w-md rounded-3xl border border-brand-100 bg-white/90 p-6 text-center shadow-card backdrop-blur sm:p-10">
          {view.kind === 'confirm' && <ConfirmView view={view} />}
          {view.kind === 'done' && <DoneView />}
          {view.kind === 'invalid' && (
            <ProblemView title={TITLES.invalid}>
              Part of the link may be missing or changed. Open the email again and use its
              Unsubscribe link. You can also sign in and turn off emails in Settings.
            </ProblemView>
          )}
          {view.kind === 'failed' && (
            <ProblemView title={TITLES.failed}>
              Something went wrong on our end, and nothing changed. Open the email again and use
              its Unsubscribe link to try again. You can also sign in and turn off emails in
              Settings.
            </ProblemView>
          )}
          {view.kind === 'missing' && <MissingView />}
        </div>
      </div>
    </section>
  );
}

function IconTile({ tone, children }: { tone: 'brand' | 'success'; children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl text-white shadow-card ${
        tone === 'success' ? 'bg-success-600' : 'bg-brand-600'
      }`}
    >
      {children}
    </div>
  );
}

function ConfirmView({ view }: { view: Extract<UnsubscribeView, { kind: 'confirm' }> }) {
  return (
    <>
      <IconTile tone="brand">
        <MailX className="h-7 w-7" />
      </IconTile>
      <h1 className="mt-6 text-2xl font-extrabold sm:text-3xl">
        Unsubscribe <span className="break-words text-brand-700">{view.maskedEmail}</span> from
        ClaimMatch emails?
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-ink-muted">
        You&rsquo;ll stop getting emails about new settlements. We may still email you about your
        account or a claim you track.
      </p>

      {view.notice && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-danger-500/30 bg-danger-50 px-4 py-3 text-left text-sm font-medium text-danger-700"
        >
          {NOTICES[view.notice]}
        </p>
      )}

      <form
        method="post"
        action={UNSUBSCRIBE_API_PATH}
        className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
      >
        <input type="hidden" name={TOKEN_PARAM} value={view.token} />
        <button type="submit" className="btn-primary w-full sm:w-auto">
          Yes, unsubscribe
        </button>
        <Link href="/" className="btn-ghost w-full sm:w-auto">
          Keep my emails
        </Link>
      </form>

      <p className="mt-6 text-sm text-ink-muted">
        Nothing changes until you choose &ldquo;Yes, unsubscribe.&rdquo;
      </p>
    </>
  );
}

function DoneView() {
  return (
    <>
      <IconTile tone="success">
        <CheckCircle2 className="h-7 w-7" />
      </IconTile>
      <h1 className="mt-6 text-2xl font-extrabold sm:text-3xl">{TITLES.done}</h1>
      <p className="mx-auto mt-3 max-w-sm text-ink-muted">
        We won&rsquo;t send you emails about new settlements anymore. We may still email you about
        your account or a claim you track.
      </p>
      <p className="mx-auto mt-3 max-w-sm text-ink-muted">
        Changed your mind? Sign in and turn emails back on in{' '}
        <Link href="/settings" className={textLink}>
          Settings
        </Link>
        .
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/" className="btn-primary w-full sm:w-auto">
          <Home className="h-4 w-4" aria-hidden="true" /> Back to home
        </Link>
        <Link href="/settings" className="btn-secondary w-full sm:w-auto">
          <Settings2 className="h-4 w-4" aria-hidden="true" /> Email settings
        </Link>
      </div>
      <BrowseLink />
    </>
  );
}

function ProblemView({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <IconTile tone="brand">
        <AlertTriangle className="h-7 w-7" />
      </IconTile>
      <h1 className="mt-6 text-2xl font-extrabold sm:text-3xl">{title}</h1>
      <p className="mx-auto mt-3 max-w-sm text-ink-muted">{children}</p>
      <SettingsAndHome />
      <BrowseLink />
    </>
  );
}

function MissingView() {
  return (
    <>
      <IconTile tone="brand">
        <MailX className="h-7 w-7" />
      </IconTile>
      <h1 className="mt-6 text-2xl font-extrabold sm:text-3xl">{TITLES.missing}</h1>
      <p className="mx-auto mt-3 max-w-sm text-ink-muted">
        Open any ClaimMatch email and use the Unsubscribe link at the bottom. Or sign in and turn
        off emails in Settings.
      </p>
      <SettingsAndHome />
      <BrowseLink />
    </>
  );
}

function SettingsAndHome() {
  return (
    <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
      <Link href="/settings" className="btn-primary w-full sm:w-auto">
        <Settings2 className="h-4 w-4" aria-hidden="true" /> Email settings
      </Link>
      <Link href="/" className="btn-ghost w-full sm:w-auto">
        Back to home
      </Link>
    </div>
  );
}

function BrowseLink() {
  return (
    <Link
      href="/lawsuits"
      className="mt-6 inline-flex items-center gap-1 rounded text-sm font-semibold text-brand-700 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
    >
      Browse open settlements <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
