import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Home, Stamp } from 'lucide-react';
import {
  FILED_API_PATH,
  FILED_TOKEN_PARAM,
  filedSigningSecret,
  hasFiledTokenParam,
  resolveFiledView,
  type FiledLinkView,
} from '@/lib/filed-link';
import { flags } from '@/lib/flags';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TITLES: Record<FiledLinkView['kind'], string> = {
  confirm: 'Mark this as filed',
  done: 'Marked as filed',
  invalid: 'This link doesn’t work',
  missing: 'Mark a claim as filed',
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = await searchParams;
  const view = flags.didYouFileEmail()
    ? resolveFiledView(params, filedSigningSecret())
    : { kind: 'missing' as const };
  return {
    title: TITLES[view.kind],
    description: 'Mark a settlement claim as filed on the official site.',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

const CLEAR_TOKEN_FROM_URL =
  "try{history.replaceState(history.state,'',location.pathname)}catch(e){}";

export default async function FiledPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const notice = typeof params.notice === 'string' ? params.notice : null;
  const view = flags.didYouFileEmail()
    ? resolveFiledView(params, filedSigningSecret())
    : { kind: 'missing' as const };

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
      {hasFiledTokenParam(params) && (
        <script dangerouslySetInnerHTML={{ __html: CLEAR_TOKEN_FROM_URL }} />
      )}
      <div className="container-narrow relative flex min-h-[60vh] items-center justify-center py-12 sm:py-24">
        <div className="reveal w-full max-w-md rounded-3xl border border-brand-100 bg-white/90 p-6 text-center shadow-card backdrop-blur sm:p-10">
          {view.kind === 'confirm' && <ConfirmView token={view.token} notice={notice} />}
          {view.kind === 'done' && <DoneView />}
          {view.kind === 'invalid' && (
            <ProblemView title={TITLES.invalid}>
              This link is missing or has expired. Open the email again and use its “I filed this
              claim” button. You can also sign in and mark it as filed on its page.
            </ProblemView>
          )}
          {view.kind === 'missing' && (
            <ProblemView title={TITLES.missing}>
              Open the email we sent and use its “I filed this claim” button. You can also sign in
              and mark it as filed from your dashboard.
            </ProblemView>
          )}
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

function ConfirmView({ token, notice }: { token: string; notice: string | null }) {
  return (
    <>
      <IconTile tone="brand">
        <Stamp className="h-7 w-7" />
      </IconTile>
      <h1 className="mt-6 text-2xl font-extrabold sm:text-3xl">Mark this claim as filed?</h1>
      <p className="mx-auto mt-3 max-w-sm text-ink-muted">
        This records that you submitted the claim on the official settlement site. Filing there is
        always free. Nothing changes until you confirm.
      </p>
      {notice === 'failed' && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-danger-500/30 bg-danger-50 px-4 py-3 text-left text-sm font-medium text-danger-700"
        >
          We couldn’t save that just now, so nothing changed. Please try again.
        </p>
      )}
      {notice === 'busy' && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-danger-500/30 bg-danger-50 px-4 py-3 text-left text-sm font-medium text-danger-700"
        >
          There were too many tries from your network. Wait a minute, then try again.
        </p>
      )}
      <form
        method="post"
        action={FILED_API_PATH}
        className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
      >
        <input type="hidden" name={FILED_TOKEN_PARAM} value={token} />
        <button type="submit" className="btn-primary w-full sm:w-auto">
          I filed this claim
        </button>
        <Link href="/dashboard" className="btn-ghost w-full sm:w-auto">
          Cancel
        </Link>
      </form>
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
        Saved. This claim now shows as filed on your dashboard. You can add a confirmation number
        later if the official site gave you one.
      </p>
      <Link href="/dashboard" className="btn-primary mt-8 inline-flex">
        <Home className="h-4 w-4" aria-hidden />
        Go to dashboard
      </Link>
    </>
  );
}

function ProblemView({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div
        aria-hidden="true"
        className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-danger-50 text-danger-700 ring-1 ring-danger-100"
      >
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h1 className="mt-6 text-2xl font-extrabold sm:text-3xl">{title}</h1>
      <p className="mx-auto mt-3 max-w-sm text-ink-muted">{children}</p>
      <Link href="/dashboard" className="btn-secondary mt-8 inline-flex">
        Go to dashboard
      </Link>
    </>
  );
}
