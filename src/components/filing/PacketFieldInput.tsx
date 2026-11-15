/**
 * One packet item as an input, by its type. The label is the official form's
 * wording; Jev's hints and any error sit right under the field and are linked
 * with aria-describedby. Locked items show why instead of an input.
 */
import { ONE_CLICK_COPY } from '@/lib/copy';
import type { PacketItemView } from '@/lib/filing/v2/contract';
import { US_STATES } from '@/lib/utils';
import { MEMBER_AUTOCOMPLETE, itemDomId, type FieldDraft } from './packet-form';
import { FieldError, FieldIssues, describedBy } from './ui';

const COPY = ONE_CLICK_COPY.need;
/** Up to this many options show as radio buttons; more use a list. */
const RADIO_LIMIT = 6;

function LabelText({ item }: { item: PacketItemView }) {
  return (
    <>
      <span className="whitespace-pre-line">{item.label}</span>{' '}
      <span className="font-normal text-ink-muted">({item.required ? COPY.required : COPY.optional})</span>
    </>
  );
}

export function PacketFieldInput({
  item,
  draft,
  onChange,
  error,
  disabled,
}: {
  item: PacketItemView;
  draft: FieldDraft;
  onChange: (draft: FieldDraft) => void;
  error: string | null;
  disabled: boolean;
}) {
  const id = itemDomId(item.path);
  const helpId = item.help ? `${id}-help` : null;
  const issuesId = item.issues.length ? `${id}-issues` : null;
  const errorId = error ? `${id}-error` : null;
  const lockedId = item.locked ? `${id}-locked` : null;
  const described = describedBy(helpId, issuesId, errorId, lockedId);
  const invalid = error ? true : undefined;
  const text = Array.isArray(draft) ? '' : draft;
  const off = disabled || item.locked !== null;

  const footer = (
    <>
      {item.locked && (
        <p id={lockedId ?? undefined} className="mt-1.5 text-sm text-ink-muted">
          {COPY.locked[item.locked]}
        </p>
      )}
      <FieldIssues id={issuesId ?? `${id}-issues`} issues={item.issues} />
      <FieldError id={errorId ?? `${id}-error`} message={error} />
    </>
  );
  const help = item.help ? (
    <p id={helpId ?? undefined} className="mb-1.5 text-sm leading-relaxed text-ink-muted">
      {item.help}
    </p>
  ) : null;

  if (item.locked === 'not_collected') {
    return (
      <div>
        <p className="field-label">
          <LabelText item={item} />
        </p>
        {footer}
      </div>
    );
  }

  const options = item.options ?? [];
  if (item.type === 'yes_no' || ((item.type === 'single_choice' || item.type === 'multi_choice') && options.length <= RADIO_LIMIT)) {
    const multi = item.type === 'multi_choice';
    const choices = item.type === 'yes_no' ? [{ value: 'yes', label: COPY.yes }, { value: 'no', label: COPY.no }] : options;
    const selected = Array.isArray(draft) ? draft : [draft];
    return (
      <fieldset id={id} tabIndex={-1} aria-describedby={described} aria-invalid={invalid} className="focus:outline-none">
        <legend className="field-label">
          <LabelText item={item} />
        </legend>
        {help}
        <div className="space-y-1">
          {choices.map((choice) => {
            const checked = selected.includes(choice.value);
            return (
              <label key={choice.value} className="flex min-h-tap cursor-pointer items-center gap-3 text-sm text-ink">
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  name={id}
                  value={choice.value}
                  className="h-5 w-5 shrink-0 border-gray-300 text-brand-600 focus:ring-brand-400"
                  checked={checked}
                  disabled={off}
                  onChange={(e) => {
                    if (!multi) return onChange(choice.value);
                    const next = new Set(Array.isArray(draft) ? draft : []);
                    if (e.target.checked) next.add(choice.value);
                    else next.delete(choice.value);
                    onChange([...next]);
                  }}
                />
                <span>{choice.label}</span>
              </label>
            );
          })}
        </div>
        {footer}
      </fieldset>
    );
  }

  const label = (
    <label htmlFor={id} className="field-label">
      <LabelText item={item} />
    </label>
  );
  const common = {
    id,
    name: id,
    disabled: off,
    'aria-describedby': described,
    'aria-invalid': invalid,
    'aria-required': item.required || undefined,
  } as const;

  if (item.type === 'us_state' || item.type === 'single_choice' || item.type === 'multi_choice') {
    const list = item.type === 'us_state' ? US_STATES.map((s) => ({ value: s.code, label: s.name })) : options;
    return (
      <div>
        {label}
        {help}
        <select
          {...common}
          className="field-input"
          value={text}
          autoComplete={MEMBER_AUTOCOMPLETE[item.path] ?? 'off'}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{COPY.choose}</option>
          {list.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {footer}
      </div>
    );
  }

  if (item.type === 'long_text') {
    return (
      <div>
        {label}
        {help}
        <textarea {...common} className="field-input min-h-[7rem]" value={text} maxLength={2000} onChange={(e) => onChange(e.target.value)} />
        {footer}
      </div>
    );
  }

  const kinds: Record<string, { type: string; inputMode?: 'numeric' | 'decimal' | 'email' | 'tel' }> = {
    email: { type: 'email', inputMode: 'email' },
    phone: { type: 'tel', inputMode: 'tel' },
    date: { type: 'date' },
    integer: { type: 'text', inputMode: 'numeric' },
    decimal: { type: 'text', inputMode: 'decimal' },
    money: { type: 'text', inputMode: 'decimal' },
    zip: { type: 'text', inputMode: 'numeric' },
  };
  const kind = kinds[item.type] ?? { type: 'text' };
  const code = item.type === 'notice_id' || item.type === 'vin';
  return (
    <div>
      {label}
      {help}
      <div className="flex items-center gap-2">
        {item.type === 'money' && (
          <span aria-hidden className="text-base text-ink-muted">
            $
          </span>
        )}
        <input
          {...common}
          className="field-input"
          type={kind.type}
          inputMode={kind.inputMode}
          value={text}
          maxLength={item.type === 'vin' ? 17 : 2000}
          autoComplete={MEMBER_AUTOCOMPLETE[item.path] ?? 'off'}
          autoCapitalize={code ? 'characters' : undefined}
          spellCheck={code ? false : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {footer}
    </div>
  );
}
