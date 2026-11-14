import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Role gating in the filing console: the law firm (legal_reviewer) alone sees
// and can use Approve, Reject, Retire, "kill switch off" and "clear
// objection"; filing agents alone take desk jobs and export bulk files.

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/filing',
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
  createServiceClient: () => {
    throw new Error('components never read the database');
  },
}));
vi.mock('@/lib/admin', () => ({
  getAdminUser: async () => null,
  requireAdmin: async () => {
    throw new Error('not used here');
  },
  adminDeniedPath: (signedIn: boolean, path: string) => (signedIn ? '/dashboard?denied=admin' : `/login?next=${encodeURIComponent(path)}`),
}));

import { filingPermissions } from '@/app/admin/filing/_lib/permissions';
import { BulkConsole } from '@/components/admin/filing/BulkConsole';
import { ControlsPanel } from '@/components/admin/filing/ControlsPanel';
import { DeskConsole } from '@/components/admin/filing/DeskConsole';
import { FilingOverview } from '@/components/admin/filing/FilingOverview';
import { PolicySection } from '@/components/admin/filing/PolicySection';
import { SettlementConsole } from '@/components/admin/filing/SettlementConsole';
import { SpecSection } from '@/components/admin/filing/SpecSection';
import type { FilingPermissions } from '@/components/admin/filing/types';
import type { StaffUser } from '@/lib/staff-roles';
import {
  approvedPolicy,
  approvedSpec,
  controls,
  deskView,
  detail,
  expectedPermissions,
  job,
  LAWSUIT_ID,
  NOW_ISO,
  policyRecord,
  REVIEWER_ID,
  specRecord,
  summary,
} from './admin-filing-fixtures';

type Role = 'legal_reviewer' | 'filing_agent';

function perms(roles: Role[], isAdmin = false): FilingPermissions {
  const staff: StaffUser = { id: isAdmin ? 'admin-user' : 'staff-user', email: 'staff@example.test', isAdmin, roles };
  return filingPermissions(staff);
}

const REVIEWER = perms(['legal_reviewer']);
const AGENT = perms(['filing_agent']);
const ADMIN = perms([], true);

const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => undefined;

/** The <button> whose text contains `text`, as markup (or undefined). */
function button(markup: string, text: string): string | undefined {
  return [...markup.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]).find((b) => b.includes(text));
}

describe('permissions come from src/lib/staff-roles.ts', () => {
  it.each([
    [[] as Role[], true],
    [['legal_reviewer'] as Role[], false],
    [['filing_agent'] as Role[], false],
    [['filing_agent'] as Role[], true],
    [['filing_agent', 'legal_reviewer'] as Role[], false],
  ])('roles %j, admin %s', (roles, isAdmin) => {
    expect(perms(roles, isAdmin)).toEqual(expectedPermissions(roles, isAdmin));
  });

  it('an admin approves nothing and holds no desk role', () => {
    expect(ADMIN).toMatchObject({ canApprove: false, canWorkDesk: false, canViewMemberData: false, canKillSwitchOff: false, canClearObjection: false, canDraft: true });
  });
});

