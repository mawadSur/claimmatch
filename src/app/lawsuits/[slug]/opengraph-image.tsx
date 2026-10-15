import { ImageResponse } from 'next/og';
import { lookupLawsuitBySlug, computedLawsuitStatus } from '@/lib/lawsuits';
import { formatDeadline } from '@/lib/utils';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Class-action settlement on ClaimMatch';

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await lookupLawsuitBySlug(slug);
  const title = result.status === 'ok' ? result.lawsuit.title : 'Settlement';
  const deadline =
    result.status === 'ok' ? formatDeadline(result.lawsuit.deadline) : 'See official notice';
  const status =
    result.status === 'ok'
      ? computedLawsuitStatus(result.lawsuit) === 'closed'
        ? 'Closed'
        : 'Open for claims'
      : 'ClaimMatch';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(135deg, #1e1b4b 0%, #5b21b6 60%, #a78bfa 100%)',
          color: 'white',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, opacity: 0.9 }}>
          <span>ClaimMatch</span>
          <span
            style={{
              background: status === 'Closed' ? '#374151' : '#065f46',
              padding: '8px 18px',
              borderRadius: 999,
              fontSize: 22,
            }}
          >
            {status}
          </span>
        </div>
        <div style={{ fontSize: 54, fontWeight: 800, lineHeight: 1.15, maxWidth: 1040 }}>
          {title}
        </div>
        <div style={{ fontSize: 26, opacity: 0.92 }}>
          Deadline {deadline} · You submit on the official site
        </div>
      </div>
    ),
    size,
  );
}
