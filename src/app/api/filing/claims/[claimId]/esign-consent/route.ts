import { recordEsignConsent, withdrawEsignConsent } from '@/lib/filing/v2/consent-actions';
import { EsignConsentRequestSchema } from '@/lib/filing/v2/contract';
import { beginFilingRoute, claimIdParam, fail, parseJsonBody } from '@/lib/filing/v2/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ claimId: string }> };

/** POST .../esign-consent { accepted: true, text_version }: E-SIGN consent, once per text version. */
export async function POST(req: Request, { params }: Params) {
  const begin = await beginFilingRoute(req, 'action', { json: true });
  if (!begin.ok) return begin.response;
  const claimId = await claimIdParam(params);
  if (!claimId) return fail('not_found');
  const body = await parseJsonBody(req, EsignConsentRequestSchema);
  if (!body.ok) return body.response;
  return recordEsignConsent({ caller: begin.caller, req, claimId, textVersion: body.data.text_version });
}

/** DELETE .../esign-consent: withdraws it. Signatures already made stand; no new one until consent is given again. */
export async function DELETE(req: Request, { params }: Params) {
  const begin = await beginFilingRoute(req, 'action');
  if (!begin.ok) return begin.response;
  const claimId = await claimIdParam(params);
  if (!claimId) return fail('not_found');
  return withdrawEsignConsent({ caller: begin.caller, claimId });
}
