import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { draftFromAttributes } from '@/lib/match-preview';
import { eligibilitySummary } from '@/lib/claim-input';
import { flags } from '@/lib/flags';
import { getLawsuitBySlug } from '@/lib/lawsuits';
import { parseSettlementScopeSlug } from '@/lib/match-preview';
import { accountGateWhy } from '@/lib/copy';
import { FeeDisclosure } from '@/components/FeeDisclosure';
import { MatchPreview, type MatchPreviewScope } from '@/components/match-preview/MatchPreview';
import { WhyAccountExplainer } from '@/components/WhyAccountExplainer';

export const metadata: Metadata = {
  title: 'See matching settlements',
  description:
    'Answer a few questions to see open class-action settlements that may apply to you. No account needed.',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PreviewPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let accountDraft = null;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('state, attributes')
      .eq('id', user.id)
      .maybeSingle();
    if (profile) {
      accountDraft = draftFromAttributes(profile.state as string | null, profile.attributes as Record<string, unknown> | null);
    }
  }

  const params = searchParams ? await searchParams : {};
  const slug = parseSettlementScopeSlug(firstParam(params.settlement));
  const scopedCta = Boolean(slug);

  let scope: MatchPreviewScope | null = null;
  if (scopedCta && slug) {
    const lawsuit = await getLawsuitBySlug(slug);
    if (lawsuit) {
      scope = {
        slug: lawsuit.slug,
        title: lawsuit.title,
        eligibilityText: eligibilitySummary(lawsuit.eligibility_text),
        typical_payout: lawsuit.typical_payout?.trim() || null,
        deadline: lawsuit.deadline,
        eligibility: lawsuit.eligibility || {},
      };
    }
  }

  return (
    <section className="bg-brand-50">
      <div className="container-narrow py-12 sm:py-16">
        <div className="mx-auto max-w-xl">
          <p className="eyebrow">Free preview</p>
          <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
            {scope ? `Check ${scope.title}` : 'See matching settlements'}
          </h1>
          <p className="mt-3 text-ink-muted">
            {scope
              ? 'A few questions this listing already uses. No account needed to see a result. This is not a decision that you qualify — the official notice has the rules.'
              : 'A few questions the matcher already uses. No account needed to see results. This is not a decision that you qualify — the official notice has the rules.'}
          </p>
          {scope?.eligibilityText && (
            <p className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-ink-muted">
              Our listing says: {scope.eligibilityText} Confirm every detail on
              the official notice before you file.
            </p>
          )}
          <div className="mt-8">
            <MatchPreview
              signupContextEnabled
              feeNote={<FeeDisclosure compact />}
              scope={scope}
              hideUnknown={flags.catalogHideUnknowns()}
              accountDraft={accountDraft}
              signedIn={Boolean(user)}
              whyAccount={accountGateWhy()}
            />
          </div>
          <WhyAccountExplainer className="mt-6" />
        </div>
      </div>
    </section>
  );
}
