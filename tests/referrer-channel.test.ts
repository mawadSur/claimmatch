import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  classifyTrafficChannel,
  TRAFFIC_CHANNEL_PROPERTY,
} from '@/lib/analytics/referrer-channel';
import { attributionMetadata, attributionPersonProperties, parseAttribution } from '@/lib/attribution';
import { tallyChannelRows } from '@/lib/referrer-channel-stats';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('classifyTrafficChannel', () => {
  it('maps ChatGPT utm_source=chatgpt.com', () => {
    expect(classifyTrafficChannel({ utmSource: 'chatgpt.com' })).toBe('chatgpt');
  });

  it('maps Perplexity, Copilot/Bing, Gemini, and Google organic', () => {
    expect(classifyTrafficChannel({ referrer: 'https://www.perplexity.ai/search' })).toBe('perplexity');
    expect(classifyTrafficChannel({ utmSource: 'bing', utmMedium: 'organic' })).toBe('copilot_bing');
    expect(classifyTrafficChannel({ referrer: 'https://copilot.microsoft.com/' })).toBe('copilot_bing');
    expect(classifyTrafficChannel({ referrer: 'https://gemini.google.com/app' })).toBe('gemini');
    expect(classifyTrafficChannel({ referrer: 'https://www.google.com/' })).toBe('google_organic');
    expect(classifyTrafficChannel({ utmSource: 'google', utmMedium: 'organic' })).toBe('google_organic');
  });

  it('does not call paid Google ads organic', () => {
    expect(classifyTrafficChannel({ utmSource: 'google', utmMedium: 'cpc' })).toBe('other');
    expect(classifyTrafficChannel({ referrer: 'https://www.google.com/', utmMedium: 'ppc' })).toBe('other');
  });

  it('returns other for known campaigns and null for a direct visit', () => {
    expect(classifyTrafficChannel({ utmSource: 'twitter' })).toBe('other');
    expect(classifyTrafficChannel({})).toBeNull();
  });
});

describe('attribution attaches traffic_channel only when the flag is on', () => {
  it('omits the property by default', () => {
    const attr = { ...parseAttribution({ utm_source: 'chatgpt.com' }), referrer: null };
    expect(attributionPersonProperties(attr)[TRAFFIC_CHANNEL_PROPERTY]).toBeUndefined();
    expect(attributionMetadata(attr)[TRAFFIC_CHANNEL_PROPERTY]).toBeUndefined();
  });

  it('adds the closed-set channel when AI_REFERRER_ATTRIBUTION_ENABLED=1', () => {
    vi.stubEnv('AI_REFERRER_ATTRIBUTION_ENABLED', '1');
    const attr = { ...parseAttribution({ utm_source: 'chatgpt.com' }), referrer: null };
    expect(attributionPersonProperties(attr)[TRAFFIC_CHANNEL_PROPERTY]).toBe('chatgpt');
    expect(attributionPersonProperties(attr).initial_traffic_channel).toBe('chatgpt');
    expect(attributionMetadata(attr)[TRAFFIC_CHANNEL_PROPERTY]).toBe('chatgpt');
    expect(JSON.stringify(attributionPersonProperties(attr))).not.toMatch(/email|full_name|phone/i);
  });
});

describe('tallyChannelRows', () => {
  it('counts signups and onboarded profiles without PII', () => {
    const rows = tallyChannelRows([
      { first_traffic_channel: 'chatgpt', onboarded: true },
      { first_utm_source: 'chatgpt.com', onboarded: false },
      { first_utm_source: 'twitter', onboarded: true },
      { onboarded: false },
    ]);
    const chatgpt = rows.find((r) => r.channel === 'chatgpt');
    const other = rows.find((r) => r.channel === 'other');
    const unknown = rows.find((r) => r.channel === 'unknown');
    expect(chatgpt?.signups).toBe(2);
    expect(chatgpt?.onboarded).toBe(1);
    expect(other?.signups).toBe(1);
    expect(unknown?.signups).toBe(1);
    expect(JSON.stringify(rows)).not.toMatch(/@|email/i);
  });
});
