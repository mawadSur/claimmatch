/**
 * Lookups from the API's codes (statuses, events, lane reasons, lanes, lock
 * reasons, withdraw reasons) to the copy in ../../copy/filing.
 */
import { filing, filingEvents, filingStatus } from '@/copy/filing';

export interface StatusCopy {
  label: string;
  detail: string;
}

export const FILING_STATUS_COPY: Readonly<Record<string, StatusCopy>> = {
  preparing: { label: filingStatus.preparingLabel.text, detail: filingStatus.preparingDetail.text },
  ready: { label: filingStatus.readyLabel.text, detail: filingStatus.readyDetail.text },
  signed: { label: filingStatus.signedLabel.text, detail: filingStatus.signedDetail.text },
  queued: { label: filingStatus.queuedLabel.text, detail: filingStatus.queuedDetail.text },
  filing: { label: filingStatus.filingLabel.text, detail: filingStatus.filingDetail.text },
  filed_by_claimmatch: { label: filingStatus.filedLabel.text, detail: filingStatus.filedDetail.text },
  needs_you: { label: filingStatus.needsYouLabel.text, detail: filingStatus.needsYouDetail.text },
  filing_rejected: { label: filingStatus.rejectedLabel.text, detail: filingStatus.rejectedDetail.text },
  submitted: { label: filingStatus.submittedLabel.text, detail: filingStatus.submittedDetail.text },
  withdrawn: { label: filingStatus.withdrawnLabel.text, detail: filingStatus.withdrawnDetail.text },
  self_file: { label: filing.selfFileTitle.text, detail: filingStatus.selfFileDetail.text },
};

export const FILING_EVENT_COPY: Readonly<Record<string, string>> = {
  preparing: filingEvents.preparing.text,
  ready: filingEvents.ready.text,
  signed: filingEvents.signed.text,
  queued: filingEvents.queued.text,
  filing: filingEvents.filing.text,
  filed_by_claimmatch: filingEvents.filedByClaimmatch.text,
  submitted: filingEvents.submitted.text,
  needs_you: filingEvents.needsYou.text,
  filing_rejected: filingEvents.filingRejected.text,
  self_file: filingEvents.selfFile.text,
  reported_filed: filingEvents.reportedFiled.text,
  not_reported_filed: filingEvents.notReportedFiled.text,
  withdrawn: filingEvents.withdrawn.text,
};

export const LANE_REASON_COPY = {
  not_offered_for_settlement: filingEvents.reasonNotOffered.text,
  settlement_not_open: filingEvents.reasonNotOpen.text,
  deadline_too_close: filingEvents.reasonDeadline.text,
  state_not_covered: filingEvents.reasonState.text,
  health_consent_needed: filingEvents.reasonHealth.text,
  proof_not_supported: filingEvents.reasonProof.text,
} as const;

export const LANE_TIMING_COPY = {
  filing_desk: filingEvents.timingDesk.text,
  administrator_email: filingEvents.timingEmail.text,
  administrator_bulk: filingEvents.timingBulk.text,
  administrator_api: filingEvents.timingApi.text,
} as const;

export const LOCKED_COPY = {
  packet_signed: filing.lockedSigned.text,
  health_consent_needed: filing.lockedHealth.text,
  not_collected: filing.lockedNotCollected.text,
} as const;

export const WITHDRAW_REASON_COPY = {
  changed_mind: filing.withdrawChangedMind.text,
  filed_myself: filing.withdrawFiledMyself.text,
  not_eligible: filing.withdrawNotEligible.text,
  other: filing.withdrawOther.text,
} as const;
