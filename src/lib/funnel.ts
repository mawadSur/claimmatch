import { detectTrafficKindFromBrowser, TRAFFIC_PROPERTY } from '@/lib/analytics/traffic';
import { attributionMetadata, readBrowserCookies } from '@/lib/attribution';

export type FunnelProps = Record<string, string | number | boolean | null | undefined>;

/**
 * Attach first-touch UTM/ref tags already stored on this device, plus the
 * closed-set traffic kind. Never adds email, name or other PII. Existing
 * attribution keys on `properties` win so later clicks cannot overwrite them.
 */
export function withFunnelAttribution(properties: FunnelProps = {}): FunnelProps {
  return {
    [TRAFFIC_PROPERTY]: detectTrafficKindFromBrowser(),
    ...attributionMetadata(readBrowserCookies()),
    ...properties,
  };
}
