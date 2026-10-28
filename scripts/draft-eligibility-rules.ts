/**
 * Draft structured eligibility rules for open settlements with a future
 * deadline. Writes pending rows to eligibility_rule_drafts only.
 * Never publishes onto lawsuits.eligibility.
 *
 *   CLAIMMATCH_ENV=local ELIGIBILITY_DRAFTS_ENABLED=1 npm run draft-eligibility
 */
import { persistEligibilityDrafts } from '../src/lib/eligibility-drafts-store';

async function main() {
  const env = process.env.CLAIMMATCH_ENV;
  if (env !== 'local' && env !== 'staging') {
    console.error('Refusing to run: set CLAIMMATCH_ENV=local or staging.');
    process.exit(1);
  }
  if (process.env.ELIGIBILITY_DRAFTS_ENABLED !== '1') {
    console.error('Refusing to run: ELIGIBILITY_DRAFTS_ENABLED is not 1. Drafts stay off.');
    process.exit(1);
  }

  const summary = await persistEligibilityDrafts({ enabled: true });
  console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
