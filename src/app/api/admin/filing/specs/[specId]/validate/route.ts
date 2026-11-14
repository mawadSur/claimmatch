import { z } from 'zod';
import { canDraftFilingConfig } from '@/lib/staff-roles';
import { createServiceClient } from '@/lib/supabase/server';
import { checkSpec } from '../../../_lib/config';
import { fail, guard, readBody, reply, routeId } from '../../../_lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Optional: the editor's current, possibly unsaved content. Without it the stored content is checked. */
const Body = z.object({ content: z.unknown().optional() }).strict();

/**
 * POST /api/admin/filing/specs/{specId}/validate: the schema and every Jev
 * check (checkSpec) on the content the console sends, which may hold unsaved
 * edits, or on the stored spec when no content is sent. Nothing is stored;
 * saving and approving run the same checks again.
 */
export async function POST(req: Request, { params }: { params: Promise<{ specId: string }> }) {
  const auth = await guard(req, canDraftFilingConfig);
  if (!auth.ok) return auth.res;
  const id = await routeId(params, 'specId');
  if (!id.ok) return id.res;
  const body = await readBody(req, Body, { allowEmpty: true });
  if (!body.ok) return body.res;
  const { data } = await createServiceClient().from('filing_specs').select('content').eq('id', id.id).maybeSingle();
  if (!data) return fail('not_found');
  const checked = checkSpec(body.data.content !== undefined ? body.data.content : data.content);
  return reply({ ok: checked.ok, errors: checked.ok ? [] : checked.fields });
}
