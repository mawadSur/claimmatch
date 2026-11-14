/**
 * The member's document routes: an upload slot (POST .../documents),
 * completing it (POST .../documents/{id}/complete), a 5-minute download link
 * to their own file (GET .../documents/{id}) and removal before signing
 * (DELETE .../documents/{id}). Only while the packet is open and the
 * settlement takes claims; a health-flagged kind only after health consent.
 * Server only.
 */
import { createServiceClient } from '@/lib/supabase/server';
import { contentOf, currentPacketState, loadClaimContext, type ClaimContext } from './claim-context';
import {
  CLAIM_DOCUMENTS_BUCKET,
  DOWNLOAD_URL_TTL_SECONDS,
  MAX_DOCUMENTS_PER_CLAIM,
  type FilingErrorCode,
} from './contract';
import type { DocumentMime } from './contract-spec';
import { toDocumentView, type DocumentRecord } from './documents';
import { completeUpload, createUploadSlot, removeMemberDocuments } from './documents-store';
import { openForClaimsNow } from './environment';
import { fail, logFilingError, reply, type FilingCaller } from './http';
import { tierProofs } from './packet-items';
import { savePacket } from './persist';

const EDITABLE = new Set(['preparing', 'ready', 'needs_you', 'self_file']);

/** Why the packet cannot take document changes now, or null when it can. */
function lockedReason(ctx: ClaimContext): FilingErrorCode | null {
  if (ctx.claim.status === 'filing') return 'filing_in_progress';
  if (!ctx.packet) return 'invalid_transition';
  if (ctx.packet.status !== 'open') return 'packet_locked';
  if (!EDITABLE.has(ctx.claim.status)) return 'invalid_transition';
  if (!openForClaimsNow(ctx.env, ctx.env.approvedSpec?.content ?? null, ctx.now)) return 'settlement_closed';
  return null;
}

async function load(caller: FilingCaller, claimId: string) {
  return loadClaimContext({ supabase: caller.supabase, userId: caller.user.id, claimId, now: new Date() });
}

/** Re-saves the packet after its documents changed (the canonical packet and hash change with them). */
async function resave(ctx: ClaimContext, documents: DocumentRecord[], kind: string): Promise<void> {
  if (!ctx.packet || ctx.packet.status !== 'open') return;
  const saved = await savePacket({
    ctx,
    packet: ctx.packet,
    content: contentOf(ctx.packet),
    spec: ctx.packetSpec,
    documents,
    changedPaths: [`documents.${kind}`],
    detail: { action: 'documents_changed' },
  });
  if (!saved.ok) logFilingError('packet resave after a document change failed', { code: saved.code });
}

export async function createDocumentSlot(args: {
  caller: FilingCaller;
  claimId: string;
  body: { kind: string; mime: DocumentMime; size_bytes: number };
}): Promise<Response> {
  const loaded = await load(args.caller, args.claimId);
  if (!loaded.ok) return fail(loaded.code);
  const ctx = loaded.ctx;
  const locked = lockedReason(ctx);
  if (locked) return fail(locked);
  const state = currentPacketState(ctx);
  const proof = tierProofs(ctx.packetSpec?.content ?? null, state?.draft.benefit_tier ?? null).find((p) => p.kind === args.body.kind);
  if (!state || !proof) {
    return fail('invalid_request', { fields: [{ path: 'kind', message: 'This claim doesn’t ask for that document.' }] });
  }
  if (!proof.accepted_mime.includes(args.body.mime)) return fail('document_invalid');
  if (proof.health_flag && state.health.given !== true) {
    return fail(state.health.textAvailable ? 'health_consent_required' : 'not_collected');
  }
  const live = ctx.documents.filter((d) => d.status === 'pending_upload' || d.status === 'stored');
  if (live.length >= MAX_DOCUMENTS_PER_CLAIM || live.filter((d) => d.kind === proof.kind).length >= proof.max_files) {
    return fail('document_limit');
  }
  const slot = await createUploadSlot({
    userId: args.caller.user.id,
    claimId: ctx.claim.id,
    packetId: ctx.packet!.id,
    kind: proof.kind,
    mime: args.body.mime,
    sizeBytes: args.body.size_bytes,
    healthFlag: proof.health_flag,
    now: ctx.now,
  });
  if (!slot.ok) return fail(slot.code);
  return reply({ document: toDocumentView(slot.doc, ctx.now), upload: slot.upload }, 201);
}

