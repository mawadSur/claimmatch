import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { chooseLane, resolveEffectivePolicy, type LaneInput } from '@/lib/filing/channels/index';
import { controlsRecordFromRow, deskChallengeModeOf } from '@/lib/filing/channels/policy';
import { blockingChallenges, deskSupports } from '@/lib/filing/channels/support';
import { toControlsRecord } from '@/lib/filing/v2/records';
import { DeskChallengeRequestSchema } from '@/lib/filing/v2/contract-staff';
import {
  AGENT_AUTH_V1,
  currentAuthorizationVersion,
  VERSIONS_COVERING_STAFF_CAPTCHA,
  effectiveDeskChallengeMode,
} from '@/lib/filing/v2/authorization-text';
import {
  FilingDeskConfigSchema,
  FilingPolicyContentSchema,
  FilingSpecContentSchema,
  type FilingControlsRecord,
  type FilingPolicyRecord,
} from '@/lib/filing/v2/contract-spec';
import { ChallengeRule } from '@/components/admin/filing/DeskPacket';
import { DeskChallengeCard } from '@/components/admin/filing/DeskChallengeCard';
import { controls as controlsView, expectedPermissions } from './admin-filing-fixtures';

// The desk's challenge rule per settlement (0045, founder decision on #52):
// 'stop' by default; 'staff_completes_captcha' lets a person at the desk
// complete a CAPTCHA by hand. Codes, identity checks and logins always stop.

const LAWSUIT = '00000000-0000-4000-8000-0000000000a1';
const NOW = new Date('2026-11-12T15:00:00Z');
const SPEC = (challenges: string[]) =>
  FilingSpecContentSchema.parse({
    official_form: { url: 'https://official.example.test/claim', challenges },
    class_definition: { text: 'All persons who bought the product.', source_url: 'https://official.example.test/notice' },
    attestation: { text: 'I declare under penalty of perjury that the above is true.' },
    member_fields: [{ field: 'legal_name', official_label: 'Full Name', required: true }],
  });
