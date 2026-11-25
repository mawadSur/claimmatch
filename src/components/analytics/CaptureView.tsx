import { CaptureOnce } from '@/components/analytics/CaptureOnce';
import { isViewEvent, viewEventKey } from '@/lib/analytics/view-capture';

/**
 * Fires a view event once per document load without waiting for React
 * hydration or posthog.init, then again from CaptureOnce on client
 * navigations (the inline script does not re-run). CaptureOnce skips when
 * the script already recorded this view.
 */
export function CaptureView({
  event,
  properties,
}: {
  event: string;
  properties?: Record<string, string | number | boolean | null | undefined>;
}) {
  const slug = typeof properties?.slug === 'string' ? properties.slug : '';
  const payload = JSON.stringify({
    event,
    path: typeof properties?.path === 'string' ? properties.path : undefined,
    slug: slug || undefined,
    lawsuit_id: typeof properties?.lawsuit_id === 'string' ? properties.lawsuit_id : undefined,
    properties,
  });
  const script = isViewEvent(event)
    ? `(function(){try{var e=${JSON.stringify(event)};var s=${JSON.stringify(slug)};var p=location.pathname||'';var k=e+':'+p+':'+s;window.__cmViewSent=window.__cmViewSent||{};if(window.__cmViewSent[k])return;window.__cmViewSent[k]=1;var body=${payload};body.path=p;if(navigator.sendBeacon){navigator.sendBeacon('/api/analytics/view',new Blob([JSON.stringify(body)],{type:'application/json'}));}}catch(x){}})();`
    : '';

  return (
    <>
      {script ? (
        <script
          dangerouslySetInnerHTML={{ __html: script }}
        />
      ) : null}
      <CaptureOnce event={event} properties={properties} />
    </>
  );
}

export { viewEventKey };
