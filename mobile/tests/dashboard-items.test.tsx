import type { DashboardRow, NoticeItem } from '@shared/components/claims/dashboard-model';
import type { ClaimView } from '@shared/lib/claims';
import type { DashboardResponse } from '@shared/lib/mobile-contract';

import { common } from '@/copy/common';
import { dashboard, groupHint, introSentence, nextStepText, possibleMatchesSummary } from '@/copy/dashboard';
import { buildDashboardItems, firstBatchSize, groupClaimRows, type DashboardItemOptions } from '@/features/dashboard/items';
import {
  mergeNoticeRows,
  openFictionalRows,
  pruneAnswers,
  visibleAnswers,
  type NoticeAnswer,
} from '@/features/dashboard/notice-rows';
import { loadErrorBody } from '@/features/dashboard/DashboardStates';
import { ApiRequestError } from '@/lib/api';
import { showsFeeDisclosure } from '@/lib/flags';

function row(id: string, group: DashboardRow['group'], href: string | null = `/claim/settlement-${id}`): DashboardRow {
  return {
    claimId: id,
    title: `Settlement ${id}`,
    label: 'Not filed yet',
    tone: 'amber',
    group,
    deadlineText: 'No deadline listed',
    nextStep: 'If you qualify, file on the official site, then tell us.',
    action: href ? { label: 'How to file', href } : null,
  };
}

function notice(id: string, kind: NoticeItem['kind'] = 'legacy'): NoticeItem {
  return { claimId: id, title: `Settlement ${id}`, kind, deadline: null, deadlinePassed: false, filing: 'open', officialUrl: null };
}

function answer(item: NoticeItem, index: number, visit = 0): NoticeAnswer {
  const claim = { id: item.claimId } as ClaimView;
  return { claim, message: 'Thanks.', item, index, announce: true, visit };
}

function response(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    serverTime: '2026-11-02T15:00:00.000Z',
    profile: { firstName: 'Ana', onboarded: true, needsProfile: false },
    claims: { failed: false, rows: [], notices: [] },
    matches: { failed: false, strong: [], possible: [], possibleHidden: 0 },
    closingSoon: { failed: false, items: [] },
    reminders: [],
    ...overrides,
  };
}

const NONE: DashboardItemOptions = { welcome: false, deniedAdmin: false, passwordUpdated: false, hasNotices: false, refetchError: null };

describe('buildDashboardItems', () => {
  it('lays the dashboard out in the web’s order', () => {
    const items = buildDashboardItems(
      response({
        profile: { firstName: 'Ana', onboarded: false, needsProfile: true },
        claims: { failed: false, rows: [row('1', 'reported'), row('2', 'needs_filing'), row('3', 'needs_filing')], notices: [] },
      }),
      { welcome: true, deniedAdmin: false, passwordUpdated: true, hasNotices: true, refetchError: 'Offline.' },
    );
    expect(items.map((item) => item.key)).toEqual([
      'header',
      'refetch-error',
      'banners',
      'welcome',
      'notices',
      'finish-profile',
      'matches',
      'claims-header',
      'group-needs_filing',
      'claim-2',
      'claim-3',
      'group-reported',
      'claim-1',
      'closing-soon',
      'disclaimer',
    ]);
    expect(items[0].gap).toBe(0);
    expect(items.find((item) => item.key === 'group-needs_filing')).toMatchObject({ type: 'group', count: 2 });
  });

  it('shows the failed copy instead of an empty list when the claims could not be read', () => {
    const keys = buildDashboardItems(response({ claims: { failed: true, rows: [], notices: [] } }), NONE).map((item) => item.key);
    expect(keys).toContain('claims-failed');
    expect(keys).not.toContain('claims-empty');
    expect(keys).not.toContain('finish-profile');
  });

  it('shows the empty state when there are no claims, and nothing optional by default', () => {
    expect(buildDashboardItems(response(), NONE).map((item) => item.key)).toEqual([
      'header',
      'matches',
      'claims-header',
      'claims-empty',
      'closing-soon',
      'disclaimer',
    ]);
  });

  it('groups claims in GROUP_ORDER and leaves empty groups out', () => {
    const groups = groupClaimRows([row('1', 'other'), row('2', 'closed'), row('3', 'submitted'), row('4', 'needs_filing')]);
    expect(groups.map((group) => group.group)).toEqual(['needs_filing', 'submitted', 'closed', 'other']);
  });

  it('renders every section and the first rows in the first batch', () => {
    const rows = Array.from({ length: 40 }, (_, index) => row(String(index), 'needs_filing'));
    const items = buildDashboardItems(response({ claims: { failed: false, rows, notices: [] } }), NONE);
    const firstRow = items.findIndex((item) => item.type === 'claim');
    expect(firstBatchSize(items)).toBe(firstRow + 8);
    const few = buildDashboardItems(response(), NONE);
    expect(firstBatchSize(few)).toBe(few.length);
  });
});

