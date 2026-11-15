/**
 * What a policy approval must show the law firm checked (go-live checklist
 * item 12, docs/legal/signoff-checklist.md). Pure; the approve route refuses
 * an approval that misses one (422 spec_invalid with these fields).
 *
 *  - administrator_email: the claims address was verified at its source, so
 *    the channel's published_at_url is among the documents reviewed (the
 *    policy's sources or the approval's own list).
 *  - administrator_bulk and administrator_api: a written agreement with the
 *    administrator is on file, a reviewed source of kind administrator_letter.
 *
 * Only enabled channels count; a disabled channel may be drafted freely.
 */
import type { FilingPolicyContent, SourceReviewed } from './contract-spec';

export interface ApprovalProblem {
  path: string;
  message: string;
}

function sameUrl(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  try {
    const left = new URL(a);
    const right = new URL(b);
    const norm = (u: URL) => `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`;
    return norm(left) === norm(right);
  } catch {
    return false;
  }
}

export function policyApprovalProblems(
  content: Pick<FilingPolicyContent, 'channels' | 'sources_reviewed'>,
  documentsReviewed: readonly Pick<SourceReviewed, 'kind' | 'url'>[],
): ApprovalProblem[] {
  const reviewed = [...content.sources_reviewed, ...documentsReviewed];
  const problems: ApprovalProblem[] = [];
  content.channels.forEach((channel, index) => {
    if (!channel.enabled) return;
    if (channel.type === 'administrator_email') {
      if (!reviewed.some((doc) => sameUrl(doc.url, channel.published_at_url))) {
        problems.push({
          path: `channels.${index}.published_at_url`,
          message:
            'Verify the claims address at its source: list the page that publishes it (published_at_url) among the documents reviewed.',
        });
      }
    }
    if (channel.type === 'administrator_bulk' || channel.type === 'administrator_api') {
      if (!reviewed.some((doc) => doc.kind === 'administrator_letter')) {
        problems.push({
          path: `channels.${index}`,
          message: 'Bulk and API filing need a written agreement with the administrator: list it as an administrator letter.',
        });
      }
    }
  });
  return problems;
}
