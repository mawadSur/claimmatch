/**
 * RFC 5545 basics for an all-day claim-deadline event. No timezone: catalog
 * deadlines are bare dates. The description tells people to check the official
 * site for the exact cutoff.
 */

const ICS_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const FOLD_AT = 75;

export type DeadlineIcsInput = {
  title: string;
  deadline: string;
  officialUrl?: string | null;
  uid?: string;
  dtstamp?: Date;
};

function icsDate(iso: string): string | null {
  const m = ICS_DATE.exec(iso.trim());
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

function icsUtcStamp(now: Date): string {
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const h = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const s = String(now.getUTCSeconds()).padStart(2, '0');
  return `${y}${mo}${d}T${h}${mi}${s}Z`;
}

function nextIcsDate(yyyymmdd: string): string | null {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  if (Number.isNaN(next.getTime())) return null;
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/** Escape TEXT values per RFC 5545 §3.3.11. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function foldLine(line: string): string {
  if (line.length <= FOLD_AT) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, FOLD_AT));
  rest = rest.slice(FOLD_AT);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, FOLD_AT - 1)}`);
    rest = rest.slice(FOLD_AT - 1);
  }
  return parts.join('\r\n');
}

export function deadlineIcsDate(deadline: string | null | undefined): string | null {
  if (!deadline) return null;
  return icsDate(deadline);
}

/**
 * Build a VCALENDAR with one all-day VEVENT on the deadline date.
 * Returns null when the deadline is missing or unreadable.
 */
export function buildDeadlineIcs(input: DeadlineIcsInput): string | null {
  const start = deadlineIcsDate(input.deadline);
  if (!start) return null;
  const end = nextIcsDate(start);
  if (!end) return null;

  const title = input.title.trim() || 'Settlement';
  const official = input.officialUrl?.trim();
  const description = [
    official ? `Official site: ${official}` : null,
    'Check the official site for the exact cutoff',
  ]
    .filter(Boolean)
    .join('\n');

  const uid = input.uid?.trim() || `claimmatch-deadline-${start}@claimmatch`;
  const stamp = icsUtcStamp(input.dtstamp ?? new Date());

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ClaimMatch//Settlement Deadline//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${escapeIcsText(`Claim deadline: ${title}`)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
