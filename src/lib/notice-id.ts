/**
 * Notice / claim ID help and validation. Stored on the user's claim row
 * (claims.notice_id), never on the shared claim profile. Lawsuit AI never
 * collects an official-site login PIN or password.
 */

export const NOTICE_ID_STORAGE_PREFIX = 'cm_notice_id:';
export const NOTICE_ID_MAX_LENGTH = 80;

export const NOTICE_PIN_NOT_COLLECTED =
  'Lawsuit AI does not collect the official site’s login PIN or password. Use those only on the administrator’s site.';

const PIN_PASSWORD_RE =
  /\b(pin|p\.?i\.n\.?|password|passwd|passcode|secret\s*word|login\s*secret)\b/i;

export type NoticeAdminKind = 'simpluris' | 'kroll' | 'epiq' | 'angeion' | 'jnd' | 'generic';

export interface NoticeIdHelp {
  kind: NoticeAdminKind;
  administratorLabel: string;
  where: string;
  noNotice: string;
}

const GENERIC: NoticeIdHelp = {
  kind: 'generic',
  administratorLabel: 'the settlement administrator',
  where:
    'Look on the postcard, letter, or email the administrator sent. The notice ID or claim ID is usually near the top, next to a barcode, or in a box labeled Claim ID, Notice ID, or Unique ID.',
  noNotice:
    'You may still be eligible without a mailed notice. Check the official site’s lookup or contact page, or file there if the notice says class members can claim without an ID.',
};

const BY_KIND: Record<Exclude<NoticeAdminKind, 'generic'>, NoticeIdHelp> = {
  simpluris: {
    kind: 'simpluris',
    administratorLabel: 'Simpluris',
    where:
      'Simpluris usually prints a Login ID (not a password) on the postcard or email. It is near the barcode or in the “Your Unique ID” box. Do not enter the Secret or password — only the ID.',
    noNotice:
      'Simpluris sites often have a “Don’t have a notice?” or contact link. You can still check eligibility on the official notice even if no postcard arrived.',
  },
  kroll: {
    kind: 'kroll',
    administratorLabel: 'Kroll Settlement Administration',
    where:
      'Kroll usually prints a Notice ID or Claimant ID on the front of the postcard, next to the barcode, or at the top of the emailed notice.',
    noNotice:
      'If you did not get a Kroll notice, use the official site’s “Contact us” or claim-status lookup. Some Kroll settlements still let you file with name and address only.',
  },
  epiq: {
    kind: 'epiq',
    administratorLabel: 'Epiq',
    where:
      'Epiq usually prints a Claim ID or Notice ID in the upper corner of the postcard or in the email subject/body as “Claim ID.”',
    noNotice:
      'Epiq sites typically include a “File a claim” path and a contact form if you never received a notice. Confirm on the official site whether an ID is required.',
  },
  angeion: {
    kind: 'angeion',
    administratorLabel: 'Angeion Group',
    where:
      'Angeion usually prints a Unique ID or Notice ID on the postcard below the barcode, or in the emailed notice under “Your ID.”',
    noNotice:
      'Angeion’s official site often has a lookup or “Didn’t get a notice?” link. You can still read who qualifies on the notice PDF.',
  },
  jnd: {
    kind: 'jnd',
    administratorLabel: 'JND Legal Administration',
    where:
      'JND usually prints a Claimant ID or Notice ID on the postcard (often near the mailing barcode) or in the official email as “ID Number.”',
    noNotice:
      'JND sites usually include a contact form and sometimes an online claim form that does not need a mailed ID. Check the official site.',
  },
};

export function noticeAdminKind(administrator: string | null | undefined): NoticeAdminKind {
  const raw = administrator?.trim().toLowerCase() ?? '';
  if (!raw) return 'generic';
  if (raw.includes('simpluris')) return 'simpluris';
  if (raw.includes('kroll')) return 'kroll';
  if (raw.includes('epiq')) return 'epiq';
  if (raw.includes('angeion')) return 'angeion';
  if (/\bjnd\b/.test(raw) || raw.includes('jnd legal')) return 'jnd';
  return 'generic';
}

export function noticeIdHelp(administrator: string | null | undefined): NoticeIdHelp {
  const kind = noticeAdminKind(administrator);
  if (kind === 'generic') {
    const label = administrator?.trim();
    if (!label) return GENERIC;
    return { ...GENERIC, administratorLabel: label };
  }
  return BY_KIND[kind];
}

export function parseNoticeId(raw: unknown): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof raw !== 'string') {
    return { ok: false, message: 'Enter the notice ID or claim ID from your letter or email.' };
  }
  const value = raw.trim();
  if (!value) {
    return { ok: false, message: 'Enter the notice ID or claim ID from your letter or email.' };
  }
  if (value.length > NOTICE_ID_MAX_LENGTH) {
    return { ok: false, message: `That ID is too long. Use up to ${NOTICE_ID_MAX_LENGTH} characters.` };
  }
  if (PIN_PASSWORD_RE.test(value)) {
    return {
      ok: false,
      message:
        'Do not enter a PIN or password. Lawsuit AI only saves the notice ID or claim ID printed on your letter.',
    };
  }
  if (/\s{2,}/.test(value) || /[\u0000-\u001f]/.test(value)) {
    return { ok: false, message: 'That ID has characters we cannot save. Copy it from the notice.' };
  }
  return { ok: true, value };
}

export function noticeIdStorageKey(slug: string): string {
  return `${NOTICE_ID_STORAGE_PREFIX}${slug}`;
}

export function readStoredNoticeId(slug: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(noticeIdStorageKey(slug));
    const parsed = parseNoticeId(raw ?? '');
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
}

export function writeStoredNoticeId(slug: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(noticeIdStorageKey(slug), value);
  } catch {
    // Private mode / quota — the in-memory form value still works until refresh.
  }
}
