/**
 * Public contact details shown on the legal pages, the footer and Settings.
 *
 * Each value comes from an env var and is null when the var is unset, blank or
 * still a template placeholder, so pages render nothing instead of
 * "{CONTACT_EMAIL}" or an address on a domain nobody reads. Never hard-code a
 * fallback address here.
 *
 * NEXT_PUBLIC_ values are fixed when the site is built: after setting one in
 * Vercel, redeploy for it to appear.
 */
// The same rules next.config.mjs uses to refuse a production build without a
// working contact inbox.
import { cleanContactValue as clean, deliverableContactEmail } from './contact-email.mjs';

export interface LegalContact {
  /** Inbox that receives privacy, legal and data requests. */
  email: string | null;
  /** Legal name of the business that runs ClaimMatch. */
  legalEntity: string | null;
  /** Mailing address. May span several lines. */
  postalAddress: string | null;
}

export function normalizeLegalContact(raw: {
  email?: string | null;
  legalEntity?: string | null;
  postalAddress?: string | null;
}): LegalContact {
  const postal = clean(raw.postalAddress);
  return {
    email: deliverableContactEmail(raw.email),
    legalEntity: clean(raw.legalEntity),
    // Env values cannot hold real newlines everywhere, so accept a literal "\n".
    postalAddress: postal ? postal.replace(/\\n/g, '\n') : null,
  };
}

/** Read the contact details from the environment. */
export function legalContact(): LegalContact {
  // Each var is referenced literally so Next.js can inline it at build time.
  return normalizeLegalContact({
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL,
    legalEntity: process.env.NEXT_PUBLIC_LEGAL_ENTITY,
    postalAddress: process.env.NEXT_PUBLIC_POSTAL_ADDRESS,
  });
}
