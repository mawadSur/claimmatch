/**
 * The filing desk screen (DeskPacketViewSchema, contract-staff.ts): the
 * signed packet in the official form's field order, each value as the exact
 * text to paste, its documents, the instructions, the pre_send checks and the
 * lock. Staff file in their own normal browser: nothing here opens, embeds,
 * scripts or proxies the official site, and any challenge there is a hard stop.
 * Pure.
 */
import type { z } from 'zod';
import type { JevResult } from '@/lib/jev/types';
import { staffLockOwner, type StaffUser } from '@/lib/staff-roles';
import type { DeskPacketView, JobSummarySchema } from '../v2/contract-staff';
import { deadlineOf, type JobContext } from './context';
import { documentLabel, orderedPacketFields } from './packet-fields';
import type { FilingJobRecord } from './types';

export type JobSummary = z.infer<typeof JobSummarySchema>;

/** A job as the console lists it: no member data. */
export function jobSummary(
  job: FilingJobRecord,
  facts: { settlementTitle: string; deadline: string | null },
  me: Pick<StaffUser, 'id'> | null,
): JobSummary {
  const locked = job.status === 'in_progress' && Boolean(job.lock_owner);
  return {
    id: job.id,
    claim_id: job.claim_id,
    lawsuit_id: job.lawsuit_id,
    settlement_title: facts.settlementTitle,
    channel: job.channel,
    status: job.status,
    due_by: job.due_by ?? null,
    deadline: facts.deadline,
    attempt: job.attempt,
    locked,
    locked_by_me: locked && me !== null && job.lock_owner === staffLockOwner(me),
    needs_attention_reason: job.needs_attention_reason ?? null,
    created_at: job.created_at,
  };
}

export function buildDeskView(ctx: JobContext, jev: JevResult, me: StaffUser): DeskPacketView {
  const { deadline } = deadlineOf(ctx.settlement.lawsuit, ctx.spec);
  const desk = ctx.settlement.policy.channels.find((c) => c.type === 'filing_desk');
  const instructions =
    [desk?.type === 'filing_desk' ? desk.instructions : null, ctx.spec.content.desk_notes].filter((s): s is string => Boolean(s)).join('\n\n') ||
    null;
  const summary = jobSummary(ctx.job, { settlementTitle: ctx.settlement.lawsuit.title, deadline }, me);
  return {
    job: summary,
    claim: { id: ctx.claim.id, status: ctx.claim.status },
    settlement: { title: ctx.settlement.lawsuit.title, official_form_url: ctx.spec.content.official_form.url, deadline },
    signature: {
      id: ctx.signature.signature_id,
      typed_name: ctx.signature.typed_name,
      signed_at: ctx.signature.signed_at,
      packet_hash: ctx.signature.packet_hash,
      statement_text: ctx.signature.statement_text,
      lane: ctx.signature.lane,
    },
    fields: orderedPacketFields(ctx.packet, ctx.spec.content).map((f) => ({
      path: f.path,
      label: f.label,
      copy_text: f.text,
      required: f.required,
    })),
    documents: ctx.packet.documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      label: documentLabel(ctx.spec.content, d.kind),
      mime: d.mime,
      size_bytes: d.size_bytes,
      sha256: d.sha256,
    })),
    instructions,
    checks: { outcome: jev.outcome, issues: jev.issues },
    lock: { mine: summary.locked_by_me, expires_at: summary.locked ? ctx.job.lock_expires_at : null },
  };
}