function findDocument(ctx: ClaimContext, documentId: string): DocumentRecord | null {
  return ctx.documents.find((d) => d.id === documentId && d.source === 'member') ?? null;
}

export async function completeDocument(args: { caller: FilingCaller; claimId: string; documentId: string }): Promise<Response> {
  const loaded = await load(args.caller, args.claimId);
  if (!loaded.ok) return fail(loaded.code);
  const ctx = loaded.ctx;
  const doc = findDocument(ctx, args.documentId);
  if (!doc || doc.status === 'deleted') return fail('not_found');
  if (doc.status === 'stored') return reply({ document: toDocumentView(doc, ctx.now) });
  if (doc.status === 'rejected') return fail('document_invalid');
  const locked = lockedReason(ctx);
  if (locked) return fail(locked);
  const state = currentPacketState(ctx);
  const proof = tierProofs(ctx.packetSpec?.content ?? null, state?.draft.benefit_tier ?? null).find((p) => p.kind === doc.kind);
  if (doc.health_flag && state?.health.given !== true) {
    await removeMemberDocuments([doc], 'member_removed', ctx.now);
    return fail(state?.health.textAvailable ? 'health_consent_required' : 'not_collected');
  }
  const done = await completeUpload({ doc, acceptedMime: proof?.accepted_mime ?? [], now: ctx.now });
  if (!done.ok) return fail(done.code);
  await resave(ctx, ctx.documents.map((d) => (d.id === done.doc.id ? done.doc : d)), doc.kind);
  return reply({ document: toDocumentView(done.doc, ctx.now) });
}

export async function documentDownload(args: { caller: FilingCaller; claimId: string; documentId: string }): Promise<Response> {
  const loaded = await load(args.caller, args.claimId);
  if (!loaded.ok) return fail(loaded.code);
  const doc = findDocument(loaded.ctx, args.documentId);
  if (!doc || doc.status === 'deleted' || doc.status === 'rejected') return fail('not_found');
  if (doc.status !== 'stored') return fail('upload_incomplete');
  const { data, error } = await createServiceClient()
    .storage.from(CLAIM_DOCUMENTS_BUCKET)
    .createSignedUrl(doc.storage_path, DOWNLOAD_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    logFilingError('download link failed', { code: (error as { name?: string } | null)?.name ?? null });
    return fail('service_unavailable');
  }
  const expiresAt = new Date(loaded.ctx.now.getTime() + DOWNLOAD_URL_TTL_SECONDS * 1000).toISOString();
  return reply({ url: data.signedUrl, expires_at: expiresAt });
}

export async function deleteDocument(args: { caller: FilingCaller; claimId: string; documentId: string }): Promise<Response> {
  const loaded = await load(args.caller, args.claimId);
  if (!loaded.ok) return fail(loaded.code);
  const ctx = loaded.ctx;
  const doc = findDocument(ctx, args.documentId);
  if (!doc) return fail('not_found');
  if (doc.status === 'deleted') return reply({ document: toDocumentView(doc, ctx.now) });
  if (ctx.claim.status === 'filing') return fail('filing_in_progress');
  if (!ctx.packet || ctx.packet.status !== 'open') return fail('packet_locked');
  if (!(await removeMemberDocuments([doc], 'member_removed', ctx.now))) return fail('service_unavailable');
  const removed: DocumentRecord = { ...doc, status: 'deleted', deleted_at: ctx.now.toISOString() };
  if (doc.status === 'stored') await resave(ctx, ctx.documents.filter((d) => d.id !== doc.id), doc.kind);
  return reply({ document: toDocumentView(removed, ctx.now) });
}
