import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_AUTH_V1,
  AGENT_AUTH_V2,
  AGENT_AUTH_V3,
  AGENT_AUTHORIZATION_VERSIONS,
  agentAuthorizationText,
  authorizationTextFor,
  currentAuthorizationVersion,
  effectiveDeskChallengeMode,
  VERSIONS_COVERING_STAFF_CAPTCHA,
} from '@/lib/filing/v2/authorization-text';
import { CLAIMMATCH_FEE_RATE } from '@/lib/copy';
import { AGENT_CHANNELS } from '@/lib/filing/v2/contract-spec';

// Founder decisions 2026-11-15 (docs/legal/signoff-checklist.md): staff may
// complete a CAPTCHA by hand, but only under agent-auth-v2, which members
// sign once the law firm approves it and AGENT_AUTH_CURRENT_VERSION is set.

const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('agent-auth-v1 never changes', () => {
  it('keeps the exact text members already signed (SHA-256 pinned per lane)', () => {
    expect(sha(agentAuthorizationText('filing_desk', AGENT_AUTH_V1))).toBe('496193591e29d2f6a09f7286114a8fb4611bf41a0bd9a50fb39711126b9f3e43');
    expect(sha(agentAuthorizationText('administrator_email', AGENT_AUTH_V1))).toBe('4a84f3ccb718b2b3cc3836cc9cc595b728e3c55e28f1d2a7fe82446a498f5aac');
    expect(sha(agentAuthorizationText('administrator_bulk', AGENT_AUTH_V1))).toBe('4247946256d8aef2a597ba941375688cde0d22f2428d35d8e6a2dedf0f3264aa');
    expect(sha(agentAuthorizationText('administrator_api', AGENT_AUTH_V1))).toBe('df7c95d8f58aad54680edcf6fbb7ea4c54a19eac8d4941868615166a03d37682');
    expect(agentAuthorizationText('filing_desk', AGENT_AUTH_V1)).toContain('a code, a robot check or an identity check, the agent will stop');
  });
});

describe('agent-auth-v2', () => {
  const v1 = agentAuthorizationText('filing_desk', AGENT_AUTH_V1);
  const v2 = agentAuthorizationText('filing_desk', AGENT_AUTH_V2);

  it('differs from v1 only in the desk paragraph', () => {
    const a = v1.split('\n');
    const b = v2.split('\n');
    expect(b).toHaveLength(a.length);
    const changed = a.map((line, i) => (line === b[i] ? null : i)).filter((i) => i !== null);
    expect(changed).toEqual([2]);
    expect(b[2].startsWith('How it will be submitted: ')).toBe(true);
    for (const lane of AGENT_CHANNELS.filter((l) => l !== 'filing_desk')) {
      expect(agentAuthorizationText(lane, AGENT_AUTH_V2)).toBe(agentAuthorizationText(lane, AGENT_AUTH_V1));
    }
  });

  it('pins SHA-256 so published v2 text cannot drift', () => {
    expect(sha(agentAuthorizationText('filing_desk', AGENT_AUTH_V2))).toBe('ec73bc56bebffeff014296e487877f4edd88d50636c3ec76423286573e8b2eab');
    expect(sha(agentAuthorizationText('administrator_email', AGENT_AUTH_V2))).toBe('4a84f3ccb718b2b3cc3836cc9cc595b728e3c55e28f1d2a7fe82446a498f5aac');
    expect(sha(agentAuthorizationText('administrator_bulk', AGENT_AUTH_V2))).toBe('4247946256d8aef2a597ba941375688cde0d22f2428d35d8e6a2dedf0f3264aa');
    expect(sha(agentAuthorizationText('administrator_api', AGENT_AUTH_V2))).toBe('df7c95d8f58aad54680edcf6fbb7ea4c54a19eac8d4941868615166a03d37682');
  });

  it('lets a person complete a CAPTCHA by hand on the official site, never a bot, a solver or a bypass', () => {
    expect(v2).toContain('a person at the Lawsuit AI filing desk may complete it by hand on the official site on my behalf');
    expect(v2).toContain('never uses a bot or a solving service for it and never gets around it');
    expect(v2).toContain('If the official site asks for a code or an identity check, the agent will stop');
    expect(v2).not.toContain('a robot check or an identity check, the agent will stop');
  });

  it('keeps the fee wording unchanged (founder decision: no fee wording change before the monetization review)', () => {
    for (const lane of AGENT_CHANNELS) {
      expect(agentAuthorizationText(lane, AGENT_AUTH_V2)).toContain(
        '- Lawsuit AI does not charge me a fee for this claim. Filing a claim myself on the official settlement site is free.',
      );
    }
  });

  it('is a known version with its own text, and covers staff CAPTCHAs with v3', () => {
    expect(AGENT_AUTHORIZATION_VERSIONS).toEqual(['agent-auth-v1', 'agent-auth-v2', 'agent-auth-v3']);
    expect(authorizationTextFor(AGENT_AUTH_V2, 'filing_desk')).toBe(v2);
    expect(authorizationTextFor(AGENT_AUTH_V3, 'filing_desk')).toBe(agentAuthorizationText('filing_desk', AGENT_AUTH_V3));
    expect([...VERSIONS_COVERING_STAFF_CAPTCHA]).toEqual([AGENT_AUTH_V2, AGENT_AUTH_V3]);
  });
});

