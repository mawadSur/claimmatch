/**
 * administrator_api: wraps the administrator adapter registry
 * (src/lib/administrators/adapters.ts). No live adapter exists, so
 * supports() answers channel_config_invalid and chooseLane never picks this
 * channel; a job that still reaches the worker goes to needs_attention.
 *
 * Never retried automatically: once an adapter request may have left our
 * servers, the outcome is filed, rejected or needs_attention.
 */
import { getAdministratorAdapter, UnsupportedAdministratorAdapter } from '@/lib/administrators/adapters';
import { AdministratorApiConfigSchema } from '../v2/contract-spec';
import type { ChannelSubmitInput, ChannelSubmitResult } from './types';

export async function submitAdministratorApi(input: ChannelSubmitInput<'administrator_api'>): Promise<ChannelSubmitResult> {
  const config = AdministratorApiConfigSchema.safeParse(input.config);
  if (!config.success) return { status: 'needs_attention', reason_code: 'channel_config_invalid', detail: null };
  const adapter = getAdministratorAdapter(config.data.adapter);
  if (adapter instanceof UnsupportedAdministratorAdapter) {
    // Nothing was sent, but the claim can never go through this channel: a person decides.
    return { status: 'needs_attention', reason_code: 'adapter_unsupported', detail: config.data.adapter };
  }
  const { member } = input.packet;
  const at = input.now.toISOString();
  try {
    const result = await adapter.submit({
      administratorSlug: config.data.adapter,
      lawsuitId: input.settlement.id,
      claimUrl: input.spec.content.official_form.url,
      profile: {
        full_name: member.legal_name,
        email: member.email,
        phone: member.phone,
        state: member.address.state,
        zip: member.address.zip,
        address_line1: member.address.line1,
        city: member.address.city,
      },
      formData: {
        idempotency_key: input.job.idempotency_key,
        answers: input.packet.answers,
        benefit_tier: input.packet.benefit_tier,
        payout_method: input.packet.payout_method,
        signature: {
          typed_name: input.signature.typed_name,
          signed_at: input.signature.signed_at,
          packet_hash: input.signature.packet_hash,
        },
      },
    });
    if (result.status === 'accepted') {
      return {
        status: 'filed',
        confirmation_number: result.administratorClaimId || null,
        evidence: [{ kind: 'api', adapter: config.data.adapter, request_id: null, response_code: 'accepted', at }],
        result: { channel: 'administrator_api', adapter: config.data.adapter },
      };
    }
    if (result.status === 'rejected') {
      return {
        status: 'rejected',
        reason_code: 'not_accepted',
        detail: result.error.slice(0, 500),
        evidence: [{ kind: 'api', adapter: config.data.adapter, request_id: null, response_code: 'rejected', at }],
      };
    }
    return { status: 'needs_attention', reason_code: 'adapter_unsupported', detail: config.data.adapter };
  } catch (err) {
    // The request may have reached the administrator: never sent again automatically.
    return { status: 'needs_attention', reason_code: 'adapter_error', detail: (err as Error)?.name ?? null };
  }
}
