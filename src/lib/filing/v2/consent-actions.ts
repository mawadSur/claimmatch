/**
 * E-SIGN consent (POST and DELETE .../esign-consent): recorded once per text
 * version with the exact text, its SHA-256, the IP and user agent; withdrawn
 * in one step (signatures already made stand; no new one until the member
 * consents again). Server only.
 */
import { createServiceClient } from '@/lib/supabase/server';
import { requestIpForRecord } from '@/lib/staff-roles';
import { loadClaimContext } from './claim-context';
import { openForClaimsNow } from './environment';
import { ESIGN_TEXT_VERSION, esignText, esignTextSha256 } from './esign';
import { fail, logFilingError, reply, requestUserAgent, type FilingCaller } from './http';
import { CONSENT_COLUMNS, toConsentRecord, type ConsentRecord } from './records';

function consentBody(consent: ConsentRecord) {
  return {
    consent: {
      id: consent.id,
      text_version: consent.text_version,
      consented_at: consent.consented_at,
      withdrawn_at: consent.withdrawn_at,
    },
  };
}

async function activeConsent(userId: string, version: string): Promise<ConsentRecord | null | 'error'> {
  const { data, error } = await createServiceClient()
    .from('esign_consents')
    .select(CONSENT_COLUMNS)
    .eq('user_id', userId)
    .eq('text_version', version)
    .is('withdrawn_at', null)
    .maybeSingle();
  if (error) return 'error';
  return data ? toConsentRecord(data as Record<string, unknown>) : null;
}

export async function recordEsignConsent(args: {
  caller: FilingCaller;
  req: Request;
  claimId: string;
  textVersion: string;
}): Promise<Response> {
  const { caller, req, claimId } = args;
  const loaded = await loadClaimContext({ supabase: caller.supabase, userId: caller.user.id, claimId, now: new Date() });
  if (!loaded.ok) return fail(loaded.code);
  const ctx = loaded.ctx;
  if (!openForClaimsNow(ctx.env, ctx.env.approvedSpec?.content ?? null, ctx.now)) return fail('settlement_closed');
  const text = esignText(args.textVersion);
  if (args.textVersion !== ESIGN_TEXT_VERSION || !text) {
    return fail('invalid_request', {
      fields: [{ path: 'text_version', message: 'The consent text changed. Read the current text, then agree to it.' }],
    });
  }
  const existing = ctx.consents.find((c) => c.text_version === ESIGN_TEXT_VERSION && c.withdrawn_at === null);
  if (existing) return reply(consentBody(existing));

  const { data, error } = await createServiceClient()
    .from('esign_consents')
    .insert({
      user_id: caller.user.id,
      text_version: ESIGN_TEXT_VERSION,
      full_text: text,
      text_sha256: esignTextSha256(text),
      context_claim_id: claimId,
      ip: requestIpForRecord(req),
      user_agent: requestUserAgent(req),
    })
    .select(CONSENT_COLUMNS)
    .maybeSingle();
  if (error?.code === '23505') {
    // A concurrent consent of this version won: answer with it.
    const current = await activeConsent(caller.user.id, ESIGN_TEXT_VERSION);
    return current && current !== 'error' ? reply(consentBody(current)) : fail('service_unavailable');
  }
  const consent = data ? toConsentRecord(data as Record<string, unknown>) : null;
  if (error || !consent) {
    logFilingError('e-sign consent write failed', error);
    return fail('service_unavailable');
  }
  return reply(consentBody(consent), 201);
}

export async function withdrawEsignConsent(args: { caller: FilingCaller; claimId: string }): Promise<Response> {
  const { caller, claimId } = args;
  const now = new Date();
  const loaded = await loadClaimContext({ supabase: caller.supabase, userId: caller.user.id, claimId, now });
  if (!loaded.ok) return fail(loaded.code);
  if (loaded.ctx.consents.length === 0) return fail('not_found');
  const { data, error } = await createServiceClient()
    .from('esign_consents')
    .update({ withdrawn_at: now.toISOString() })
    .eq('user_id', caller.user.id)
    .is('withdrawn_at', null)
    .select(CONSENT_COLUMNS);
  if (error) {
    logFilingError('e-sign consent withdrawal failed', error);
    return fail('service_unavailable');
  }
  const withdrawn = (Array.isArray(data) ? (data as Record<string, unknown>[]) : [])
    .map(toConsentRecord)
    .filter((c): c is ConsentRecord => c !== null);
  const shown = withdrawn.find((c) => c.text_version === ESIGN_TEXT_VERSION) ?? withdrawn[0];
  if (!shown) return fail('not_found');
  return reply(consentBody(shown));
}
