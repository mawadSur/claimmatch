import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'ClaimMatch — find open class-action settlements';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
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
          Official claim links. Pre-filled details. You submit on the official site.
        </div>
      </div>
    ),
    size,
  );
}
