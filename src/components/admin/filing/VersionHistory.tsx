import { History } from 'lucide-react';
import type { SourceReviewed } from '@/lib/filing/v2/contract';
import { VersionStatusBadge } from './Badges';
import { formatDateTime, formatDay, httpsUrl, staffName } from './format';
import { SOURCE_KIND_LABEL } from './labels';
import type { PolicyRecord, ReviewerNames, SpecRecord } from './types';

/** The documents a reviewer relied on, with links when public. */
export function DocumentsReviewed({ documents }: { documents: readonly SourceReviewed[] | null }) {
  if (!documents || documents.length === 0) return <p className="text-xs text-ink-muted">No documents recorded.</p>;
  return (
    <ul className="space-y-1 text-xs text-ink">
      {documents.map((doc, i) => (
        <li key={`${doc.title}-${i}`}>
          <span className="font-semibold">{SOURCE_KIND_LABEL[doc.kind]}:</span>{' '}
          {httpsUrl(doc.url) ? (
            <a href={httpsUrl(doc.url) ?? undefined} target="_blank" rel="noopener noreferrer" className="text-link">
              {doc.title}
            </a>
          ) : (
            doc.title
          )}
          {doc.document_ref ? <span className="text-ink-muted"> (file {doc.document_ref})</span> : null}
          <span className="text-ink-muted">, reviewed {formatDay(doc.reviewed_on)}</span>
          {doc.notes ? <span className="block text-ink-muted">{doc.notes}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Who approved this version, when, and on what documents. */
export function ApprovalRecord({ record, names }: { record: PolicyRecord | SpecRecord; names: ReviewerNames }) {
  if (!record.approved_at) return null;
  return (
    <div className="space-y-1 rounded-lg bg-success-50/50 p-3 text-xs">
      <p className="text-ink">
        Approved by <span className="font-semibold">{staffName(record.approved_by, names)}</span> on{' '}
        {formatDateTime(record.approved_at)}
      </p>
      {record.approval_notes ? <p className="whitespace-pre-wrap text-ink-muted">{record.approval_notes}</p> : null}
      <DocumentsReviewed documents={record.documents_reviewed} />
    </div>
  );
}

function isPolicy(record: PolicyRecord | SpecRecord): record is PolicyRecord {
  return 'rejection_notes' in record;
}

export function VersionHistory({
  records,
  names,
}: {
  records: ReadonlyArray<PolicyRecord | SpecRecord>;
  names: ReviewerNames;
}) {
  const sorted = [...records].sort((a, b) => b.version - a.version);
  return (
    <details className="rounded-xl border border-gray-100 bg-white p-3">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
        <History className="h-4 w-4" aria-hidden /> Version history ({sorted.length})
      </summary>
      {sorted.length === 0 ? <p className="mt-2 text-xs text-ink-muted">No versions yet.</p> : null}
      <ol className="mt-3 space-y-3">
        {sorted.map((record) => (
          <li key={record.id} className="rounded-lg border border-gray-100 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold text-ink">Version {record.version}</span>
              <VersionStatusBadge status={record.status} />
              <span className="text-xs text-ink-muted">
                Drafted by {staffName(record.created_by, names)} on {formatDateTime(record.created_at)}; last change{' '}
                {formatDateTime(record.updated_at)}
              </span>
            </div>
            <div className="mt-2 space-y-2">
              <ApprovalRecord record={record} names={names} />
              {isPolicy(record) && record.rejected_at ? (
                <p className="text-xs text-danger-700">
                  Rejected by {staffName(record.rejected_by, names)} on {formatDateTime(record.rejected_at)}
                  {record.rejection_notes ? `: ${record.rejection_notes}` : ''}
                </p>
              ) : null}
              {!isPolicy(record) && record.retired_at ? (
                <p className="text-xs text-ink-muted">
                  Retired on {formatDateTime(record.retired_at)}
                  {record.retire_reason ? `: ${record.retire_reason}` : ''}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