describe('policy approval', () => {
  const policies = [approvedPolicy(), policyRecord()];
  const section = (p: FilingPermissions) =>
    html(createElement(PolicySection, { permissions: p, target: { lawsuit_id: LAWSUIT_ID }, title: 'Settlement filing policy', administratorLevel: false, policies, names: { [REVIEWER_ID]: 'reviewer@lawfirm.test' }, onChanged: noop }));

  it('a legal reviewer sees Approve and Reject; Approve stays disabled until they tick the confirmation', () => {
    const markup = section(REVIEWER);
    const approve = button(markup, 'Approve version 2');
    expect(approve).toBeDefined();
    expect(approve).toMatch(/disabled=""/);
    expect(button(markup, 'Reject version 2')).toBeDefined();
    expect(markup).toMatch(/<input[^>]*id="approve-policy-[^"]*-confirm"(?![^>]*checked)[^>]*>/);
  });

  it.each([
    ['a filing agent', AGENT],
    ['an admin', ADMIN],
  ])('%s sees no approval controls, only who decides', (_, p) => {
    const markup = section(p);
    expect(button(markup, 'Approve version')).toBeUndefined();
    expect(button(markup, 'Reject version')).toBeUndefined();
    expect(markup).toContain('A legal reviewer approves or rejects this draft.');
    expect(markup).toContain('Until then, version 1 stays in force.');
  });

  it('shows who approved the version in force, when, and on what documents', () => {
    const markup = section(AGENT);
    expect(markup).toContain('In force: version 1');
    expect(markup).toContain('Approved by <span class="font-semibold">reviewer@lawfirm.test</span>');
    expect(markup).toContain('Settlement agreement');
    expect(markup).toContain('Version history (2)');
  });

  it('without a draft, drafters can start one from the approved version', () => {
    const markup = html(createElement(PolicySection, { permissions: AGENT, target: { lawsuit_id: LAWSUIT_ID }, title: 'P', administratorLevel: false, policies: [approvedPolicy()], names: {}, onChanged: noop }));
    expect(button(markup, 'Start a draft from version 1')).toBeDefined();
  });

  it('an administrator-level policy never edits channels', () => {
    const markup = html(createElement(PolicySection, { permissions: REVIEWER, target: { administrator_id: LAWSUIT_ID }, title: 'A', administratorLevel: true, policies: [policyRecord()], names: {}, onChanged: noop }));
    expect(markup).toContain('can only restrict');
    expect(markup).not.toContain('Add a channel');
  });
});

describe('spec approval and retirement', () => {
  const specs = [approvedSpec(), specRecord()];
  const section = (p: FilingPermissions) =>
    html(createElement(SpecSection, { permissions: p, lawsuitId: LAWSUIT_ID, deadline: '2026-12-15', specs, names: {}, onChanged: noop }));

  it('a legal reviewer sees Approve for the draft and Retire for the version in use', () => {
    const markup = section(REVIEWER);
    expect(button(markup, 'Approve version 2')).toMatch(/disabled=""/);
    expect(button(markup, 'Retire version 1')).toBeDefined();
  });

  it('nobody else does', () => {
    for (const p of [AGENT, ADMIN]) {
      const markup = section(p);
      expect(button(markup, 'Approve version')).toBeUndefined();
      expect(button(markup, 'Retire version')).toBeUndefined();
      expect(markup).toContain('A legal reviewer approves this draft.');
    }
  });

  it('the editor shows the verbatim statement, the Jev rules editor and the server check', () => {
    const markup = section(AGENT);
    expect(markup).toContain('Sworn statement (verbatim)');
    expect(markup).toContain('Jev rules for this settlement (JSON array, up to 100 rules)');
    expect(button(markup, 'Check the spec')).toBeDefined();
    expect(markup).toContain('Method names only');
  });
});

describe('controls', () => {
  const panel = (p: FilingPermissions, view = controls()) =>
    html(createElement(ControlsPanel, { permissions: p, summary: summary(), controls: [view], onChanged: noop }));

  it('anyone in the console turns a kill switch on', () => {
    for (const p of [AGENT, ADMIN, REVIEWER]) expect(button(panel(p), 'Turn the kill switch on')).toBeDefined();
  });

  it('only a legal reviewer turns it off', () => {
    const on = controls({ kill_switch: true, kill_switch_reason: 'Administrator asked us to stop', kill_switch_changed_at: NOW_ISO });
    expect(button(panel(REVIEWER, on), 'Turn the kill switch off')).toBeDefined();
    for (const p of [AGENT, ADMIN]) {
      const markup = panel(p, on);
      expect(button(markup, 'Turn the kill switch off')).toBeUndefined();
      expect(markup).toContain('Only a legal reviewer can turn the kill switch off.');
    }
  });

  it('only a legal reviewer clears an objection; anyone records one', () => {
    const objected = controls({ objection_received_at: NOW_ISO, objection_notes: 'Letter from class counsel' });
    expect(button(panel(REVIEWER, objected), 'Clear the objection')).toBeDefined();
    expect(button(panel(ADMIN, objected), 'Clear the objection')).toBeUndefined();
    expect(panel(ADMIN, objected)).toContain('Only a legal reviewer can clear an objection.');
    expect(button(panel(AGENT), 'Record an objection')).toBeDefined();
  });

  it('shows both levels when the settlement has an administrator', () => {
    const markup = panel(AGENT);
    expect(markup).toContain('This settlement');
    expect(markup).toContain('Administrator: Example Administrator');
  });
});

