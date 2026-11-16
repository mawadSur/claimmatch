/**
 * The sandbox for one-click test mode (ONE_CLICK_FILING_TEST_MODE,
 * src/lib/filing/one-click-access.ts). Pure except for reading the env.
 *
 *   - A test job (claim_filing_jobs.is_test, 0046) is always sandboxed, also
 *     after one-click goes live: administrator_email goes only to
 *     ONE_CLICK_TEST_INBOX with a "[TEST]" subject (no inbox: nothing is sent
 *     and the job needs attention), the member's copy only to an
 *     INTERNAL_EMAILS tester, and administrator_api never calls out.
 *   - In test mode a real job is never sent anywhere: it goes back to the
 *     queue untouched (the cron also refuses to run while real one-click rows
 *     exist, see testModePreflight in ./cron.ts).
 */
import { isInternalEmail } from '@/lib/internal-users';
import { oneClickTestMode } from '../one-click-access';
import type { AgentChannel } from '../v2/contract-spec';
import { isPlainAddress } from './support';
import type { ChannelSubmitInput, ChannelSubmitResult, FilingJobRecord } from './types';

export const TEST_SUBJECT_PREFIX = '[TEST]';

/** ONE_CLICK_TEST_INBOX as one plain address, or null when unset or not an address. */
export function testInbox(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (env.ONE_CLICK_TEST_INBOX ?? '').trim().toLowerCase();
  return raw && isPlainAddress(raw) ? raw : null;
}

/**
 * The job as the sandbox must treat it: a test job (0046), or a job for a
 * packet made in test mode (claim_packets.is_test, 0047), or one whose packet
 * mark is unknown, is a test item. A test item never reaches a real
 * administrator, whatever the mode (the database also refuses a real job for
 * a test packet).
 */
export function testItem(
  job: Pick<FilingJobRecord, 'is_test'>,
  packet: { is_test?: boolean | null } | null | undefined,
): Pick<FilingJobRecord, 'is_test'> {
  return { is_test: job.is_test === true || packet?.is_test !== false };
}

export type SandboxDecision =
  | { kind: 'real' }
  | { kind: 'sandboxed'; sandbox: NonNullable<ChannelSubmitInput['sandbox']> }
  | { kind: 'refused'; result: ChannelSubmitResult };

/** What the worker may do with this job: send it for real, send it sandboxed, or not at all. */
export function sandboxFor(
  job: Pick<FilingJobRecord, 'is_test'>,
  channel: AgentChannel,
  /** Read only for a sandboxed send: may the member's copy go to them (an internal tester)? */
  memberEmail: () => string | null | undefined,
): SandboxDecision {
  const testJob = job.is_test === true;
  if (!testJob && !oneClickTestMode()) return { kind: 'real' };
  if (!testJob) {
    // Test mode never sends a real member's claim: nothing left our side, so it waits in the queue.
    return { kind: 'refused', result: { status: 'not_sent', reason_code: 'test_mode_real_job_held', retry_safe: true } };
  }
  if (channel === 'administrator_api') {
    return { kind: 'refused', result: { status: 'needs_attention', reason_code: 'test_mode_no_api', detail: null } };
  }
  const inbox = testInbox();
  if (!inbox) {
    return { kind: 'refused', result: { status: 'needs_attention', reason_code: 'test_inbox_missing', detail: null } };
  }
  return { kind: 'sandboxed', sandbox: { inbox, memberCopy: isInternalEmail(memberEmail()) } };
}

/** A member notice in test mode goes only to an INTERNAL_EMAILS tester, with the test prefix. */
export function noticeAllowed(to: string): { send: boolean; subjectPrefix: string | null } {
  if (!oneClickTestMode()) return { send: true, subjectPrefix: null };
  return { send: isInternalEmail(to), subjectPrefix: TEST_SUBJECT_PREFIX };
}
