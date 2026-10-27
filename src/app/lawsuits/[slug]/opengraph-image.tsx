import { ImageResponse } from 'next/og';
import { flags } from '@/lib/flags';
import { lookupLawsuitBySlug } from '@/lib/lawsuits';
import { SETTLEMENT_OG_TAGLINE, settlementOgCopy } from '@/lib/settlement-og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Class-action settlement on ClaimMatch';

type Params = { params: Promise<{ slug: string }> };

function GenericCard() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        background: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 55%, #c4b5fd 100%)',
        color: 'white',
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 600, opacity: 0.9 }}>ClaimMatch</div>
      <div style={{ fontSize: 64, fontWeight: 800, marginTop: 16, lineHeight: 1.1 }}>
        Find settlements you qualify for
      </div>
      <div style={{ fontSize: 28, marginTop: 24, opacity: 0.9, maxWidth: 900 }}>
        Official claim links. You file on the official site.
      </div>
    </div>
  );
}

function SettlementCard({
  title,
  deadlineLine,
}: {
  title: string;
  deadlineLine: string | null;
}) {
  return (
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
      <div style={{ display: 'flex', fontSize: 24, opacity: 0.9 }}>ClaimMatch</div>
      <div style={{ fontSize: title.length > 70 ? 44 : 54, fontWeight: 800, lineHeight: 1.15, maxWidth: 1040 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', fontSize: 26, opacity: 0.92 }}>
        {deadlineLine ? <div>{deadlineLine}</div> : null}
        <div style={{ marginTop: deadlineLine ? 10 : 0 }}>{SETTLEMENT_OG_TAGLINE}</div>
      </div>
    </div>
  );
}

/**
 * Per-settlement share card from stored title and deadline only. When
 * SETTLEMENT_OG_ENABLED is off, the site-wide card is used so the feature
 * stays dark until the flag is flipped.
 */
export default async function Image({ params }: Params) {
  if (!flags.settlementOg()) {
    return new ImageResponse(<GenericCard />, size);
  }

  const { slug } = await params;
  const result = await lookupLawsuitBySlug(slug);
  if (result.status !== 'found') {
    return new ImageResponse(<GenericCard />, size);
  }

  const copy = settlementOgCopy(result.lawsuit);
  return new ImageResponse(
    <SettlementCard title={copy.title} deadlineLine={copy.deadlineLine} />,
    size,
  );
}