describe('agent-auth-v3', () => {
  const v2 = agentAuthorizationText('filing_desk', AGENT_AUTH_V2);
  const v3 = agentAuthorizationText('filing_desk', AGENT_AUTH_V3);

  it('keeps v1 and v2 byte-identical and only changes the fee bullet', () => {
    expect(sha(agentAuthorizationText('filing_desk', AGENT_AUTH_V1))).toBe('496193591e29d2f6a09f7286114a8fb4611bf41a0bd9a50fb39711126b9f3e43');
    expect(sha(agentAuthorizationText('filing_desk', AGENT_AUTH_V2))).toBe('ec73bc56bebffeff014296e487877f4edd88d50636c3ec76423286573e8b2eab');
    const a = v2.split('\n');
    const b = v3.split('\n');
    expect(b).toHaveLength(a.length);
    const changed = a.map((line, i) => (line === b[i] ? null : i)).filter((i) => i !== null);
    expect(changed).toEqual([6]);
    expect(b[6]).toContain(`${CLAIMMATCH_FEE_RATE} percent`);
    expect(b[6]).toContain('billed separately by invoice');
    expect(b[6]).toContain('If I recover nothing, I owe $0');
    expect(b[6]).toContain('Filing this claim myself on the official settlement site is free');
    expect(v3).toContain('a person at the Lawsuit AI filing desk may complete it by hand');
    expect(v3).not.toContain('Lawsuit AI does not charge me a fee for this claim');
  });

  it('pins SHA-256 per lane so the published v3 text cannot drift', () => {
    expect(sha(agentAuthorizationText('filing_desk', AGENT_AUTH_V3))).toBe('322e21166b197aa6d5e9bbb1259c6acf67e7e0a6469181c475639b3baccd22a5');
    expect(sha(agentAuthorizationText('administrator_email', AGENT_AUTH_V3))).toBe('fb39bb17177a43a6faf570f0d84ea325a8219b2fa57fae6cd25c81ed32496321');
    expect(sha(agentAuthorizationText('administrator_bulk', AGENT_AUTH_V3))).toBe('a6dd5ef5a002358a321293161f584de158d9a08122b109cd642c9ec33c0eb85a');
    expect(sha(agentAuthorizationText('administrator_api', AGENT_AUTH_V3))).toBe('aa8b4e74eba7ebc590a38d3250d34e6d92bede19f83fe784605131a219a96709');
  });
});

describe('the version new members sign', () => {
  it('is v1 unless AGENT_AUTH_CURRENT_VERSION is v2 or v3, or the fee flag defaults to v3', () => {
    expect(currentAuthorizationVersion()).toBe(AGENT_AUTH_V1);
    for (const value of ['', '1', 'v2', 'Agent-Auth-V2', 'agent-auth-v2 ']) {
      vi.stubEnv('AGENT_AUTH_CURRENT_VERSION', value);
      expect(currentAuthorizationVersion()).toBe(AGENT_AUTH_V1);
    }
    vi.stubEnv('AGENT_AUTH_CURRENT_VERSION', 'agent-auth-v1');
    expect(currentAuthorizationVersion()).toBe(AGENT_AUTH_V1);
    vi.stubEnv('AGENT_AUTH_CURRENT_VERSION', 'agent-auth-v2');
    expect(currentAuthorizationVersion()).toBe(AGENT_AUTH_V2);
    expect(agentAuthorizationText('filing_desk')).toBe(agentAuthorizationText('filing_desk', AGENT_AUTH_V2));
    vi.stubEnv('AGENT_AUTH_CURRENT_VERSION', 'agent-auth-v3');
    expect(currentAuthorizationVersion()).toBe(AGENT_AUTH_V3);
    expect(agentAuthorizationText('filing_desk')).toBe(agentAuthorizationText('filing_desk', AGENT_AUTH_V3));
  });

  it('defaults to v3 when FEE_DISCLOSURE_ENABLED is on and the version is unset', () => {
    vi.stubEnv('FEE_DISCLOSURE_ENABLED', '1');
    expect(currentAuthorizationVersion()).toBe(AGENT_AUTH_V3);
    vi.stubEnv('AGENT_AUTH_CURRENT_VERSION', 'agent-auth-v2');
    expect(currentAuthorizationVersion()).toBe(AGENT_AUTH_V2);
    vi.stubEnv('AGENT_AUTH_CURRENT_VERSION', 'agent-auth-v1');
    expect(currentAuthorizationVersion()).toBe(AGENT_AUTH_V1);
  });
});

describe('CAPTCHA permission matrix (effectiveDeskChallengeMode)', () => {
  it('v1 stops, v2 + rule on allows, v2 + rule off stops, unknown stops', () => {
    expect(effectiveDeskChallengeMode('staff_completes_captcha', AGENT_AUTH_V1)).toBe('stop');
    expect(effectiveDeskChallengeMode('staff_completes_captcha', AGENT_AUTH_V2)).toBe('staff_completes_captcha');
    expect(effectiveDeskChallengeMode('staff_completes_captcha', AGENT_AUTH_V3)).toBe('staff_completes_captcha');
    expect(effectiveDeskChallengeMode('stop', AGENT_AUTH_V2)).toBe('stop');
    expect(effectiveDeskChallengeMode(undefined, AGENT_AUTH_V2)).toBe('stop');
    expect(effectiveDeskChallengeMode('staff_completes_captcha', 'agent-auth-v0')).toBe('stop');
    expect(effectiveDeskChallengeMode('staff_completes_captcha', '')).toBe('stop');
  });
  it('with no version given, follows the version members sign now', () => {
    expect(effectiveDeskChallengeMode('staff_completes_captcha')).toBe('stop');
    vi.stubEnv('AGENT_AUTH_CURRENT_VERSION', 'agent-auth-v2');
    expect(effectiveDeskChallengeMode('staff_completes_captcha')).toBe('staff_completes_captcha');
  });
});
