import type { EligibilityQuestion } from './types';

/**
 * The onboarding questionnaire. Answers are stored in profiles.attributes
 * keyed by `key`, and lawsuits reference these same keys in their
 * eligibility.requires / eligibility.anyOf criteria.
 *
 * Add a question here + reference its key in a lawsuit's eligibility JSON and
 * the matcher will start using it — no code changes needed.
 */
export const ELIGIBILITY_QUESTIONS: EligibilityQuestion[] = [
  {
    key: 'state',
    label: 'Which state do you live in?',
    type: 'state',
    help: 'Many settlements are limited to residents of certain states.',
  },
  {
    key: 'had_data_breach',
    label: 'Have you received a data-breach notification in the last 3 years?',
    type: 'boolean',
    help: 'Emails or letters saying your personal info may have been exposed.',
  },
  {
    key: 'owns_vehicle',
    label: 'Do you own or lease a car, truck, or SUV?',
    type: 'boolean',
  },
  {
    key: 'vehicle_brands',
    label: 'Which brands? (select all that apply)',
    type: 'multiselect',
    options: ['Toyota', 'Honda', 'Ford', 'GM', 'Kia', 'Hyundai', 'Tesla', 'Other'],
  },
  {
    key: 'used_banking',
    label: 'Have you paid overdraft or account fees to a bank in the last 5 years?',
    type: 'boolean',
  },
  {
    key: 'bought_consumer_goods',
    label: 'Have you bought packaged food, supplements, or household products recently?',
    type: 'boolean',
  },
  {
    key: 'uses_social_media',
    label: 'Do you use Facebook, Instagram, TikTok, or Google?',
    type: 'boolean',
  },
  {
    key: 'used_streaming',
    label: 'Have you had a paid streaming, telecom, or subscription service?',
    type: 'boolean',
  },
  {
    key: 'employed_hourly',
    label: 'Have you worked an hourly or gig job in the last 4 years?',
    type: 'boolean',
  },
  {
    key: 'took_medication',
    label: 'Have you taken prescription medication or used a medical device?',
    type: 'boolean',
  },
];
