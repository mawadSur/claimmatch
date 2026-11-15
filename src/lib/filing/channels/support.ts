/**
 * Can a channel take a claim like this? Pure checks behind each adapter's
 * supports() (docs/designs/one-click-filing.md, section 8). chooseLane runs
 * them for every enabled channel, in the policy's order.
 */
import { getAdministratorAdapter, UnsupportedAdministratorAdapter } from '@/lib/administrators/adapters';
import {
  AdministratorApiConfigSchema,
  AdministratorBulkConfigSchema,
  AdministratorEmailConfigSchema,
  FilingDeskConfigSchema,
  STAFF_COMPLETABLE_CHALLENGES,
  type AgentChannel,
  type DeskChallengeMode,
  type OfficialFormChallenge,
  type ChannelConfigFor,
  type FilingSpecContent,
} from '../v2/contract-spec';
import type { ChannelSupport } from './types';

export interface SupportInput<C extends AgentChannel> {
  config: ChannelConfigFor<C>;
  spec: FilingSpecContent;
  needsDocuments: boolean;
  /** The settlement's desk challenge rule (0045); absent means 'stop'. */
  challengeMode?: DeskChallengeMode;
}

const OK: ChannelSupport = { ok: true };

/**
 * The known checks the desk cannot get past for this settlement: every one
 * under 'stop'; under 'staff_completes_captcha' every one but a CAPTCHA.
 */
export function blockingChallenges(
  challenges: readonly OfficialFormChallenge[] | undefined,
  mode: DeskChallengeMode | undefined,
): OfficialFormChallenge[] {
  const all = [...(challenges ?? [])];
  if (mode !== 'staff_completes_captcha') return all;
  return all.filter((c) => !STAFF_COMPLETABLE_CHALLENGES.includes(c));
}

/**
 * filing_desk: staff in their own browser. A check the official site is known
 * to show keeps it off, unless the law firm let staff complete that kind
 * (only a CAPTCHA, only with 'staff_completes_captcha').
 */
export function deskSupports(input: SupportInput<'filing_desk'>): ChannelSupport {
  const config = FilingDeskConfigSchema.safeParse(input.config);
  if (!config.success) return { ok: false, reason: 'channel_config_invalid' };
  if (input.needsDocuments && !config.data.accepts_documents) return { ok: false, reason: 'channel_cannot_carry_documents' };
  if (blockingChallenges(input.spec.official_form?.challenges, input.challengeMode).length > 0) {
    return { ok: false, reason: 'form_has_challenge' };
  }
  return OK;
}

/** Header-safe single address (no CR, LF, comma, semicolon or angle brackets). */
export function isPlainAddress(value: string): boolean {
  return /^[^\s@,;<>"'\\]+@[^\s@,;<>"'\\]+\.[^\s@,;<>"'\\]+$/.test(value) && value.length <= 320;
}

/** administrator_email: the administrator's published claims address. */
export function emailSupports(input: SupportInput<'administrator_email'>): ChannelSupport {
  const config = AdministratorEmailConfigSchema.safeParse(input.config);
  if (!config.success) return { ok: false, reason: 'channel_config_invalid' };
  if (![config.data.to, ...config.data.cc].every(isPlainAddress)) return { ok: false, reason: 'channel_config_invalid' };
  if (input.needsDocuments && !config.data.attach_documents) return { ok: false, reason: 'channel_cannot_carry_documents' };
  return OK;
}

/** The packet paths a spec can fill (bulk columns must name one of them). */
export function specPacketPaths(spec: FilingSpecContent): Set<string> {
  return new Set<string>([
    ...spec.member_fields.map((m) => `member.${m.field}`),
    ...spec.questions.map((q) => `answers.${q.key}`),
    ...(spec.benefit_tiers.length ? ['benefit_tier'] : []),
    ...(spec.payout_options.length ? ['payout_method'] : []),
  ]);
}

/** administrator_bulk: a CSV in the administrator's layout. A CSV cannot carry documents. */
export function bulkSupports(input: SupportInput<'administrator_bulk'>): ChannelSupport {
  const config = AdministratorBulkConfigSchema.safeParse(input.config);
  if (!config.success) return { ok: false, reason: 'channel_config_invalid' };
  const paths = specPacketPaths(input.spec);
  for (const column of config.data.columns) {
    if ('path' in column.source && !paths.has(column.source.path)) return { ok: false, reason: 'channel_config_invalid' };
  }
  if (input.needsDocuments) return { ok: false, reason: 'channel_cannot_carry_documents' };
  return OK;
}

/** True when a real adapter is registered for the slug (none is today). */
export function apiAdapterAvailable(slug: string): boolean {
  return !(getAdministratorAdapter(slug) instanceof UnsupportedAdministratorAdapter);
}

/** administrator_api: only with a registered adapter, so never today (channel_config_invalid). */
export function apiSupports(input: SupportInput<'administrator_api'>): ChannelSupport {
  const config = AdministratorApiConfigSchema.safeParse(input.config);
  if (!config.success || !apiAdapterAvailable(config.data.adapter)) return { ok: false, reason: 'channel_config_invalid' };
  if (input.needsDocuments) return { ok: false, reason: 'channel_cannot_carry_documents' };
  return OK;
}

export function channelSupports(
  channel: AgentChannel,
  input: { config: unknown; spec: FilingSpecContent; needsDocuments: boolean; challengeMode?: DeskChallengeMode },
): ChannelSupport {
  switch (channel) {
    case 'filing_desk':
      return deskSupports(input as SupportInput<'filing_desk'>);
    case 'administrator_email':
      return emailSupports(input as SupportInput<'administrator_email'>);
    case 'administrator_bulk':
      return bulkSupports(input as SupportInput<'administrator_bulk'>);
    case 'administrator_api':
      return apiSupports(input as SupportInput<'administrator_api'>);
    default:
      return { ok: false, reason: 'channel_config_invalid' };
  }
}
