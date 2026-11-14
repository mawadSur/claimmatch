/**
 * Filing policies, specs and controls: drafts by staff and admins, decisions
 * by a legal_reviewer only (checked here and again by the 0038 triggers and
 * 0040 functions). Specs are checked with the schema, validateJevRules
 * (src/lib/jev) and the time-zone rule before a draft is saved or approved.
 */
import type { NextResponse } from 'next/server';
import { validateJevRules } from '@/lib/jev';
import type { JevRuleContext } from '@/lib/jev/types';
import { isValidTimeZone } from '@/lib/filing/channels/dates';
import { POLICY_SELECT } from '@/lib/filing/channels/policy';
import type { FilingTarget } from '@/lib/filing/v2/contract-staff';
import { FilingSpecContentSchema, type FilingPolicyContent, type FilingSpecContent } from '@/lib/filing/v2/contract-spec';
import { withdrawFiling } from '@/lib/filing/v2/jobs';
import type { StaffUser } from '@/lib/staff-roles';
import type { createServiceClient } from '@/lib/supabase/server';
import { dbFail, fail, zodFields } from './http';
import { SPEC_SELECT } from './views';

type Svc = ReturnType<typeof createServiceClient>;
type Row = Record<string, unknown>;
type Out = { ok: true; row: Row } | { ok: false; res: NextResponse };
type Fields = Array<{ path: string; message: string }>;

function targetColumn(target: FilingTarget): ['lawsuit_id' | 'administrator_id', string] {
  return 'lawsuit_id' in target ? ['lawsuit_id', target.lawsuit_id] : ['administrator_id', target.administrator_id];
}

export function policyColumns(content: FilingPolicyContent): Row {
  return {
    agent_filing: content.agent_filing,
    channels: content.channels,
    agent_certification_allowed: content.agent_certification_allowed,
    allowed_states: content.allowed_states,
    health_sensitive: content.health_sensitive,
    health_consent_text: content.health_consent_text,
    identity_check_required: content.identity_check_required,
    sources_reviewed: content.sources_reviewed,
    notes: content.notes,
  };
}

async function targetExists(svc: Svc, target: FilingTarget): Promise<boolean> {
  const [column, id] = targetColumn(target);
  const table = column === 'lawsuit_id' ? 'lawsuits' : 'administrators';
  const { data } = await svc.from(table).select('id').eq('id', id).maybeSingle();
  return Boolean(data);
}

async function nextVersion(svc: Svc, table: 'filing_policies' | 'filing_specs', column: string, id: string): Promise<number> {
  const { data } = await svc.from(table).select('version').eq(column, id).order('version', { ascending: false }).limit(1);
  const top = ((data ?? []) as Array<{ version: number }>)[0]?.version ?? 0;
  return top + 1;
}

/** Create the target's draft, or replace its content. One draft per target (unique index). */
export async function upsertPolicyDraft(
  svc: Svc,
  staff: StaffUser,
  target: FilingTarget,
  content: FilingPolicyContent,
  copyFromPolicyId?: string,
): Promise<Out> {
  if (!(await targetExists(svc, target))) return { ok: false, res: fail('not_found') };
  const [column, id] = targetColumn(target);
  if (copyFromPolicyId) {
    const { data: source } = await svc.from('filing_policies').select('id').eq('id', copyFromPolicyId).eq(column, id).maybeSingle();
    if (!source) return { ok: false, res: fail('invalid_request', { fields: [{ path: 'copy_from_policy_id', message: 'Not a policy of this target' }] }) };
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: draft } = await svc.from('filing_policies').select('id').eq(column, id).eq('status', 'draft').maybeSingle();
    if (draft) {
      const { data, error } = await svc
        .from('filing_policies')
        .update({ ...policyColumns(content), updated_by: staff.id })
        .eq('id', String(draft.id))
        .eq('status', 'draft')
        .select(POLICY_SELECT)
        .maybeSingle();
      if (error) return { ok: false, res: dbFail(error) };
      if (data) return { ok: true, row: data as Row };
      continue;
    }
    const version = await nextVersion(svc, 'filing_policies', column, id);
    const { data, error } = await svc
      .from('filing_policies')
      .insert({ [column]: id, version, status: 'draft', ...policyColumns(content), created_by: staff.id, updated_by: staff.id })
      .select(POLICY_SELECT)
      .single();
    if (!error && data) return { ok: true, row: data as Row };
    if (error?.code !== '23505') return { ok: false, res: dbFail(error) };
  }
  return { ok: false, res: fail('revision_conflict') };
}

