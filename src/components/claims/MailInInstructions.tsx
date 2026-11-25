import { MAIL_IN_STEPS, type ClaimActionDetails } from '@/lib/claim-actions';
import type { ClaimProfile } from '@/lib/claim-profile';
import { currentAddressOf } from '@/lib/claim-profile';
import { PAYOUT_PREFERENCE_LABELS } from '@/lib/claim-profile';

export function MailInInstructions({
  title,
  details,
  deadline,
  profile,
}: {
  title: string;
  details: ClaimActionDetails;
  deadline: string | null;
  profile: ClaimProfile | null;
}) {
  const current = profile ? currentAddressOf(profile) : null;
  return (
    <section id="mail-in" className="scroll-mt-24 space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
      <h2 className="text-lg font-bold">Print, sign and mail this claim</h2>
      <p className="text-sm text-ink-muted">
        {title}. Fill the official form from the summary below. Do not invent facts.
        {details.notes ? ` ${details.notes}` : ''}
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        {MAIL_IN_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {details.form_url && (
          <div>
            <dt className="font-semibold">Claim form</dt>
            <dd>
              <a href={details.form_url} className="text-brand-700 underline" target="_blank" rel="noopener noreferrer">
                Download the official form
              </a>
            </dd>
          </div>
        )}
        {details.mail_to && (
          <div>
            <dt className="font-semibold">Mail to</dt>
            <dd className="whitespace-pre-line">{details.mail_to}</dd>
          </div>
        )}
        {deadline && (
          <div>
            <dt className="font-semibold">Deadline</dt>
            <dd>
              {deadline}
              {details.postmark ? ' (postmark)' : details.received_by ? ' (must be received by)' : ''}
            </dd>
          </div>
        )}
        {details.proof && (
          <div className="sm:col-span-2">
            <dt className="font-semibold">Required proof</dt>
            <dd>{details.proof}</dd>
          </div>
        )}
      </dl>
      {profile && (
        <div className="rounded-xl bg-brand-50 p-4">
          <h3 className="font-bold">Printable profile summary</h3>
          <p className="mt-1 text-xs text-ink-muted">Copy these lines onto the form. Check every line against the notice.</p>
          <pre className="mt-3 whitespace-pre-wrap text-sm">
            {`Legal name: ${profile.legal_name ?? ''}
Other names: ${profile.aliases ?? ''}
Email: ${profile.email ?? ''}
Phone: ${profile.phone ?? ''}
Address: ${current ? `${current.line1}${current.line2 ? `, ${current.line2}` : ''}, ${current.city}, ${current.state} ${current.zip}` : ''}
Payment preference (method name only): ${profile.payout_preference ? PAYOUT_PREFERENCE_LABELS[profile.payout_preference] : ''}
VIN: ${profile.vehicle_vin ?? ''}
Account emails: ${profile.account_emails.join(', ')}`}
          </pre>
        </div>
      )}
    </section>
  );
}
