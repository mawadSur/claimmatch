import type { Config } from 'tailwindcss';

/**
 * ClaimMatch design system.
 * Palette carried over from the original settlement-card UI:
 *   brand purple (#a463f2 / #5521b5), success green (#00ab6b),
 *   plus a neutral slate scale for text/surfaces.
 */
const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f6f0ff',
          100: '#ede0ff',
          200: '#dcc4ff',
          300: '#c39bff',
          400: '#a463f2',
          500: '#8b3ee8',
          600: '#7526d1',
          700: '#5521b5',
          800: '#471b93',
          900: '#3b1878',
        },
        success: {
          50: '#def7ec',
          100: '#bcf0da',
          500: '#00ab6b',
          600: '#03835a',
          700: '#03543f',
        },
        danger: {
          50: '#fde8e8',
          500: '#e02424',
          700: '#9b1c1c',
        },
        ink: {
          DEFAULT: '#1a202c',
          muted: '#4a5568',
          soft: '#718096',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Lato', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        card: '0 5px 20px 0 rgba(24,24,24,.08)',
        'card-hover': '0 12px 32px 0 rgba(85,33,181,.14)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