/**
 * A draft the law firm is approving changed after the reviewer read it (its
 * updated_at moved): the approval would cover text nobody reviewed, so it is
 * refused with this field error (409 revision_conflict).
 */
export function draftChangedSinceRead(currentUpdatedAt: unknown, expectedUpdatedAt: string): NextResponse | null {
  const current = Date.parse(String(currentUpdatedAt));
  if (Number.isFinite(current) && current === Date.parse(expectedUpdatedAt)) return null;
  return fail('revision_conflict', {
    fields: [
      {
        path: 'expected_updated_at',
        message: 'This draft changed after you opened it. Reload it, read the new version, then approve.',
      },
    ],
  });
}

/** Edit a draft; `updatedAt` must be the version the editor saw (lost-update guard). */
export async function updateDraft(
  svc: Svc,
  table: 'filing_policies' | 'filing_specs',
  id: string,
  patch: Row,
  updatedAt: string,
): Promise<Out> {
  const select = table === 'filing_policies' ? POLICY_SELECT : SPEC_SELECT;
  const { data: current } = await svc.from(table).select('id, status, updated_at').eq('id', id).maybeSingle();
  if (!current) return { ok: false, res: fail('not_found') };
  if (current.status !== 'draft') return { ok: false, res: fail('not_draft') };
  if (Date.parse(String(current.updated_at)) !== Date.parse(updatedAt)) return { ok: false, res: fail('revision_conflict') };
  const { data, error } = await svc
    .from(table)
    .update(patch)
    .eq('id', id)
    .eq('status', 'draft')
    .eq('updated_at', String(current.updated_at))
    .select(select)
    .maybeSingle();
  if (error) return { ok: false, res: dbFail(error) };
  return data ? { ok: true, row: data as Row } : { ok: false, res: fail('revision_conflict') };
}

function ruleContext(content: FilingSpecContent): JevRuleContext {
  return {
    questionKeys: content.questions.map((q) => q.key),
    documentKinds: [...new Set(content.benefit_tiers.flatMap((t) => t.proof.map((p) => p.kind)))],
    benefitTiers: content.benefit_tiers.map((t) => t.key),
    payoutOptions: content.payout_options.map((o) => o.value),
  };
}

function jevErrors(rules: unknown[], context: JevRuleContext, pathOf: (index: number, inner: string) => string): Fields {
  try {
    const checked = validateJevRules(rules, context);
    return checked.ok ? [] : checked.errors.map((e) => ({ path: pathOf(e.index, e.path), message: e.message }));
  } catch {
    return [{ path: 'jev_rules', message: 'The rule checker is not available. Try again later.' }];
  }
}

/** Everything beyond the schema: Jev rules, question conditions and patterns, the deadline's time zone. */
export function specProblems(content: FilingSpecContent): Fields {
  const context = ruleContext(content);
  const problems: Fields = [];
  if (content.deadline && !isValidTimeZone(content.deadline.time_zone)) {
    problems.push({ path: 'deadline.time_zone', message: 'Use an IANA time zone, e.g. America/New_York' });
  }
  problems.push(...jevErrors(content.jev_rules, context, (i, p) => `jev_rules.${i}${p ? `.${p}` : ''}`));
  // Question conditions and patterns go through the same checks as a Jev rule.
  const probes: Array<{ path: string; rule: Record<string, unknown> }> = [];
  content.questions.forEach((q, i) => {
    const base = { description: 'Spec check', severity: 'info', message: 'Spec check' };
    if (q.visible_when) probes.push({ path: `questions.${i}.visible_when`, rule: { ...base, id: `spec.visible.${q.key}`, check: q.visible_when } });
    if (q.validation?.pattern) {
      probes.push({
        path: `questions.${i}.validation.pattern`,
        rule: { ...base, id: `spec.pattern.${q.key}`, check: { field: `answers.${q.key}`, op: 'matches', pattern: q.validation.pattern } },
      });
    }
    const v = q.validation;
    if (v && ((v.min !== undefined && v.max !== undefined && v.min > v.max) || (v.min_length !== undefined && v.max_length !== undefined && v.min_length > v.max_length))) {
      problems.push({ path: `questions.${i}.validation`, message: 'The minimum is above the maximum' });
    }
  });
  if (probes.length) {
    problems.push(...jevErrors(probes.map((p) => p.rule), context, (index) => probes[index]?.path ?? 'questions'));
  }
  return problems;
}

