/**
 * Database rows as the staff API's views (contract-staff.ts). Content that no
 * longer parses is shown as stored, so staff can see and fix it.
 */
import { policyContentOf } from '@/lib/filing/channels/policy';
import { FilingPolicyContentSchema, FilingSpecContentSchema } from '@/lib/filing/v2/contract-spec';

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function target(row: Row): { lawsuit_id: string } | { administrator_id: string } {
  return typeof row.lawsuit_id === 'string' ? { lawsuit_id: row.lawsuit_id } : { administrator_id: String(row.administrator_id) };
}

export function policyView(row: Row) {
  const raw = policyContentOf(row);
  const parsed = FilingPolicyContentSchema.safeParse(raw);
  return {
    id: String(row.id),
    target: target(row),
    version: Number(row.version),
    status: String(row.status),
    content: parsed.success ? parsed.data : raw,
    created_by: str(row.created_by),
    created_at: String(row.created_at),
    updated_by: str(row.updated_by),
    updated_at: String(row.updated_at),
    approved_by: str(row.approved_by),
    approved_at: str(row.approved_at),
    approval_notes: str(row.approval_notes),
    documents_reviewed: Array.isArray(row.documents_reviewed) ? row.documents_reviewed : null,
    rejected_by: str(row.rejected_by),
    rejected_at: str(row.rejected_at),
    rejection_notes: str(row.rejection_notes),
  };
}

export const SPEC_SELECT =
  'id, lawsuit_id, version, status, content, created_by, created_at, updated_by, updated_at, approved_by, approved_at, approval_notes, documents_reviewed, retired_at, retire_reason';

export function specView(row: Row) {
  const parsed = FilingSpecContentSchema.safeParse(row.content);
  return {
    id: String(row.id),
    lawsuit_id: String(row.lawsuit_id),
    version: Number(row.version),
    status: String(row.status),
    content: parsed.success ? parsed.data : row.content,
    created_by: str(row.created_by),
    created_at: String(row.created_at),
    updated_by: str(row.updated_by),
    updated_at: String(row.updated_at),
    approved_by: str(row.approved_by),
    approved_at: str(row.approved_at),
    approval_notes: str(row.approval_notes),
    documents_reviewed: Array.isArray(row.documents_reviewed) ? row.documents_reviewed : null,
    retired_at: str(row.retired_at),
    retire_reason: str(row.retire_reason),
  };
}

export function controlsView(row: Row) {
  return {
    target: target(row),
    kill_switch: row.kill_switch === true,
    kill_switch_reason: str(row.kill_switch_reason),
    kill_switch_changed_at: str(row.kill_switch_changed_at),
    objection_received_at: str(row.objection_received_at),
    objection_notes: str(row.objection_notes),
  };
}

export function roleView(row: Row, email: string | null) {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    email,
    role: String(row.role),
    granted_by: str(row.granted_by),
    granted_at: String(row.granted_at),
  };
}

export function auditView(row: Row) {
  return {
    id: String(row.id),
    actor_id: String(row.actor_id),
    actor_roles: Array.isArray(row.actor_roles) ? (row.actor_roles as string[]) : [],
    action: String(row.action),
    subject_user_id: str(row.subject_user_id),
    claim_id: str(row.claim_id),
    job_id: str(row.job_id),
    lawsuit_id: str(row.lawsuit_id),
    detail: row.detail && typeof row.detail === 'object' ? (row.detail as Record<string, unknown>) : {},
    created_at: String(row.created_at),
  };
}
