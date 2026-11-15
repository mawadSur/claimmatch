/**
 * Small presentational pieces for the filing console, in the admin area's
 * style (white cards, brand badges, field-label / field-input). No hooks, so
 * both server and client components can use them.
 */
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, OctagonX } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiError, FieldIssue } from './api';

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('rounded-2xl border border-gray-100 bg-white p-5 shadow-card', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-ink">{title}</h3>
          {description ? <p className="mt-1 max-w-3xl text-sm text-ink-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

const TONES = {
  info: { box: 'border-brand-100 bg-brand-50 text-brand-900', Icon: Info },
  warn: { box: 'border-gold-100 bg-gold-50 text-gold-700', Icon: AlertTriangle },
  danger: { box: 'border-danger-50 bg-danger-50 text-danger-700', Icon: OctagonX },
  success: { box: 'border-success-100 bg-success-50 text-success-700', Icon: CheckCircle2 },
} as const;

export type Tone = keyof typeof TONES;

export function Notice({ tone = 'info', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const { box, Icon } = TONES[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} className={cn('flex gap-2 rounded-xl border p-3 text-sm', box, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

export function FieldIssues({ issues }: { issues: readonly FieldIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-danger-700">
      {issues.map((issue, i) => (
        <li key={`${issue.path}-${i}`}>
          {issue.path ? <span className="font-mono">{issue.path}</span> : null}
          {issue.path ? ': ' : null}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

export function ErrorNote({ error }: { error: ApiError | string | null | undefined }) {
  if (!error) return null;
  if (typeof error === 'string') return <Notice tone="danger">{error}</Notice>;
  return (
    <Notice tone="danger">
      <p>{error.message}</p>
      {error.retryAfter ? <p className="text-xs">Try again in {error.retryAfter} seconds.</p> : null}
      <FieldIssues issues={error.fields} />
    </Notice>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-ink-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </p>
  );
}

/** Literal class names, so Tailwind keeps every one. */
const BADGE_CLASS = {
  green: 'badge-green',
  red: 'badge-red',
  gold: 'badge-gold',
  gray: 'badge-gray',
  brand: 'badge-brand',
} as const;

export type BadgeTone = keyof typeof BADGE_CLASS;

export function Badge({ tone = 'gray', children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn(BADGE_CLASS[tone], 'gap-1 whitespace-nowrap')}>
      {children}
    </span>
  );
}

/* Form fields ----------------------------------------------------------------------- */

const INPUT = 'field-input py-2 text-sm disabled:bg-gray-50 disabled:text-ink-muted';

function Hint({ children }: { children?: ReactNode }) {
  return children ? <p className="mt-1 text-xs text-ink-muted">{children}</p> : null;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
  type = 'text',
  hint,
  maxLength,
  mono,
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  type?: 'text' | 'email' | 'url' | 'date' | 'datetime-local';
  hint?: ReactNode;
  maxLength?: number;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="field-label text-xs" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        className={cn(INPUT, mono && 'font-mono')}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <Hint>{hint}</Hint>
    </div>
  );
}

export function AreaField({
  id,
  label,
  value,
  onChange,
  disabled,
  rows = 3,
  hint,
  mono,
  placeholder,
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  rows?: number;
  hint?: ReactNode;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="field-label text-xs" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        className={cn(INPUT, mono && 'font-mono text-xs')}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={!mono}
        onChange={(e) => onChange(e.target.value)}
      />
      <Hint>{hint}</Hint>
    </div>
  );
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  disabled,
  min,
  max,
  step,
  hint,
}: {
  id: string;
  label: ReactNode;
  value: number | null | undefined;
  /** A cleared input gives undefined. */
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number | 'any';
  hint?: ReactNode;
}) {
  return (
    <div>
      <label className="field-label text-xs" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        className={INPUT}
        value={value === null || value === undefined || Number.isNaN(value) ? '' : value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value.trim();
          const n = raw === '' ? Number.NaN : Number(raw);
          onChange(Number.isFinite(n) ? n : undefined);
        }}
      />
      <Hint>{hint}</Hint>
    </div>
  );
}

export function CheckField({
  id,
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  id: string;
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div>
      <label className="flex items-start gap-2 text-sm font-semibold text-ink" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
      <Hint>{hint}</Hint>
    </div>
  );
}

export function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
  hint,
}: {
  id: string;
  label: ReactNode;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div>
      <label className="field-label text-xs" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={INPUT}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Hint>{hint}</Hint>
    </div>
  );
}

/** Small icon button for list rows (move, remove). */
export function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
