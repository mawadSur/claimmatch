/**
 * Text-free pieces shared by the claim page (ClaimFlow) and the one-click
 * screens: an external link, the numbered step shell and the polite
 * announcement line. ClaimFlow keeps its own wording (the app's copy cites
 * ClaimFlow.tsx as its source).
 */
import type { RefObject } from 'react';
import { CheckCircle2, ExternalLink } from 'lucide-react';

export function ExternalTextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** A numbered step card with a heading screen readers announce as "Step n: title". */
export function FilingStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-4">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">
            <span className="sr-only">{`Step ${n}: `}</span>
            {title}
          </h2>
          {children}
        </div>
      </div>
    </li>
  );
}

/** The page's polite status line (a report saved, a notice answered, a claim signed). */
export function Announcement({ message, focusRef }: { message: string; focusRef: RefObject<HTMLParagraphElement | null> }) {
  return (
    <div role="status" aria-live="polite">
      {message && (
        <p
          ref={focusRef}
          tabIndex={-1}
          className="flex items-start gap-2 rounded-xl bg-success-50 px-4 py-3 text-sm font-medium text-success-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {message}
        </p>
      )}
    </div>
  );
}
