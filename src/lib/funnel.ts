import { attributionMetadata, readBrowserCookies } from '@/lib/attribution';

export type FunnelProps = Record<string, string | number | boolean | null | undefined>;

/**
 * Attach first-touch UTM/ref tags already stored on this device. Never adds
 * email, name or other PII. Used by CaptureOnce and the settlement CTAs.
 */
export function withFunnelAttribution(properties: FunnelProps = {}): FunnelProps {
  return { ...attributionMetadata(readBrowserCookies()), ...properties };
}
