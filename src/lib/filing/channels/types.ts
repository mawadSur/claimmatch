/**
 * One-click filing: submission channels "on our side". CONTRACT (read-only
 * for builders). Implementations live in src/lib/filing/channels/** (B3) and
 * are picked by getChannelAdapter (./index.ts).
 *
 * Hard lines every adapter keeps (docs/designs/one-click-filing.md, section 1):
 *   - nothing fills, submits, scrapes, embeds or proxies an official claim
 *     site from our servers or a hosted browser;
 *   - any CAPTCHA, emailed or texted code, or identity check is a hard stop,
 *     never solved, relayed or handed to a person to solve;
 *   - no automatic retry after a submission may have happened: an unsure
 *     outcome is needs_attention, and a person decides;
 *   - payout always goes to the member; no bank or payout account numbers.
 */
import type { CanonicalPacket, JobStatus, Lane } from '../v2/contract';
import type { AgentChannel, ChannelConfigFor, FilingSpecContent } from '../v2/contract-spec';

/** worker: the cron submits (administrator_email, administrator_api). staff: people do (filing_desk, administrator_bulk). */
export type ChannelMode = 'worker' | 'staff';

/** What a filing leaves behind (claim_filing_jobs.evidence, appended). Never secrets or full packet copies. */
export type FilingEvidence =
  | { kind: 'screenshot'; document_id: string; sha256: string; captured_at: string }
  | {
      kind: 'email';
      provider: 'resend';
      provider_message_id: string;
      to: string;
      sent_at: string;
      body_sha256: string;
      attachment_sha256s: string[];
    }
  | { kind: 'bulk_export'; batch_id: string; row_number: number; file_sha256: string; exported_at: string }
  | { kind: 'administrator_response'; received_at: string; summary: string }
  | { kind: 'api'; adapter: string; request_id: string | null; response_code: string | null; at: string };

/** A claim_filing_jobs row as the server reads it. */
export interface FilingJobRecord {
  id: string;
  claim_id: string;
  user_id: string;
  lawsuit_id: string;
  packet_id: string;
  signature_id: string;
  packet_hash: string;
  policy_id: string | null;
  spec_id: string;
  channel: AgentChannel;
  status: JobStatus;
  idempotency_key: string;
  attempt: number;
  run_after: string;
  due_by: string | null;
  locked_at: string | null;
  lock_owner: string | null;
  lock_expires_at: string | null;
  export_batch_id: string | null;
  confirmation_number: string | null;
  result: Record<string, unknown>;
  evidence: FilingEvidence[];
  needs_attention_reason: string | null;
  closed_reason: string | null;
  filed_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The member's e-signature block, as sent with a claim (typed name, time, packet hash). */
export interface SignatureBlock {
  signature_id: string;
  typed_name: string;
  signed_at: string;
  packet_hash: string;
  statement_text: string;
  authorization_text_version: string;
  lane: Lane;
}

/**
 * A stored member document a worker channel may attach. Bytes are read by the
 * caller, never by URL from the official side. Whoever reads them (email
 * attachment, desk download) re-hashes them first: bytes whose SHA-256 differs
 * from the signed packet's are never sent or shown (job needs_attention).
 */
export interface ChannelDocument {
  id: string;
  kind: string;
  official_label: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  /** Loaded lazily, only when the channel attaches documents. */
  read: () => Promise<Uint8Array>;
}

export interface ChannelSubmitInput<C extends AgentChannel = AgentChannel> {
  job: FilingJobRecord;
  config: ChannelConfigFor<C>;
  spec: { id: string; version: number; content: FilingSpecContent };
  /** The signed packet (parsed from claim_signatures.packet_canonical and checked against its hash). */
  packet: CanonicalPacket;
  signature: SignatureBlock;
  documents: ChannelDocument[];
  settlement: { id: string; title: string; deadline: string | null };
  now: Date;
}

/**
 * The outcome of one submission attempt. Map to filing_job_finish (0040):
 *   filed           -> job filed; claim submitted (with the number) or filed_by_claimmatch
 *   rejected        -> job rejected; claim filing_rejected
 *   needs_attention -> job needs_attention; claim stays filing; a person looks
 *   not_sent        -> nothing left our side: job queued again (reason not_submitted)
 *                      only when `retry_safe`, otherwise needs_attention
 */
export type ChannelSubmitResult =
  | { status: 'filed'; confirmation_number: string | null; evidence: FilingEvidence[]; result: Record<string, unknown> }
  | { status: 'rejected'; reason_code: string; detail: string | null; evidence: FilingEvidence[] }
  | { status: 'needs_attention'; reason_code: string; detail: string | null }
  | { status: 'not_sent'; reason_code: string; retry_safe: boolean };

/** Why a channel cannot take this claim (chooseLane records it as a LaneReasonCode). */
export type ChannelSupport =
  | { ok: true }
  | { ok: false; reason: 'channel_config_invalid' | 'channel_cannot_carry_documents' | 'form_has_challenge' | 'email_not_configured' };

export interface ChannelAdapter<C extends AgentChannel = AgentChannel> {
  readonly channel: C;
  readonly mode: ChannelMode;
  /** Can this channel take a claim like this (config complete, documents carried, no known challenge)? Pure. */
  supports(input: { config: ChannelConfigFor<C>; spec: FilingSpecContent; needsDocuments: boolean }): ChannelSupport;
  /**
   * worker channels only. Must be idempotent on job.idempotency_key (pass it
   * to the provider, e.g. Resend's idempotencyKey) and must return
   * needs_attention, never not_sent with retry_safe, once a request may have
   * reached the administrator.
   */
  submit?(input: ChannelSubmitInput<C>): Promise<ChannelSubmitResult>;
}
