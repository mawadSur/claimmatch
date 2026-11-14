'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Copies exactly `text` to the clipboard (the desk pastes it into the official form by hand). */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-100 transition-colors hover:bg-brand-50"
    >
      {state === 'copied' ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
    </button>
  );
}
