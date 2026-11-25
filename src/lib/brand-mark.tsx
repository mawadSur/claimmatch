import type { CSSProperties } from 'react';

/**
 * Shared Lawsuit AI mark for generated icons. Navy matches SiteLogo / brand
 * tokens; the purple wash matches the site OG card so favicon, apple-touch
 * and share images read as one family.
 */

export const BRAND_MARK_NAVY = '#0F243C';
export const BRAND_MARK_NAVY_MID = '#1E3A5F';
export const BRAND_MARK_PURPLE = '#5B21B6';
export const BRAND_MARK_PURPLE_LIGHT = '#7C3AED';

export function brandMarkGradient(size: number): CSSProperties {
  return {
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: `linear-gradient(145deg, ${BRAND_MARK_NAVY} 0%, ${BRAND_MARK_NAVY_MID} 48%, ${BRAND_MARK_PURPLE} 100%)`,
    borderRadius: Math.round(size * 0.22),
  };
}

/** White scales of justice, sized for ImageResponse (no lucide). */
export function BrandScaleGlyph({ size }: { size: number }) {
  const stroke = Math.max(2, Math.round(size * 0.055));
  const w = Math.round(size * 0.56);
  const h = Math.round(size * 0.56);
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g
        stroke="#fff"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M32 10v40" />
        <path d="M18 20h28" />
        <path d="M18 20l-8 16a8 8 0 0 0 16 0z" />
        <path d="M46 20l-8 16a8 8 0 0 0 16 0z" />
        <path d="M22 54h20" />
      </g>
    </svg>
  );
}
