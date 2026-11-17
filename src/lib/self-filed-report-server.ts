/**
 * Server-only writes for self-filed reports. Claim status still goes through
 * startTrackingClaim / applyClaimPlan so the timeline and scorecard see the
 * same reported_filed / submitted rows as today.
 */
import { isUserReportedSubmitted as timelineSubmitted } from '@/lib/claim-timeline';
import {
  canReportWithoutClaim,
  claimActionAvailability,
  confirmationNumberSchema,
  planClaimTransition,
  toClaimView,
  validateFiledOn,
  type ClaimView,
} from '@/lib/claims';
import {
  UUID_RE,
  applyClaimPlan,
  claimContext,
  loadSettlementById,
  startTrackingClaim,
} from '@/lib/claims-server';
import { flags } from '@/lib/flags';
import { isInternalEmail } from '@/lib/internal-users';
import {
  SELF_FILED_CONFIRMATIONS_BUCKET,
  parseSelfFiledBytes,
  parseSelfFiledMime,
  selfFiledStoragePath,
  toSelfFiledReportView,
  type SelfFiledReportView,
} from '@/lib/self-filed-report';
import { createServiceClient } from '@/lib/supabase/server';
import { isTestSettlementSlug } from '@/lib/test-settlements';

function replyError(error: string, status: number, code?: string) {
  return { ok: false as const, error, status, code };
}

export type SelfFiledSaveResult =
  | { ok: true; claim: ClaimView; report: SelfFiledReportView; created: boolean }
  | { ok: false; error: string; status: number; code?: string };

export function parseSelfFiledReportBody(
  body: unknown,
  now: Date,
):
  | { ok: true; lawsuitId: string; confirmationNumber: string | undefined; filedOn: string | undefined }
  | { ok: false; error: string } {
  const rec = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!rec) return { ok: false, error: 'Invalid request.' };
  const lawsuitId = typeof rec.lawsuit_id === 'string' ? rec.lawsuit_id : '';
  if (!UUID_RE.test(lawsuitId)) return { ok: false, error: 'A settlement is required.' };

  let confirmationNumber: string | undefined;
  if (rec.confirmation_number != null && rec.confirmation_number !== '') {
    const parsed = confirmationNumberSchema.safeParse(rec.confirmation_number);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the confirmation number.' };
    }
    confirmationNumber = parsed.data;
  }

  let filedOn: string | undefined;
  if (rec.filed_on != null && rec.filed_on !== '') {
    if (typeof rec.filed_on !== 'string') return { ok: false, error: 'Enter the filing date as YYYY-MM-DD.' };
    const date = validateFiledOn(rec.filed_on, now);
    if (!date.ok) return { ok: false, error: date.message };
    filedOn = date.value;
  }

  return { ok: true, lawsuitId, confirmationNumber, filedOn };
}

