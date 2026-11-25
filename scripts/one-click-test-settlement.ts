/* eslint-disable no-console */
/**
 * The one-click TEST settlement, for testing one-click filing end to end in
 * test mode (docs/PRODUCTION-RUNBOOK.md, "One-click test mode"). Clearly
 * fictional: a "[TEST]" title, an example.test claim site, no administrator.
 * Its filing policy enables only administrator_email, addressed to
 * ONE_CLICK_TEST_INBOX (and test mode sends every filing email there anyway).
 *
 * It is published, because the claim flow needs that, but every public list
 * leaves its slug out and its public page is a 404 (src/lib/test-settlements.ts);
 * only INTERNAL_EMAILS testers can open /claim/<slug>.
 *
 *   npx tsx scripts/one-click-test-settlement.ts                 dry run: print what would be written
 *   npx tsx scripts/one-click-test-settlement.ts --apply         create the settlement, spec and policy drafts
 *   ... --apply --approve-as <legal_reviewer user id>            also approve both drafts as that reviewer
 *   npx tsx scripts/one-click-test-settlement.ts --off --apply   turn it off: kill switch on, unpublished
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (to write) and
 * ONE_CLICK_TEST_INBOX. Never deletes anything: test claims stay for review.
 * tsx runs this file directly, so imports use relative paths.
 */
import { createClient } from '@supabase/supabase-js';
import { FilingPolicyContentSchema, FilingSpecContentSchema } from '../src/lib/filing/v2/contract-spec';
import { testInbox } from '../src/lib/filing/channels/test-mode';
import { ONE_CLICK_TEST_SLUG } from '../src/lib/test-settlements';

const STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC',
  'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];
const TITLE = '[TEST] Lawsuit AI one-click test settlement (not a real settlement)';
const STATEMENT = 'TEST ONLY. I am an internal Lawsuit AI tester and this is not a real claim.';
const CLASS_TEXT = 'Internal Lawsuit AI testers only. This is not a real settlement and pays nothing.';

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