const policyRecord: FilingPolicyRecord = {
  ...FilingPolicyContentSchema.parse({ agent_filing: 'allowed', allowed_states: ['CA'], channels: [{ type: 'filing_desk', enabled: true }] }),
  id: '00000000-0000-4000-8000-0000000000b1',
  lawsuit_id: LAWSUIT,
  administrator_id: null,
  version: 1,
  status: 'approved',
  approved_by: '00000000-0000-4000-8000-0000000000e1',
  approved_at: '2026-11-01T00:00:00Z',
};
const controls = (over: Partial<FilingControlsRecord> = {}): FilingControlsRecord => ({
  lawsuit_id: LAWSUIT,
  administrator_id: null,
  kill_switch: false,
  kill_switch_reason: null,
  objection_received_at: null,
  ...over,
});
function input(challenges: string[], settlementControls: FilingControlsRecord | null, administratorControls: FilingControlsRecord | null = null): LaneInput {
  return {
    now: NOW,
    policy: resolveEffectivePolicy({
      settlementPolicy: policyRecord,
      administratorPolicy: null,
      settlementControls,
      administratorControls,
      thirdPartyFeeStatus: 'unknown',
    }),
    settlement: { openForClaims: true, deadline: '2026-12-31' },
    spec: { id: '00000000-0000-4000-8000-0000000000c1', version: 1, status: 'approved', content: SPEC(challenges) },
    member: { state: 'CA' },
    needsDocuments: false,
    healthConsent: { required: false, given: null },
    desk: { openJobs: 0 },
    email: { configured: true },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('blockingChallenges', () => {
  it("'stop' (and anything unknown) blocks on every known check", () => {
    expect(blockingChallenges(['captcha'], 'stop')).toEqual(['captcha']);
    expect(blockingChallenges(['captcha', 'sms_code'], undefined)).toEqual(['captcha', 'sms_code']);
  });
  it("'staff_completes_captcha' lets a CAPTCHA through, never a code, identity check or login", () => {
    expect(blockingChallenges(['captcha'], 'staff_completes_captcha')).toEqual([]);
    expect(blockingChallenges(['captcha', 'email_code', 'identity_check', 'account_login', 'sms_code'], 'staff_completes_captcha')).toEqual([
      'email_code',
      'identity_check',
      'account_login',
      'sms_code',
    ]);
  });
});

describe('deskSupports and chooseLane', () => {
  const config = FilingDeskConfigSchema.parse({ type: 'filing_desk', enabled: true });
  it('keeps the desk off for a CAPTCHA form by default', () => {
    expect(deskSupports({ config, spec: SPEC(['captcha']), needsDocuments: false })).toEqual({ ok: false, reason: 'form_has_challenge' });
    expect(chooseLane(input(['captcha'], controls()))).toMatchObject({ lane: 'self_file', reasons: ['form_has_challenge'] });
    expect(chooseLane(input(['captcha'], null))).toMatchObject({ lane: 'self_file' });
  });
  it('the desk takes a CAPTCHA form under the loosened rule', () => {
    expect(deskSupports({ config, spec: SPEC(['captcha']), needsDocuments: false, challengeMode: 'staff_completes_captcha' })).toEqual({ ok: true });
  });
  it('but chooseLane keeps it self_file until the authorization members sign says staff may complete it', () => {
    // agent-auth-v1 tells the member the agent stops at any robot check.
    const decision = chooseLane(input(['captcha'], controls({ desk_challenge_mode: 'staff_completes_captcha' })));
    expect(decision).toMatchObject({ lane: 'self_file', reasons: ['form_has_challenge'] });
  });
  it('effectiveDeskChallengeMode: only a covering authorization version lets the loosened rule apply', () => {
    expect(currentAuthorizationVersion()).toBe(AGENT_AUTH_V1);
    expect(VERSIONS_COVERING_STAFF_CAPTCHA.has(AGENT_AUTH_V1)).toBe(false);
    expect(effectiveDeskChallengeMode('staff_completes_captcha')).toBe('stop');
    const v2 = new Set(['agent-auth-v2']);
    expect(effectiveDeskChallengeMode('staff_completes_captcha', 'agent-auth-v2', v2)).toBe('staff_completes_captcha');
    // A claim signed under v1 is filed under stop, whatever the settlement says later.
    expect(effectiveDeskChallengeMode('staff_completes_captcha', 'agent-auth-v1', v2)).toBe('stop');
    expect(effectiveDeskChallengeMode('stop', 'agent-auth-v2', v2)).toBe('stop');
    expect(effectiveDeskChallengeMode(undefined, 'agent-auth-v2', v2)).toBe('stop');
  });
  it('CAPTCHA matrix in chooseLane: v1 stops, v2 + rule on takes the desk, v2 + rule off stops', () => {
    const on = controls({ desk_challenge_mode: 'staff_completes_captcha' });
    const withVersion = (c: FilingControlsRecord, version: string) => ({ ...input(['captcha'], c), authorizationVersion: version });
    expect(chooseLane(withVersion(on, 'agent-auth-v1'))).toMatchObject({ lane: 'self_file', reasons: ['form_has_challenge'] });
    expect(chooseLane(withVersion(on, 'agent-auth-v2'))).toMatchObject({ lane: 'filing_desk', agent: true });
    expect(chooseLane(withVersion(controls(), 'agent-auth-v2'))).toMatchObject({ lane: 'self_file', reasons: ['form_has_challenge'] });
    expect(chooseLane(withVersion(on, 'agent-auth-v0'))).toMatchObject({ lane: 'self_file' });
  });
  it('before signing, the lane follows the version members sign now (AGENT_AUTH_CURRENT_VERSION)', () => {
    const on = controls({ desk_challenge_mode: 'staff_completes_captcha' });
    expect(chooseLane(input(['captcha'], on)).lane).toBe('self_file');
    vi.stubEnv('AGENT_AUTH_CURRENT_VERSION', 'agent-auth-v2');
    expect(currentAuthorizationVersion()).toBe('agent-auth-v2');
    expect(chooseLane(input(['captcha'], on)).lane).toBe('filing_desk');
    // A claim signed under v1 still stops, whatever members sign now.
    expect(chooseLane({ ...input(['captcha'], on), authorizationVersion: 'agent-auth-v1' }).lane).toBe('self_file');
    vi.stubEnv('AGENT_AUTH_CURRENT_VERSION', 'agent-auth-v1');
    expect(chooseLane(input(['captcha'], on)).lane).toBe('self_file');
  });
  it('never for a form that also sends a code or checks identity', () => {
    const loosened = controls({ desk_challenge_mode: 'staff_completes_captcha' });
    expect(chooseLane(input(['captcha', 'sms_code'], loosened))).toMatchObject({ lane: 'self_file', reasons: ['form_has_challenge'] });
    expect(chooseLane(input(['identity_check'], loosened))).toMatchObject({ lane: 'self_file' });
  });
  it('an administrator-level row can never loosen it: only the settlement row counts', () => {
    const fromAdmin = input(['captcha'], controls(), controls({ lawsuit_id: null, administrator_id: LAWSUIT, desk_challenge_mode: 'staff_completes_captcha' }));
    expect(fromAdmin.policy.desk_challenge_mode).toBe('stop');
    expect(chooseLane(fromAdmin).lane).toBe('self_file');
  });
  it('a kill switch still wins over a loosened rule', () => {
    const killed = controls({ desk_challenge_mode: 'staff_completes_captcha', kill_switch: true, kill_switch_reason: 'pause' });
    expect(chooseLane(input(['captcha'], killed))).toMatchObject({ lane: 'self_file', reasons: ['kill_switch'] });
  });
});

describe('reading the rule from a row', () => {
  it('reads anything but the one loosened value as stop', () => {
    expect(deskChallengeModeOf('staff_completes_captcha')).toBe('staff_completes_captcha');
    for (const v of [undefined, null, '', 'STOP', 'solve', 1]) expect(deskChallengeModeOf(v)).toBe('stop');
    expect(controlsRecordFromRow({ lawsuit_id: LAWSUIT })?.desk_challenge_mode).toBe('stop');
    expect(toControlsRecord({ lawsuit_id: LAWSUIT, desk_challenge_mode: 'staff_completes_captcha' }).desk_challenge_mode).toBe('staff_completes_captcha');
    expect(toControlsRecord({ lawsuit_id: LAWSUIT, desk_challenge_mode: 'other' }).desk_challenge_mode).toBe('stop');
  });
  it('the request needs notes to loosen it and names a settlement only', () => {
    expect(DeskChallengeRequestSchema.safeParse({ lawsuit_id: LAWSUIT, mode: 'staff_completes_captcha', notes: null }).success).toBe(false);
    expect(DeskChallengeRequestSchema.safeParse({ lawsuit_id: LAWSUIT, mode: 'staff_completes_captcha', notes: 'Reviewed.' }).success).toBe(true);
    expect(DeskChallengeRequestSchema.safeParse({ lawsuit_id: LAWSUIT, mode: 'stop', notes: null }).success).toBe(true);
    expect(DeskChallengeRequestSchema.safeParse({ administrator_id: LAWSUIT, mode: 'stop', notes: null }).success).toBe(false);
  });
});

describe('the desk screen', () => {
  it('says nothing extra under stop, and spells out the limits when loosened', () => {
    expect(renderToStaticMarkup(createElement(ChallengeRule, { mode: 'stop' }))).toBe('');
    const html = renderToStaticMarkup(createElement(ChallengeRule, { mode: 'staff_completes_captcha' }));
    expect(html).toContain('yourself, by hand, in your own');
    expect(html).toContain('Never use a tool, extension or service for it');
    expect(html).toContain('is still a hard stop');
  });
});

describe('the console card', () => {
  const card = (roles: Array<'legal_reviewer' | 'filing_agent'>, isAdmin: boolean, mode: 'stop' | 'staff_completes_captcha' = 'stop') =>
    renderToStaticMarkup(
      createElement(DeskChallengeCard, {
        permissions: expectedPermissions(roles, isAdmin),
        lawsuitId: LAWSUIT,
        view: controlsView({ desk_challenge_mode: mode, desk_challenge_notes: mode === 'stop' ? null : 'Site terms reviewed.' }),
        onChanged: () => {},
      }),
    );
  it('only a legal reviewer gets the switch; everyone sees the rule in force', () => {
    expect(card(['legal_reviewer'], false)).toContain('Allow staff to complete a CAPTCHA');
    for (const html of [card([], true), card(['filing_agent'], false)]) {
      expect(html).not.toContain('Allow staff to complete a CAPTCHA');
      expect(html).toContain('Only a legal reviewer can change this rule.');
      expect(html).toContain('Stop at any check (default)');
    }
  });
  it('shows the loosened rule with the firm’s notes, and the way back', () => {
    const html = card(['legal_reviewer'], false, 'staff_completes_captcha');
    expect(html).toContain('Staff may complete a CAPTCHA by hand');
    expect(html).toContain('Site terms reviewed.');
    expect(html).toContain('Go back to stopping at any check');
    expect(html).toContain('Not in effect yet');
  });
  it('once members sign v2 (from the server view), the rule is in effect for v2 claims only', () => {
    const html = renderToStaticMarkup(
      createElement(DeskChallengeCard, {
        permissions: expectedPermissions(['legal_reviewer'], false),
        lawsuitId: LAWSUIT,
        view: { ...controlsView({ desk_challenge_mode: 'staff_completes_captcha', desk_challenge_notes: 'Reviewed.' }), current_authorization_version: 'agent-auth-v2' },
        onChanged: () => {},
      }),
    );
    expect(html).not.toContain('Not in effect yet');
    expect(html).toContain('In effect for claims signed under agent-auth-v2 only');
  });
});
