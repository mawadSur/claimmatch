import { homeFaqItems } from '@/components/home/HomeFaq';
import { ACCOUNT_FOR_SAVE_WHY, BROWSE_NO_ACCOUNT, OFFICIAL_FILING_IS_FREE } from './copy';
import { flags } from './flags';

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqGroup {
  id: string;
  title: string;
  items: FaqItem[];
}

/**
 * The full /faq page. The first group reuses the home page answers so the two
 * never drift. Every answer must stay literally true of the product today.
 */
export function faqGroups(disclose = flags.feeDisclosure()): FaqGroup[] {
  return [
    {
      id: 'basics',
      title: 'Lawsuit AI basics',
      items: homeFaqItems(disclose),
    },
    {
      id: 'settlements',
      title: 'Class action settlements',
      items: [
        {
          q: 'What is a class action settlement?',
          a: 'When a company settles a class action lawsuit, it agrees to pay the group of people affected. To get a share you usually send a claim form to the settlement administrator before the deadline.',
        },
        {
          q: 'Who decides whether I qualify?',
          a: 'The official settlement notice and the settlement administrator. Lawsuit AI is not a law firm and can’t tell you whether you qualify. File only if the notice describes you. Filing a claim that doesn’t apply to you can be against the law.',
        },
        {
          q: 'Do I need proof of purchase?',
          a: 'It depends on the settlement. Some ask for proof of purchase or account records and some don’t. Each listing shows the proof rule as our source states it, and the official notice is the final word.',
        },
        {
          q: 'How much will I get?',
          a: 'Each settlement sets its own payments. The payout we show is what the listing states. Actual payments often depend on how many people file and can be higher or lower, so we can’t promise an amount.',
        },
        {
          q: 'When will I get paid?',
          a: 'Payments usually go out after the court gives final approval and any appeals are over, which can take months or longer. The settlement administrator pays you directly. Check the official settlement site for the latest status.',
        },
        {
          q: 'How can I tell if a settlement site is real?',
          a: `${OFFICIAL_FILING_IS_FREE} Be wary of anyone who asks you to pay to file. Compare the administrator and website named in the official notice with the site you are on before you enter your details.`,
        },
      ],
    },
    {
      id: 'account',
      title: 'Your account and data',
      items: [
        {
          q: 'Do I need an account?',
          a: `${BROWSE_NO_ACCOUNT} ${ACCOUNT_FOR_SAVE_WHY}`,
        },
        {
          q: 'Will you email me?',
          a: 'We send the account emails you ask for, like sign-in and password reset links. Reminders and alerts follow your email settings, and you can turn them off at any time in your account settings or from the unsubscribe link in any email.',
        },
        {
          q: 'Can I delete my account?',
          a: 'Yes. You can delete your account and the details you saved from your account settings.',
        },
        {
          q: 'How often are listings updated?',
          a: 'We refresh the catalog from our public data source every day. Listings can still change between updates, so always confirm the deadline on the official settlement site.',
        },
      ],
    },
  ];
}

export function allFaqItems(disclose = flags.feeDisclosure()): FaqItem[] {
  return faqGroups(disclose).flatMap((g) => g.items);
}
