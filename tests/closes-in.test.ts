import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClosesInChip } from '@/components/settlement/ClosesInChip';
import { closesInChip } from '@/lib/closing-soon';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('closesInChip', () => {
  it('uses real future dates only', () => {
    const now = new Date('2026-10-16T12:00:00Z');
    expect(closesInChip(null, now)).toBeNull();
    expect(closesInChip('not-a-date', now)).toBeNull();
    expect(closesInChip('2020-01-01', now)).toBeNull();
    expect(closesInChip('2026-10-16', now)).toBe('Closes today');
    expect(closesInChip('2026-10-17', now)).toBe('Closes in 1 day');
    expect(closesInChip('2026-10-26', now)).toBe('Closes in 10 days');
  });

  it('renders nothing when the flag is off', () => {
    const html = renderToStaticMarkup(
      createElement(ClosesInChip, { deadline: '2026-10-26', now: new Date('2026-10-16T12:00:00Z') }),
    );
    expect(html).toBe('');
  });

  it('renders the chip when the flag is on', () => {
    vi.stubEnv('CLOSES_IN_CHIPS_ENABLED', '1');
    const html = renderToStaticMarkup(
      createElement(ClosesInChip, { deadline: '2026-10-26', now: new Date('2026-10-16T12:00:00Z') }),
    );
    expect(html).toContain('Closes in 10 days');
  });
});
