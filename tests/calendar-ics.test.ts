import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDeadlineIcs, deadlineIcsDate, escapeIcsText } from '@/lib/calendar-ics';
import { makeLawsuit } from './helpers';

const h = vi.hoisted(() => ({
  lookup: { status: 'missing' as 'missing' | 'error' | 'found', lawsuit: null as ReturnType<typeof makeLawsuit> | null },
}));

vi.mock('@/lib/lawsuits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/lawsuits')>();
  return {
    ...actual,
    lookupLawsuitBySlug: async () => {
      if (h.lookup.status === 'found' && h.lookup.lawsuit) {
        return { status: 'found' as const, lawsuit: h.lookup.lawsuit };
      }
      return { status: h.lookup.status };
    },
  };
});

import { GET } from '@/app/lawsuits/[slug]/calendar.ics/route';

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  h.lookup = { status: 'missing', lawsuit: null };
});

function hit(slug: string) {
  return GET(new Request(`http://localhost/lawsuits/${slug}/calendar.ics`), {
    params: Promise.resolve({ slug }),
  });
}

describe('buildDeadlineIcs', () => {
  it('builds an all-day RFC 5545 event on the deadline date', () => {
    const ics = buildDeadlineIcs({
      title: 'Amazon Return Policy Settlement',
      deadline: '2026-12-01',
      officialUrl: 'https://www.returnsettlement.com/submit-claim',
      uid: 'claimmatch-deadline-amazon@return',
      dtstamp: new Date('2026-10-27T12:00:00Z'),
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toEqual(expect.any(String));
    if (ics === null) throw new Error('expected an ICS payload for a readable deadline');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
    expect(ics).toContain('DTEND;VALUE=DATE:20261202');
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('SUMMARY:Claim deadline: Amazon Return Policy Settlement');
    expect(unfolded).toContain('Official site: https://www.returnsettlement.com/submit-claim');
    expect(unfolded).toContain('Check the official site for the exact cutoff');
    expect(ics).toContain('END:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics.includes('\r\n')).toBe(true);
  });

  it('returns null without a readable deadline', () => {
    expect(buildDeadlineIcs({ title: 'X', deadline: '' })).toBeNull();
    expect(deadlineIcsDate(null)).toBeNull();
    expect(deadlineIcsDate('soon')).toBeNull();
  });

  it('escapes commas and newlines in TEXT values', () => {
    expect(escapeIcsText('A, B; C\nD')).toBe('A\\, B\\; C\\nD');
  });
});

describe('GET /lawsuits/[slug]/calendar.ics', () => {
  it('404s when the calendar flag is off', async () => {
    h.lookup = {
      status: 'found',
      lawsuit: makeLawsuit({}, { slug: 'amazon', title: 'Amazon', deadline: '2026-12-01', claim_url: 'https://official.example/claim' }),
    };
    expect((await hit('amazon')).status).toBe(404);
  });

  it('404s when the listing has no deadline', async () => {
    vi.stubEnv('CALENDAR_ICS_ENABLED', '1');
    h.lookup = {
      status: 'found',
      lawsuit: makeLawsuit({}, { slug: 'amazon', title: 'Amazon', deadline: null }),
    };
    expect((await hit('amazon')).status).toBe(404);
  });

  it('returns a text/calendar attachment for a dated row when the flag is on', async () => {
    vi.stubEnv('CALENDAR_ICS_ENABLED', '1');
    h.lookup = {
      status: 'found',
      lawsuit: makeLawsuit(
        {},
        {
          slug: 'amazon-return-policy-settlement',
          title: 'Amazon Return Policy Settlement',
          deadline: '2026-12-01',
          claim_url: 'https://www.returnsettlement.com/submit-claim',
        },
      ),
    };
    const res = await hit('amazon-return-policy-settlement');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/calendar/);
    expect(res.headers.get('content-disposition')).toContain('.ics');
    const body = await res.text();
    expect(body).toContain('DTSTART;VALUE=DATE:20261201');
    expect(body).toContain('Claim deadline: Amazon Return Policy Settlement');
  });
});
