import { describe, expect, it } from 'vitest';
import {
  NOTICE_ID_MAX_LENGTH,
  noticeAdminKind,
  noticeIdHelp,
  parseNoticeId,
} from '@/lib/notice-id';

describe('parseNoticeId', () => {
  it('trims a printed notice ID', () => {
    expect(parseNoticeId('  ABC-123  ')).toEqual({ ok: true, value: 'ABC-123' });
  });

  it('rejects empty, too-long, and PIN/password labels', () => {
    expect(parseNoticeId('')).toMatchObject({ ok: false });
    expect(parseNoticeId('x'.repeat(NOTICE_ID_MAX_LENGTH + 1))).toMatchObject({ ok: false });
    expect(parseNoticeId('my PIN 1234')).toMatchObject({ ok: false });
    expect(parseNoticeId('password: hunter2')).toMatchObject({ ok: false });
  });
});

describe('noticeIdHelp', () => {
  it('maps known administrators and falls back generically', () => {
    expect(noticeAdminKind('Simpluris, Inc.')).toBe('simpluris');
    expect(noticeAdminKind('Kroll Settlement Administration')).toBe('kroll');
    expect(noticeAdminKind('Epiq Class Action')).toBe('epiq');
    expect(noticeAdminKind('Angeion Group')).toBe('angeion');
    expect(noticeAdminKind('JND Legal Administration')).toBe('jnd');
    expect(noticeAdminKind(null)).toBe('generic');
    expect(noticeIdHelp('Simpluris').where.toLowerCase()).toContain('postcard');
    expect(noticeIdHelp(null).noNotice.toLowerCase()).toContain('eligible');
  });
});
