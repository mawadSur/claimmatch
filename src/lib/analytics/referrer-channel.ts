/**
 * Closed-set first-touch traffic channel. Classifies utm_source + a sanitized
 * referrer (origin + path only) into chatgpt / perplexity / copilot_bing /
 * gemini / google_organic / other. Never stores email, names, or query strings.
 */

export const TRAFFIC_CHANNELS = [
  'chatgpt',
  'perplexity',
  'copilot_bing',
  'gemini',
  'google_organic',
  'other',
] as const;

export type TrafficChannel = (typeof TRAFFIC_CHANNELS)[number];

/** PostHog event + person property. Closed set; no PII. */
export const TRAFFIC_CHANNEL_PROPERTY = 'traffic_channel';
export const INITIAL_TRAFFIC_CHANNEL_PROPERTY = 'initial_traffic_channel';

export const TRAFFIC_CHANNEL_LABELS: Record<TrafficChannel, string> = {
  chatgpt: 'ChatGPT',
  perplexity: 'Perplexity',
  copilot_bing: 'Copilot / Bing',
  gemini: 'Gemini',
  google_organic: 'Google organic',
  other: 'Other',
};

const PAID_MEDIUMS = new Set([
  'cpc',
  'ppc',
  'paid',
  'ads',
  'cpm',
  'display',
  'paidsearch',
  'paid-social',
  'paid_social',
]);

export function isTrafficChannel(value: unknown): value is TrafficChannel {
  return typeof value === 'string' && (TRAFFIC_CHANNELS as readonly string[]).includes(value);
}

function norm(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '');
    return host || null;
  } catch {
    return null;
  }
}

function hostMatches(host: string, root: string): boolean {
  return host === root || host.endsWith(`.${root}`);
}

function isGoogleHost(host: string): boolean {
  if (host === 'google.com' || host.endsWith('.google.com')) return true;
  // google.co.uk, google.ca, google.com.au, …
  return /^google\.[a-z]{2,}(?:\.[a-z]{2})?$/.test(host);
}

function isPaidMedium(medium: string): boolean {
  return PAID_MEDIUMS.has(medium);
}

/**
 * First-touch channel from campaign tags and/or the sanitized document
 * referrer. Returns null when there is nothing to classify (direct visit).
 */
export function classifyTrafficChannel(input: {
  utmSource?: string | null;
  utmMedium?: string | null;
  referrer?: string | null;
}): TrafficChannel | null {
  const source = norm(input.utmSource);
  const medium = norm(input.utmMedium);
  const host = referrerHost(input.referrer);

  if (source.includes('chatgpt') || source === 'openai') return 'chatgpt';
  if (source.includes('perplexity')) return 'perplexity';
  if (source.includes('copilot') || source === 'bing' || source === 'msn') return 'copilot_bing';
  if (source.includes('gemini') || source === 'bard') return 'gemini';

  if (host) {
    if (hostMatches(host, 'chatgpt.com') || host === 'chat.openai.com') return 'chatgpt';
    if (hostMatches(host, 'perplexity.ai')) return 'perplexity';
    if (
      hostMatches(host, 'bing.com') ||
      hostMatches(host, 'copilot.microsoft.com') ||
      host === 'msn.com' ||
      host.endsWith('.msn.com')
    ) {
      return 'copilot_bing';
    }
    if (host === 'gemini.google.com' || host === 'bard.google.com') return 'gemini';
    if (isGoogleHost(host) && !isPaidMedium(medium) && source !== 'googleads' && !source.includes('adwords')) {
      return 'google_organic';
    }
  }

  if ((source === 'google' || source === 'google.com') && !isPaidMedium(medium)) {
    return 'google_organic';
  }

  if (source || host) return 'other';
  return null;
}
