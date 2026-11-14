/**
 * PLACEHOLDER reviews so the home page reviews section can be designed and
 * reviewed before real ones exist. These are NOT from real users.
 *
 * They render only in local development and Vercel preview deploys, each card
 * labeled "Sample", and never in production: publishing invented reviews as
 * real is banned by the FTC rule on consumer reviews (16 CFR Part 465).
 * Production shows the section only once src/lib/testimonials.ts holds
 * MIN_TESTIMONIALS real, consented reviews; those replace these automatically.
 */
export interface SampleTestimonial {
  quote: string;
  name: string;
  location?: string;
  context?: string;
}

export const SAMPLE_TESTIMONIALS: readonly SampleTestimonial[] = [
  {
    quote:
      'I found two settlements I had never heard of in about ten minutes. Having the deadline right on the listing made it easy to decide what to do first.',
    name: 'Jordan P.',
    location: 'Columbus, OH',
  },
  {
    quote:
      'Copying my address into the official form instead of retyping it every time saved me a lot of hassle.',
    name: 'Alicia R.',
    location: 'Phoenix, AZ',
  },
  {
    quote:
      'I like that it sends me to the official site to file. I could check everything myself before I sent anything.',
    name: 'Marcus T.',
    location: 'Atlanta, GA',
  },
  {
    quote:
      'Keeping my confirmation numbers in one list is the part I use most. I used to lose them in my email.',
    name: 'Priya S.',
    location: 'Seattle, WA',
  },
  {
    quote: 'The closing-soon list is how I caught one with three days left.',
    name: 'Dana K.',
    location: 'Denver, CO',
  },
  {
    quote:
      'It is upfront about which listings are verified and which are not. That made me trust it more, not less.',
    name: 'Luis M.',
    location: 'San Antonio, TX',
  },
];

/** Local dev and Vercel preview deploys only. Never production. */
export function showSampleTestimonials(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL_ENV === 'production') return false;
  return env.NODE_ENV === 'development' || env.VERCEL_ENV === 'preview';
}
