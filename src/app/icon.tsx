import { ImageResponse } from 'next/og';
import { BrandScaleGlyph, brandMarkGradient } from '@/lib/brand-mark';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div style={brandMarkGradient(32)}>
        <BrandScaleGlyph size={32} />
      </div>
    ),
    size,
  );
}
