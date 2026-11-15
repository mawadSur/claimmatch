'use client';

import { useEffect, useRef, useState } from 'react';
import { JevConditionSchema, type JevCondition, type JevRule } from '@/lib/jev/types';
import type { FieldIssue } from './api';
import { parseJevRulesText, rulesToText } from './forms';
import { FieldIssues } from './ui';

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function conditionText(value: JevCondition | null): string {
  return value === null ? '' : JSON.stringify(value);
}

type ConditionParse = { ok: true; value: JevCondition | null } | { ok: false; message: string };

export function parseConditionText(text: string): ConditionParse {
  if (text.trim() === '') return { ok: true, value: null };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, message: `Not valid JSON: ${(err as Error).message}` };
  }
  const parsed = JevConditionSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, message: `Not a Jev condition${first?.path.length ? ` at ${first.path.join('.')}` : ''}: ${first?.message ?? 'invalid'}` };
  }
  return { ok: true, value: parsed.data };
}

/** A question's "asked only when" condition, as Jev JSON (empty means always asked). */
export function ConditionField({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: JevCondition | null;
  onChange: (value: JevCondition | null) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => conditionText(value));
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    const current = parseConditionText(textRef.current);
    if (!current.ok || !same(current.value, value)) {
      setText(conditionText(value));
      setError(null);
    }
  }, [value]);

  return (
    <div>
      <label className="field-label text-xs" htmlFor={id}>
        Asked only when (Jev condition, JSON; empty means always)
      </label>
      <input
        id={id}
        className="field-input py-2 font-mono text-xs"
        value={text}
        disabled={disabled}
        spellCheck={false}
        placeholder='{"field":"benefit_tier","op":"eq","value":"with_proof"}'
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const parsed = parseConditionText(next);
          if (parsed.ok) {
            setError(null);
            onChange(parsed.value);
          } else setError(parsed.message);
        }}
      />
      {error ? <p className="mt-1 text-xs text-danger-700">{error}</p> : null}
    </div>
  );
}

const EXAMPLE = `[
  {
    "id": "kroger.max_items",
    "description": "Tier rule",
    "severity": "block",
    "check": { "any": [
      { "field": "answers.item_count", "op": "lte", "value": 5 },
      { "field": "doc_count.receipt", "op": "gte", "value": 1 }
    ] },
    "message": "Without a receipt you can claim up to 5 items."
  }
]`;

/**
 * The spec's own Jev rules as a JSON array. JSON and rule-shape errors show
 * as you type; "Check the spec" runs validateJevRules on the server (known
 * keys and kinds, safe patterns, depth and size) and its errors show here.
 */
export function JevRulesEditor({
  id,
  value,
  onChange,
  onValidity,
  disabled,
  serverIssues,
}: {
  id: string;
  value: readonly JevRule[];
  onChange: (rules: JevRule[]) => void;
  /** False while the text does not parse, so the draft cannot be saved. */
  onValidity: (ok: boolean) => void;
  disabled?: boolean;
  serverIssues: readonly FieldIssue[];
}) {
  const [text, setText] = useState(() => rulesToText(value));
  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    const current = parseJevRulesText(textRef.current);
    if (!current.ok || !same(current.rules, value)) {
      setText(rulesToText(value));
      setIssues([]);
      onValidity(true);
    }
    // onValidity is a setter from the parent; only an outside change of `value` resets the text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="space-y-2">
      <label className="field-label text-xs" htmlFor={id}>
        Jev rules for this settlement (JSON array, up to 100 rules)
      </label>
      <textarea
        id={id}
        rows={Math.min(24, Math.max(6, text.split('\n').length + 1))}
        className="field-input py-2 font-mono text-xs"
        value={text}
        disabled={disabled}
        spellCheck={false}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const parsed = parseJevRulesText(next);
          if (parsed.ok) {
            setIssues([]);
            onValidity(true);
            onChange(parsed.rules);
          } else {
            setIssues(parsed.issues);
            onValidity(false);
          }
        }}
      />
      <FieldIssues issues={issues} />
      {serverIssues.length > 0 ? (
        <div className="rounded-lg border border-danger-50 bg-danger-50 p-2">
          <p className="text-xs font-semibold text-danger-700">Jev rule check:</p>
          <FieldIssues issues={serverIssues} />
        </div>
      ) : null}
      <details className="text-xs text-ink-muted">
        <summary className="cursor-pointer font-semibold">Rule format and an example</summary>
        <p className="mt-1">
          Each rule: id, description, severity (block, warn or info), optional modes (partial, pre_sign, pre_send),
          optional when, check, message (plain English, shown to the member unless audience is staff), optional
          field. Fields: member.*, answers.&lt;key&gt;, benefit_tier, payout_method, doc_count.&lt;kind&gt;,
          meta.days_to_deadline, meta.lane.
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-50 p-2 font-mono">{EXAMPLE}</pre>
      </details>
    </div>
  );
}