export async function saveSelfFiledReport(args: {
  userId: string;
  email?: string | null;
  lawsuitId: string;
  confirmationNumber?: string;
  filedOn?: string;
  now?: Date;
  requestId?: string | null;
}): Promise<SelfFiledSaveResult> {
  if (!flags.selfFiledReport()) return replyError('Not found.', 404);
  const now = args.now ?? new Date();
  const svc = createServiceClient();

  const lookup = await loadSettlementById(args.lawsuitId);
  if (!lookup.ok) return replyError("We couldn't load that settlement right now. Please try again.", 503, 'settlement_unavailable');
  const settlement = lookup.settlement;
  const context = claimContext(settlement, now);
  if (!settlement || !context.published || context.fictional || (isTestSettlementSlug(settlement.slug) && !isInternalEmail(args.email))) {
    return replyError("We couldn't find that settlement.", 404);
  }

  const existingClaim = await svc
    .from('claims')
    .select('*')
    .eq('user_id', args.userId)
    .eq('lawsuit_id', settlement.id)
    .maybeSingle();
  if (existingClaim.error) {
    console.error('[self-filed] claim lookup failed', { code: existingClaim.error.code });
    return replyError('Something went wrong. Please try again.', 500);
  }

  let claim: ClaimView;
  let created = false;
  if (existingClaim.data) {
    claim = toClaimView(existingClaim.data as Record<string, unknown>);
  } else {
    if (!canReportWithoutClaim(context) && !context.openForClaims) {
      return replyError(
        'It has been more than 30 days since the deadline, so a claim can no longer be reported here. If you filed, keep the confirmation the settlement administrator sent you.',
        409,
        'window_closed',
      );
    }
    const started = await startTrackingClaim({
      userId: args.userId,
      lawsuitId: settlement.id,
      lawsuitTitle: settlement.title,
      detail: { action: 'start_tracking', intent: 'report_filed', request_id: args.requestId ?? null },
    });
    if (!started.ok) return replyError(started.error, started.status, started.code);
    claim = started.claim;
    created = Boolean(started.created);
  }

  const can = claimActionAvailability(claim, context);
  const alreadyFiled = timelineSubmitted(claim);
  if (!alreadyFiled) {
    if (!can.reportFiled && !canReportWithoutClaim(context)) {
      return replyError(
        'It has been more than 30 days since the deadline, so this claim can no longer be updated here.',
        409,
        'window_closed',
      );
    }
    const plan = planClaimTransition(
      claim,
      {
        action: 'report_filed',
        ...(args.confirmationNumber ? { confirmation_number: args.confirmationNumber } : {}),
        ...(args.filedOn ? { filed_on: args.filedOn } : {}),
      },
      context,
      now,
    );
    if (!plan.ok) return replyError(plan.message, 409, plan.refusal);
    if (!plan.noop) {
      const applied = await applyClaimPlan({
        claimId: claim.id,
        userId: args.userId,
        plan: plan.plan,
        detail: { via: 'self_filed_report', request_id: args.requestId ?? null },
      });
      if (!applied.ok) return replyError(applied.error, applied.status, applied.code);
      claim = applied.claim;
    }
  } else if (args.confirmationNumber && can.addConfirmation) {
    const plan = planClaimTransition(
      claim,
      { action: 'add_confirmation', confirmation_number: args.confirmationNumber },
      context,
      now,
    );
    if (plan.ok && !plan.noop) {
      const applied = await applyClaimPlan({
        claimId: claim.id,
        userId: args.userId,
        plan: plan.plan,
        detail: { via: 'self_filed_report', request_id: args.requestId ?? null },
      });
      if (!applied.ok) return replyError(applied.error, applied.status, applied.code);
      claim = applied.claim;
    }
  }

  const nowIso = now.toISOString();
  const number = args.confirmationNumber ?? claim.confirmation_number ?? null;
  const { data: existingReport, error: reportReadError } = await svc
    .from('self_filed_reports')
    .select('*')
    .eq('user_id', args.userId)
    .eq('lawsuit_id', settlement.id)
    .maybeSingle();
  if (reportReadError) {
    console.error('[self-filed] report lookup failed', { code: reportReadError.code });
    return replyError('Could not save that just now.', 500);
  }

  let reportRow: Record<string, unknown>;
  if (existingReport?.id) {
    const { data, error } = await svc
      .from('self_filed_reports')
      .update({
        claim_id: claim.id,
        confirmation_number: number,
        updated_at: nowIso,
      })
      .eq('id', existingReport.id)
      .eq('user_id', args.userId)
      .select('*')
      .maybeSingle();
    if (error || !data) {
      console.error('[self-filed] report update failed', { code: error?.code });
      return replyError('Could not save that just now.', 500);
    }
    reportRow = data as Record<string, unknown>;
  } else {
    const { data, error } = await svc
      .from('self_filed_reports')
      .insert({
        user_id: args.userId,
        lawsuit_id: settlement.id,
        claim_id: claim.id,
        confirmation_number: number,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .maybeSingle();
    if (error || !data) {
      console.error('[self-filed] report insert failed', { code: error?.code });
      return replyError('Could not save that just now.', 500);
    }
    reportRow = data as Record<string, unknown>;
    created = true;
  }

  return {
    ok: true,
    claim,
    report: toSelfFiledReportView({
      id: String(reportRow.id),
      lawsuit_id: String(reportRow.lawsuit_id),
      claim_id: String(reportRow.claim_id),
      confirmation_storage_path: (reportRow.confirmation_storage_path as string | null) ?? null,
      confirmation_mime: (reportRow.confirmation_mime as string | null) ?? null,
      confirmation_bytes: (reportRow.confirmation_bytes as number | null) ?? null,
    }),
    created,
  };
}

type ReportOwner = {
  id: string;
  user_id: string;
  confirmation_storage_path: string | null;
};

async function loadOwnedReport(
  svc: ReturnType<typeof createServiceClient>,
  userId: string,
  reportId: string,
): Promise<{ ok: true; row: ReportOwner } | { ok: false; error: string; status: number }> {
  if (!UUID_RE.test(reportId)) return { ok: false, error: "We couldn't find that report.", status: 404 };
  const { data, error } = await svc
    .from('self_filed_reports')
    .select('id, user_id, confirmation_storage_path')
    .eq('id', reportId)
    .maybeSingle();
  if (error) {
    console.error('[self-filed] report read failed', { code: error.code });
    return { ok: false, error: 'Something went wrong. Please try again.', status: 500 };
  }
  if (!data || (data as ReportOwner).user_id !== userId) {
    return { ok: false, error: "We couldn't find that report.", status: 404 };
  }
  return { ok: true, row: data as ReportOwner };
}

export async function createSelfFiledScreenshotSlot(args: {
  userId: string;
  reportId: string;
  mime: unknown;
  bytes: unknown;
}): Promise<
  | { ok: true; report: SelfFiledReportView; upload: { signed_url: string; path: string } }
  | { ok: false; error: string; status: number }
> {
  if (!flags.selfFiledReport()) return { ok: false, error: 'Not found.', status: 404 };
  const mime = parseSelfFiledMime(args.mime);
  if (!mime.ok) return { ok: false, error: mime.error, status: 400 };
  const size = parseSelfFiledBytes(args.bytes);
  if (!size.ok) return { ok: false, error: size.error, status: 400 };

  const svc = createServiceClient();
  const owned = await loadOwnedReport(svc, args.userId, args.reportId);
  if (!owned.ok) return owned;

  const path = selfFiledStoragePath(args.userId, owned.row.id, mime.mime);
  if (owned.row.confirmation_storage_path && owned.row.confirmation_storage_path.startsWith(`${args.userId}/`)) {
    const { error: removeError } = await svc.storage
      .from(SELF_FILED_CONFIRMATIONS_BUCKET)
      .remove([owned.row.confirmation_storage_path]);
    if (removeError) console.error('[self-filed] previous screenshot not removed', { name: removeError.name });
  }

  const signed = await svc.storage
    .from(SELF_FILED_CONFIRMATIONS_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
  if (signed.error || !signed.data?.signedUrl) {
    console.error('[self-filed] signed upload url failed', { name: signed.error?.name });
    return { ok: false, error: 'Could not start that upload just now.', status: 500 };
  }

  const { data, error } = await svc
    .from('self_filed_reports')
    .update({
      confirmation_storage_path: path,
      confirmation_mime: mime.mime,
      confirmation_bytes: size.bytes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', owned.row.id)
    .eq('user_id', args.userId)
    .select('id, lawsuit_id, claim_id, confirmation_storage_path, confirmation_mime, confirmation_bytes')
    .maybeSingle();
  if (error || !data) {
    console.error('[self-filed] screenshot row update failed', { code: error?.code });
    return { ok: false, error: 'Could not save that just now.', status: 500 };
  }

  return {
    ok: true,
    report: toSelfFiledReportView(data as Parameters<typeof toSelfFiledReportView>[0]),
    upload: { signed_url: signed.data.signedUrl, path },
  };
}

export async function deleteSelfFiledScreenshot(args: {
  userId: string;
  reportId: string;
}): Promise<{ ok: true; report: SelfFiledReportView } | { ok: false; error: string; status: number }> {
  if (!flags.selfFiledReport()) return { ok: false, error: 'Not found.', status: 404 };
  const svc = createServiceClient();
  const owned = await loadOwnedReport(svc, args.userId, args.reportId);
  if (!owned.ok) return owned;

  const previous = owned.row.confirmation_storage_path;
  if (previous && previous.startsWith(`${args.userId}/`)) {
    const { error: removeError } = await svc.storage.from(SELF_FILED_CONFIRMATIONS_BUCKET).remove([previous]);
    if (removeError) console.error('[self-filed] screenshot file not removed', { name: removeError.name });
  }

  const { data, error } = await svc
    .from('self_filed_reports')
    .update({
      confirmation_storage_path: null,
      confirmation_mime: null,
      confirmation_bytes: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', owned.row.id)
    .eq('user_id', args.userId)
    .select('id, lawsuit_id, claim_id, confirmation_storage_path, confirmation_mime, confirmation_bytes')
    .maybeSingle();
  if (error || !data) {
    console.error('[self-filed] screenshot clear failed', { code: error?.code });
    return { ok: false, error: 'Could not remove that just now.', status: 500 };
  }
  return { ok: true, report: toSelfFiledReportView(data as Parameters<typeof toSelfFiledReportView>[0]) };
}

