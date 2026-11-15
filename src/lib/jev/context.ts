/**
 * The facts one Jev run works from, computed once from JevInput: the spec's
 * questions and which are visible, the chosen tier, document counts, the
 * deadline in the settlement's time zone and the lane's channel config.
 * Reading fields here is the only place Jev touches packet values, and it
 * never reads inherited properties (an answer key such as "constructor" is
 * just a key).
 */
import { isAgentLane, type Lane, type PacketDraft } from '../filing/v2/contract';
import type { BenefitTier, ChannelConfig, FilingSpecContent, SpecQuestion } from '../filing/v2/contract-spec';
import { conditionProblem, evaluateCondition, type JevValue } from './conditions';
import { deadlineFacts, resolveTimeZone, type DeadlineFacts } from './dates';
import { STAFF } from './messages';
import { JEV_MODES, type JevAudience, type JevInput, type JevIssue, type JevMode, type JevSeverity } from './types';

export interface JevContext {
  input: JevInput;
  mode: JevMode;
  partial: boolean;
  /** Severity for something still missing: info while filling (partial), block before signing or sending. */
  missing: JevSeverity;
  packet: PacketDraft;
  lane: Lane;
  agent: boolean;
  spec: JevInput['spec'];
  content: FilingSpecContent | null;
  questions: Map<string, SpecQuestion>;
  /** Keys of questions the member is asked now (their tier, and visible_when holds). */
  visible: Set<string>;
  tier: BenefitTier | null;
  docCounts: Map<string, number>;
  /** Proof kinds any tier flags as health data. */
  flaggedKinds: Set<string>;
  zone: string;
  dates: DeadlineFacts;
  /** The policy's config for the lane's channel (agent lanes), enabled or not; null when absent. */
  channel: ChannelConfig | null;
  issues: JevIssue[];
  read: (field: string) => JevValue;
  add: (issue: JevIssue) => void;
}

export function makeIssue(
  rule_id: string,
  severity: JevSeverity,
  code: string,
  field: string | null,
  message: string,
  audience: JevAudience = 'member',
  source: 'global' | 'settlement' = 'global',
): JevIssue {
  return { rule_id, source, severity, code, message, field, audience };
}

function ownValue(record: unknown, key: string): unknown {
  if (record === null || typeof record !== 'object') return undefined;
  return Object.prototype.hasOwnProperty.call(record, key) ? (record as Record<string, unknown>)[key] : undefined;
}

function asJevValue(value: unknown): JevValue {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value as string[];
  return undefined;
}

/** The member's answer to `key`, or undefined when there is none. */
export function answerOf(packet: PacketDraft, key: string): JevValue {
  return asJevValue(ownValue(packet.answers, key));
}

/** Answer keys the packet holds (own keys only). */
export function answerKeys(packet: PacketDraft): string[] {
  return packet.answers && typeof packet.answers === 'object' ? Object.keys(packet.answers) : [];
}

function readField(ctx: JevContext, field: string): JevValue {
  const { packet } = ctx;
  if (field.startsWith('member.address.')) return asJevValue(ownValue(packet.member?.address, field.slice(15)));
  if (field.startsWith('member.')) return asJevValue(ownValue(packet.member, field.slice(7)));
  if (field.startsWith('answers.')) return answerOf(packet, field.slice(8));
  if (field === 'benefit_tier') return packet.benefit_tier;
  if (field === 'payout_method') return packet.payout_method;
  if (field.startsWith('doc_count.')) return ctx.docCounts.get(field.slice(10)) ?? 0;
  if (field === 'meta.days_to_deadline') return ctx.dates.daysToDeadline;
  if (field === 'meta.lane') return ctx.lane;
  return undefined;
}

function visibleQuestions(ctx: JevContext): Set<string> {
  const visible = new Set<string>();
  const tier = ctx.packet.benefit_tier;
  for (const q of ctx.questions.values()) {
    if (q.tiers && !(tier && q.tiers.includes(tier))) continue;
    if (q.visible_when) {
      const problem = conditionProblem([q.visible_when]);
      if (problem) {
        // Fail closed: asking a question that may not apply is safer than sending a claim without it.
        ctx.add(makeIssue('global.required_answers', 'warn', 'spec_condition_invalid', `answers.${q.key}`, STAFF.conditionInvalid(q.key, problem), 'staff'));
      } else if (!evaluateCondition(q.visible_when, ctx.read)) {
        continue;
      }
    }
    visible.add(q.key);
  }
  return visible;
}

export function buildContext(input: JevInput): JevContext {
  const issues: JevIssue[] = [];
  const add = (issue: JevIssue) => {
    issues.push(issue);
  };
  const knownMode = (JEV_MODES as readonly string[]).includes(input.mode);
  const mode: JevMode = knownMode ? input.mode : 'pre_send';
  if (!knownMode) {
    add(makeIssue('jev.engine', 'block', 'engine_unavailable', null, STAFF.inputInvalid(`unknown mode ${JSON.stringify(input.mode)}`), 'staff'));
  }
  if (typeof input.now !== 'string' || Number.isNaN(Date.parse(input.now))) {
    add(makeIssue('jev.engine', 'block', 'engine_unavailable', null, STAFF.inputInvalid('now is not an ISO 8601 instant'), 'staff'));
  }

  const packet = input.packet;
  const spec = input.spec ?? null;
  const content = spec?.content ?? null;
  const questions = new Map<string, SpecQuestion>((content?.questions ?? []).map((q) => [q.key, q]));
  const tierKey = packet.benefit_tier;
  const tier = tierKey ? (content?.benefit_tiers?.find((t) => t.key === tierKey) ?? null) : null;
  const docCounts = new Map<string, number>();
  for (const doc of packet.documents ?? []) docCounts.set(doc.kind, (docCounts.get(doc.kind) ?? 0) + 1);
  const flaggedKinds = new Set<string>(
    (content?.benefit_tiers ?? []).flatMap((t) => (t.proof ?? []).filter((p) => p.health_flag).map((p) => p.kind)),
  );

  const zoneSetting = content?.deadline?.time_zone ?? null;
  const zone = resolveTimeZone(zoneSetting);
  if (!zone.valid) {
    add(makeIssue('global.deadline_cutoff', 'warn', 'spec_time_zone_invalid', null, STAFF.timeZone(String(zoneSetting)), 'staff'));
  }
  const dates = deadlineFacts({
    now: input.now,
    zone: zone.zone,
    deadline: input.settlement?.deadline ?? null,
    daysToDeadline: input.settlement?.daysToDeadline ?? null,
  });

  const lane = input.lane;
  const agent = isAgentLane(lane);
  const channel = agent ? ((input.policy?.channels ?? []).find((c) => c.type === lane) ?? null) : null;

  const ctx: JevContext = {
    input,
    mode,
    partial: mode === 'partial',
    missing: mode === 'partial' ? 'info' : 'block',
    packet,
    lane,
    agent,
    spec,
    content,
    questions,
    visible: new Set(),
    tier,
    docCounts,
    flaggedKinds,
    zone: zone.zone,
    dates,
    channel,
    issues,
    read: () => undefined,
    add,
  };
  ctx.read = (field) => readField(ctx, field);
  ctx.visible = visibleQuestions(ctx);
  return ctx;
}
