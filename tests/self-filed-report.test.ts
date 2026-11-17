import { describe, expect, it } from 'vitest';
import {
  SELF_FILED_MAX_BYTES,
  parseSelfFiledBytes,
  parseSelfFiledMime,
  screenshotLabel,
  selfFiledStoragePath,
  toSelfFiledReportView,
} from '@/lib/self-filed-report';
import { parseSelfFiledReportBody } from '@/lib/self-filed-report-server';
import { claimSelfReportedProperties } from '@/lib/analytics/events';

const LAWSUIT = '00000000-0000-4000-8000-0000000000a1';
const NOW = new Date('2026-11-17T12:00:00.000Z');

describe('self-filed confirmation file limits', () => {
  it('accepts listed image types and PDF, and refuses everything else', () => {
    expect(parseSelfFiledMime('image/jpeg')).toEqual({ ok: true, mime: 'image/jpeg' });
    expect(parseSelfFiledMime('image/png')).toEqual({ ok: true, mime: 'image/png' });
    expect(parseSelfFiledMime('application/pdf')).toEqual({ ok: true, mime: 'application/pdf' });
    expect(parseSelfFiledMime('IMAGE/JPEG')).toEqual({ ok: true, mime: 'image/jpeg' });
    expect(parseSelfFiledMime('application/octet-stream').ok).toBe(false);
    expect(parseSelfFiledMime('image/gif').ok).toBe(false);
    expect(parseSelfFiledMime('').ok).toBe(false);
  });

  it('requires a positive size and refuses files over 10 MB', () => {
    expect(parseSelfFiledBytes(1)).toEqual({ ok: true, bytes: 1 });
    expect(parseSelfFiledBytes(SELF_FILED_MAX_BYTES)).toEqual({ ok: true, bytes: SELF_FILED_MAX_BYTES });
    expect(parseSelfFiledBytes(0).ok).toBe(false);
    expect(parseSelfFiledBytes(SELF_FILED_MAX_BYTES + 1).ok).toBe(false);
    expect(parseSelfFiledBytes(12.5).ok).toBe(false);
  });

  it('stores files under the owner’s folder, never a public path', () => {
    expect(selfFiledStoragePath('user-1', 'report-1', 'image/png')).toBe(
      'user-1/report-1/confirmation.png',
    );
    expect(selfFiledStoragePath('user-1', 'report-1', 'application/pdf')).toBe(
      'user-1/report-1/confirmation.pdf',
    );
  });
});

describe('self-filed report view', () => {
  it('never puts the storage path on the client view', () => {
    const view = toSelfFiledReportView({
      id: 'r1',
      lawsuit_id: LAWSUIT,
      claim_id: 'c1',
      confirmation_storage_path: 'user-1/r1/confirmation.jpg',
      confirmation_mime: 'image/jpeg',
      confirmation_bytes: 2048,
    });
    expect(view).toEqual({
      id: 'r1',
      lawsuitId: LAWSUIT,
      claimId: 'c1',
      hasScreenshot: true,
      screenshotMime: 'image/jpeg',
      screenshotBytes: 2048,
    });
    expect(JSON.stringify(view)).not.toContain('confirmation.jpg');
    expect(screenshotLabel(view)).toMatch(/image/i);
  });
});

describe('self-filed report body', () => {
  it('requires a settlement id and accepts an optional confirmation number', () => {
    expect(parseSelfFiledReportBody({}, NOW).ok).toBe(false);
    expect(parseSelfFiledReportBody({ lawsuit_id: 'not-a-uuid' }, NOW).ok).toBe(false);
    expect(parseSelfFiledReportBody({ lawsuit_id: LAWSUIT }, NOW)).toEqual({
      ok: true,
      lawsuitId: LAWSUIT,
      confirmationNumber: undefined,
      filedOn: undefined,
    });
    expect(
      parseSelfFiledReportBody({ lawsuit_id: LAWSUIT, confirmation_number: 'ABC-99' }, NOW),
    ).toMatchObject({ ok: true, confirmationNumber: 'ABC-99' });
  });
});

describe('claim_self_reported properties', () => {
  it('sends the settlement id only — never a confirmation number', () => {
    expect(claimSelfReportedProperties({ lawsuitId: LAWSUIT })).toEqual({ lawsuit_id: LAWSUIT });
    expect(claimSelfReportedProperties({ lawsuitId: '  ' })).toBeNull();
    expect(JSON.stringify(claimSelfReportedProperties({ lawsuitId: LAWSUIT }))).not.toMatch(
      /confirmation/i,
    );
  });
});
