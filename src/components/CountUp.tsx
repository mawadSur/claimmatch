'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A number that animates up to `value` on mount over ~900ms with an ease-out
 * curve (requestAnimationFrame). Honors prefers-reduced-motion by snapping
 * straight to the final value. Presentational and hydration-safe: the initial
 * render shows the real `value`, so the number is never hidden behind the
 * animation — it just gets a celebratory count-up when motion is allowed.
 */
export function CountUp({
  value,
  format = (n) => String(Math.round(n)),
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  // Start at the final value so SSR + first client paint agree (no mismatch,
  // no dependence on JS/animation to reveal the figure).
  const [display, setDisplay] = useState(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced || !Number.isFinite(value) || value <= 0) {
      setDisplay(value);
      return;
    }

    const DURATION = 900;
    // easeOutCubic — fast start, gentle landing.
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const start =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    setDisplay(0);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      setDisplay(value * ease(t));
      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        setDisplay(value);
      }
    };
    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return (
    <span className={className} suppressHydrationWarning>
      {format(display)}
    </span>
  );
}