describe('settlement console', () => {
  it('renders the summary, both policies and the spec', () => {
    const markup = html(createElement(SettlementConsole, { lawsuitId: LAWSUIT_ID, permissions: REVIEWER, initialDetail: detail(), initialNames: {} }));
    expect(markup).toContain('Product X settlement');
    expect(markup).toContain('Settlement filing policy');
    expect(markup).toContain('Administrator policy: Example Administrator');
    expect(markup).toContain('Filing spec');
    expect(markup).toContain('Lane today');
  });
});

describe('desk', () => {
  const queue = [job(), job({ status: 'needs_attention', needs_attention_reason: 'lock_expired' })];
  const desk = (p: FilingPermissions, extra: Record<string, unknown> = {}) =>
    html(createElement(DeskConsole, { permissions: p, initialQueue: queue, initialNow: NOW_ISO, ...extra }));

  it('only filing agents take jobs', () => {
    expect(button(desk(AGENT), 'Take the next job')).toBeDefined();
    for (const p of [REVIEWER, ADMIN]) {
      const markup = desk(p);
      expect(button(markup, 'Take the next job')).toBeUndefined();
      expect(markup).toContain('Only filing agents take jobs and record results.');
    }
  });

  it('an admin without a role sees the queue but cannot open a packet', () => {
    const markup = desk(ADMIN);
    expect(markup).toContain('The queue holds no personal data.');
    expect(button(markup, 'View')).toBeUndefined();
    expect(button(desk(REVIEWER), 'Review')).toBeDefined();
  });

  it('the lock holder records the result; a reviewer only views it', () => {
    expect(desk(AGENT, { initialJob: deskView() })).toContain('Record the result');
    const viewed = desk(REVIEWER, { initialJob: deskView({ lock: { mine: false, expires_at: null } }) });
    expect(viewed).not.toContain('Record the result');
    expect(viewed).toContain('You are viewing this job.');
  });

  it('a needs_attention job can be resolved by a reviewer or an agent', () => {
    const attention = deskView({ job: job({ status: 'needs_attention' }), lock: { mine: false, expires_at: null } });
    expect(desk(REVIEWER, { initialJob: attention })).toContain('Resolve this job');
    expect(desk(ADMIN, { initialJob: attention })).not.toContain('Resolve this job');
  });
});

describe('bulk exports', () => {
  const initial = {
    settlements: [{ id: LAWSUIT_ID, title: 'Product X settlement', deadline: '2026-12-15', bulkEnabled: true }],
    queued: [job({ channel: 'administrator_bulk' })],
    exported: [job({ channel: 'administrator_bulk', status: 'exported' })],
  };

  it('only filing agents export and record results', () => {
    const agent = html(createElement(BulkConsole, { permissions: AGENT, lawsuitId: LAWSUIT_ID, initial }));
    expect(button(agent, 'Export and download the CSV')).toMatch(/disabled=""/);
    expect(button(agent, 'Save these results')).toBeDefined();
    const reviewer = html(createElement(BulkConsole, { permissions: REVIEWER, lawsuitId: LAWSUIT_ID, initial }));
    expect(button(reviewer, 'Export and download the CSV')).toBeUndefined();
    expect(button(reviewer, 'Save these results')).toBeUndefined();
    expect(reviewer).toContain('Only filing agents export files and record results.');
  });
});

describe('overview', () => {
  it('counts jobs by status and channel and links warnings only for those who may open them', () => {
    const jobs = [job({ status: 'needs_attention', deadline: '2026-11-14' }), job({ status: 'filed' })];
    const agent = html(createElement(FilingOverview, { permissions: AGENT, initialJobs: { jobs, capped: [] }, initialNow: NOW_ISO }));
    expect(agent).toContain('Jobs by status and channel');
    expect(agent).toContain('Your access: Filing agent');
    expect(agent).toContain('href="/admin/filing/desk?job=');
    const admin = html(createElement(FilingOverview, { permissions: ADMIN, initialJobs: { jobs, capped: ['filed'] }, initialNow: NOW_ISO }));
    expect(admin).not.toContain('href="/admin/filing/desk?job=');
    expect(admin).toContain('Your access: Admin');
    expect(admin).toContain('1+');
  });
});
