/**
 * Small shared pieces of the one-click screens: Jev hints and errors next to
 * a field, a tickable box with a 44 pt target, and a message line. The member
 * always ticks boxes themselves: `checked` starts from what they saved, never
 * from a default.
 */
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { JevIssueView } from '@/lib/filing/v2/contract';
import { cn } from '@/lib/utils';

const ISSUE_CLASS: Record<JevIssueView['severity'], string> = {
  block: 'text-danger-700',
  warn: 'text-amber-800',
  info: 'text-ink-muted',
};

/** Jev's hints for one field, shown right under it (id links them to the input). */
export function FieldIssues({ id, issues }: { id: string; issues: readonly JevIssueView[] }) {
  if (issues.length === 0) return null;
  return (
    <ul id={id} className="mt-1.5 space-y-1">
      {issues.map((issue) => (
        <li key={`${issue.rule_id}-${issue.code}`} className={cn('flex items-start gap-1.5 text-sm', ISSUE_CLASS[issue.severity])}>
          {issue.severity === 'info' ? (
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** An error placed next to its field. */
export function FieldError({ id, message }: { id: string; message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-medium text-danger-700">
      {message}
    </p>
  );
}

/** A checkbox the member ticks themselves, with a 44 pt tap target. */
export function TickBox({
  id,
  checked,
  onChange,
  disabled = false,
  describedBy,
  invalid = false,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex min-h-tap cursor-pointer items-start gap-3 py-2 text-sm text-ink">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={describedBy}
        aria-invalid={invalid ? true : undefined}
      />
      <span>{children}</span>
    </label>
  );
}

/** A status or error line under a form (polite for status, assertive for errors). */
export function FormMessage({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'mt-3 flex items-start gap-2 text-sm',
        tone === 'error' ? 'font-medium text-danger-700' : 'text-success-700',
      )}
    >
      {tone === 'error' ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      <span>{children}</span>
    </p>
  );
}

/** ids for aria-describedby, skipping the empty ones. */
export function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
  const list = ids.filter(Boolean);
  return list.length ? list.join(' ') : undefined;
}