export function testSettlementRows(inbox: string, today: Date = new Date()) {
  const deadline = new Date(today.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
  const lawsuit = {
    slug: ONE_CLICK_TEST_SLUG,
    title: TITLE,
    summary: 'Internal test of one-click filing. Not a real settlement.',
    description: 'Created by scripts/one-click-test-settlement.ts for one-click test mode. Nobody can be paid from it.',
    category: 'Consumer',
    status: 'open',
    review_status: 'published',
    is_test: true,
    deadline,
    claim_url: null,
    proof_required: false,
    // A strong match (structured rule) for a tester who answered "bought consumer goods" in onboarding.
    eligibility: { requires: ['bought_consumer_goods'] },
    eligibility_text: CLASS_TEXT,
  };
  const spec = FilingSpecContentSchema.parse({
    official_form: { url: 'https://claims.example.test/one-click-test', title: 'TEST claim form (fictional)' },
    class_definition: { text: CLASS_TEXT, source_url: 'https://claims.example.test/notice' },
    attestation: { text: STATEMENT },
    deadline: { date: deadline, type: 'submit_online_by' },
    member_fields: [
      { field: 'legal_name', official_label: 'Full name', required: true },
      { field: 'email', official_label: 'Email address', required: true },
      { field: 'address.line1', official_label: 'Street address', required: true },
      { field: 'address.city', official_label: 'City', required: true },
      { field: 'address.state', official_label: 'State', required: true },
      { field: 'address.zip', official_label: 'ZIP code', required: true },
    ],
    desk_notes: 'TEST settlement: never file on a real site.',
  });
  const policy = FilingPolicyContentSchema.parse({
    agent_filing: 'allowed',
    channels: [
      {
        type: 'administrator_email',
        enabled: true,
        to: inbox,
        published_at_url: 'https://claims.example.test/contact',
        subject_prefix: '[TEST]',
        attach_documents: true,
      },
    ],
    allowed_states: STATES,
    sources_reviewed: [
      { kind: 'other', title: 'One-click test mode runbook (internal test, no real administrator)', reviewed_on: today.toISOString().slice(0, 10) },
    ],
    notes: 'TEST policy for one-click test mode. The only channel is the test inbox.',
  });
  return { lawsuit, spec, policy };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const off = process.argv.includes('--off');
  const reviewer = arg('--approve-as');
  const inbox = testInbox();
  if (!inbox && !off) {
    console.error('Set ONE_CLICK_TEST_INBOX to the test inbox address first.');
    process.exit(1);
  }
  const rows = testSettlementRows(inbox ?? 'nobody@example.test');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!apply) {
    console.log(off ? 'Dry run (--off): would turn the kill switch on and unpublish' : 'Dry run: would write', ONE_CLICK_TEST_SLUG);
    if (!off) console.log(JSON.stringify(rows, null, 2));
    console.log('Add --apply to write.');
    return;
  }
  if (!url || !key) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  console.log('Target:', new URL(url).host);
  const db = createClient(url, key, { auth: { persistSession: false } });

  const existing = await db.from('lawsuits').select('id').eq('slug', ONE_CLICK_TEST_SLUG).maybeSingle();
  if (existing.error) throw new Error(`lawsuit read failed (${existing.error.code})`);

  if (off) {
    if (!existing.data) return console.log('No test settlement: nothing to turn off.');
    const id = existing.data.id as string;
    const ctl = await db
      .from('filing_controls')
      .upsert({ lawsuit_id: id, kill_switch: true, kill_switch_reason: 'One-click test finished', kill_switch_changed_at: new Date().toISOString() }, { onConflict: 'lawsuit_id' });
    if (ctl.error) throw new Error(`kill switch failed (${ctl.error.code})`);
    const unpub = await db.from('lawsuits').update({ review_status: 'draft', status: 'closed' }).eq('id', id);
    if (unpub.error) throw new Error(`unpublish failed (${unpub.error.code})`);
    return console.log('Test settlement off: kill switch on, unpublished. Nothing was deleted.');
  }

  let lawsuitId = existing.data?.id as string | undefined;
  if (!lawsuitId) {
    const made = await db.from('lawsuits').insert(rows.lawsuit).select('id').single();
    if (made.error) throw new Error(`lawsuit insert failed (${made.error.code})`);
    lawsuitId = made.data.id as string;
    console.log('Created the test settlement', lawsuitId);
  } else {
    console.log('Test settlement exists', lawsuitId);
  }

  const specs = await db.from('filing_specs').select('id, status, version').eq('lawsuit_id', lawsuitId).order('version', { ascending: false });
  if (specs.error) throw new Error(`spec read failed (${specs.error.code})`);
  let specId = specs.data.find((s) => s.status === 'draft')?.id as string | undefined;
  if (!specId && !specs.data.some((s) => s.status === 'approved')) {
    const made = await db
      .from('filing_specs')
      .insert({ lawsuit_id: lawsuitId, version: (specs.data[0]?.version ?? 0) + 1, content: rows.spec })
      .select('id')
      .single();
    if (made.error) throw new Error(`spec insert failed (${made.error.code})`);
    specId = made.data.id as string;
    console.log('Created the spec draft', specId);
  }

  const policies = await db.from('filing_policies').select('id, status, version').eq('lawsuit_id', lawsuitId).order('version', { ascending: false });
  if (policies.error) throw new Error(`policy read failed (${policies.error.code})`);
  let policyId = policies.data.find((p) => p.status === 'draft')?.id as string | undefined;
  if (!policyId && !policies.data.some((p) => p.status === 'approved')) {
    const p = rows.policy;
    const made = await db
      .from('filing_policies')
      .insert({
        lawsuit_id: lawsuitId,
        version: (policies.data[0]?.version ?? 0) + 1,
        agent_filing: p.agent_filing,
        channels: p.channels,
        agent_certification_allowed: p.agent_certification_allowed,
        allowed_states: p.allowed_states,
        health_sensitive: p.health_sensitive,
        identity_check_required: p.identity_check_required,
        sources_reviewed: p.sources_reviewed,
        notes: p.notes,
      })
      .select('id')
      .single();
    if (made.error) throw new Error(`policy insert failed (${made.error.code})`);
    policyId = made.data.id as string;
    console.log('Created the policy draft', policyId);
  }

  if (!reviewer) {
    console.log('Drafts ready. Approve both in /admin/filing/settlements/' + lawsuitId + ' as a legal_reviewer, or rerun with --approve-as <reviewer id>.');
    return;
  }
  const docs = [{ kind: 'other', title: 'One-click test mode (internal test)' }];
  for (const [fn, idName, id] of [
    ['filing_approve_spec', 'p_spec_id', specId],
    ['filing_approve_policy', 'p_policy_id', policyId],
  ] as const) {
    if (!id) continue;
    const done = await db.rpc(fn, { [idName]: id, p_reviewer_id: reviewer, p_notes: 'TEST settlement for one-click test mode.', p_documents_reviewed: docs });
    if (done.error) throw new Error(`${fn} failed (${done.error.code})`);
    console.log('Approved', fn === 'filing_approve_spec' ? 'spec' : 'policy', id);
  }
  console.log(`Ready: testers open /claim/${ONE_CLICK_TEST_SLUG}`);
}

if (process.argv[1]?.endsWith('one-click-test-settlement.ts')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