describe('notice rows', () => {
  const [a, b, c] = [notice('a'), notice('b'), notice('c')];

  it('keeps an answered row the server dropped, in the place it had', () => {
    expect(mergeNoticeRows([b, c], { a: answer(a, 0) }).map((item) => item.claimId)).toEqual(['a', 'b', 'c']);
    expect(mergeNoticeRows([a, c], { b: answer(b, 1) }).map((item) => item.claimId)).toEqual(['a', 'b', 'c']);
    expect(mergeNoticeRows([], { a: answer(a, 0), c: answer(c, 2) }).map((item) => item.claimId)).toEqual(['a', 'c']);
  });

  it('shows an earlier visit’s answer only while the server still lists its row', () => {
    const answers = { a: answer(a, 0, 0), b: answer(b, 1, 0), c: answer(c, 2, 1) };
    expect(Object.keys(visibleAnswers(answers, [a], 1))).toEqual(['a', 'c']);
  });

  it('forgets answers whose rows are gone, and keeps the same object when nothing changes', () => {
    const answers = { a: answer(a, 0), b: answer(b, 1) };
    expect(Object.keys(pruneAnswers(answers, [b]))).toEqual(['b']);
    expect(pruneAnswers(answers, [a, b])).toBe(answers);
  });

  it('lists the fictional rows still waiting for Got it', () => {
    const x = notice('x', 'fictional');
    const y = notice('y', 'fictional');
    expect(openFictionalRows([a, x, y], { y: answer(y, 2) }).map((item) => item.claimId)).toEqual(['x']);
  });
});

describe('dashboard copy', () => {
  it('builds the header sentence for each fee setting', () => {
    expect(introSentence(false)).toBe(
      'Track the claims you file on official settlement sites. Lawsuit AI is free for now. It doesn’t file for you and never handles settlement payments.',
    );
    expect(introSentence(true)).toContain('Official filing stays free.');
  });

  it('words fees as disclosed, which is true either way, until the server flags are known', () => {
    const off = () => false;
    expect(showsFeeDisclosure({ status: 'ready', isFlagOn: off })).toBe(false);
    expect(showsFeeDisclosure({ status: 'ready', isFlagOn: (name) => name === 'FEE_DISCLOSURE_ENABLED' })).toBe(true);
    expect(showsFeeDisclosure({ status: 'loading', isFlagOn: off })).toBe(true);
    expect(showsFeeDisclosure({ status: 'unavailable', isFlagOn: off })).toBe(true);
  });

  it('counts the possible matches as the web does', () => {
    expect(possibleMatchesSummary(20, 4)).toBe('Possible matches (20, 4 more not shown)');
    expect(possibleMatchesSummary(3, 0)).toBe('Possible matches (3)');
  });

  it('replaces the web’s "Refresh the page" in a row and leaves other next steps alone', () => {
    expect(nextStepText(dashboard.detailsUnavailableWeb.text)).toBe(dashboard.detailsUnavailable.text);
    expect(nextStepText('Add your confirmation number when you get it.')).toBe('Add your confirmation number when you get it.');
  });

  it('has a hint for every group', () => {
    expect(groupHint('submitted')).toBe('Filed, with the administrator’s confirmation number on record.');
    expect(groupHint('other')).toBe('We can’t show these right now.');
  });
});

describe('loadErrorBody', () => {
  const failure = (status: number, code: string | null, error: string) =>
    new ApiRequestError({ ok: false, status, code, error, loggedOut: false });

  it('keeps the web’s text for server failures', () => {
    expect(loadErrorBody(failure(500, null, common.genericError.text))).toBe(dashboard.errorBody.text);
    expect(loadErrorBody(failure(200, 'invalid_response', common.genericError.text))).toBe(dashboard.errorBody.text);
    expect(loadErrorBody(new Error('boom'))).toBe(dashboard.errorBody.text);
  });

  it('says what happened when the phone is offline, the session could not be checked or requests are limited', () => {
    expect(loadErrorBody(failure(0, 'network', common.networkError.text))).toBe(common.networkError.text);
    expect(loadErrorBody(failure(503, 'auth_unavailable', 'We could not check your sign-in.'))).toBe('We could not check your sign-in.');
    expect(loadErrorBody(failure(429, null, 'Too many requests. Please wait a moment and try again.'))).toBe(
      'Too many requests. Please wait a moment and try again.',
    );
  });
});