/** The schema, then specProblems. */
export function checkSpec(content: unknown): { ok: true; content: FilingSpecContent } | { ok: false; fields: Fields } {
  const parsed = FilingSpecContentSchema.safeParse(content);
  if (!parsed.success) return { ok: false, fields: zodFields(parsed.error) };
  const problems = specProblems(parsed.data);
  return problems.length ? { ok: false, fields: problems } : { ok: true, content: parsed.data };
}

/** A new draft version of a settlement's spec, or its existing draft's content replaced. */
export async function upsertSpecDraft(svc: Svc, staff: StaffUser, lawsuitId: string, content: FilingSpecContent): Promise<Out> {
  if (!(await targetExists(svc, { lawsuit_id: lawsuitId }))) return { ok: false, res: fail('not_found') };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: draft } = await svc.from('filing_specs').select('id').eq('lawsuit_id', lawsuitId).eq('status', 'draft').maybeSingle();
    if (draft) {
      const { data, error } = await svc
        .from('filing_specs')
        .update({ content, updated_by: staff.id })
        .eq('id', String(draft.id))
        .eq('status', 'draft')
        .select(SPEC_SELECT)
        .maybeSingle();
      if (error) return { ok: false, res: dbFail(error) };
      if (data) return { ok: true, row: data as Row };
      continue;
    }
    const version = await nextVersion(svc, 'filing_specs', 'lawsuit_id', lawsuitId);
    const { data, error } = await svc
      .from('filing_specs')
      .insert({ lawsuit_id: lawsuitId, version, status: 'draft', content, created_by: staff.id, updated_by: staff.id })
      .select(SPEC_SELECT)
      .single();
    if (!error && data) return { ok: true, row: data as Row };
    if (error?.code !== '23505') return { ok: false, res: dbFail(error) };
  }
  return { ok: false, res: fail('revision_conflict') };
}

/**
 * Retire a spec (legal_reviewer): signed or queued claims on it go back to
 * the member (needs_you, signature voided). Claims being filed are left to
 * staff: their pre_send check now blocks on the retired spec.
 */
export async function retireSpec(svc: Svc, staff: StaffUser, specId: string, reason: string, now: Date): Promise<Out & { returned?: number }> {
  const { data, error } = await svc
    .from('filing_specs')
    .update({ status: 'retired', retired_by: staff.id, retired_at: now.toISOString(), retire_reason: reason })
    .eq('id', specId)
    .in('status', ['approved', 'superseded'])
    .select(SPEC_SELECT)
    .maybeSingle();
  if (error) return { ok: false, res: dbFail(error) };
  if (!data) {
    const { data: exists } = await svc.from('filing_specs').select('id').eq('id', specId).maybeSingle();
    return { ok: false, res: fail(exists ? 'invalid_transition' : 'not_found') };
  }
  const { data: packets } = await svc.from('claim_packets').select('claim_id, user_id').eq('spec_id', specId).eq('status', 'signed').limit(1000);
  let returned = 0;
  for (const p of (packets ?? []) as Array<{ claim_id: string; user_id: string }>) {
    const moved = await withdrawFiling({ claimId: p.claim_id, userId: p.user_id, to: 'needs_you', reasonCode: 'spec_updated', actor: 'staff', now });
    if (moved.ok && moved.changed) returned += 1;
  }
  return { ok: true, row: data as Row, returned };
}

/** Kill switch or objection for a target. Takes effect at once; turning either off is a legal_reviewer's act. */
export async function setControls(svc: Svc, target: FilingTarget, patch: Row): Promise<Out> {
  const [column, id] = targetColumn(target);
  if (!(await targetExists(svc, target))) return { ok: false, res: fail('not_found') };
  const { data, error } = await svc
    .from('filing_controls')
    .upsert({ [column]: id, ...patch }, { onConflict: column })
    .select('*')
    .single();
  if (error || !data) return { ok: false, res: dbFail(error) };
  return { ok: true, row: data as Row };
}
