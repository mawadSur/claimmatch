import type { Config } from 'tailwindcss';

/**
 * Public-site design system (UI UX Pro Max):
 *   Style:    Minimalism & Swiss Style
 *   Pattern:  Trust & Authority + Conversion
 *   Palette:  Banking / traditional finance (navy + trust blue + gold)
 *   Fonts:    Corporate Trust — Lexend + Source Sans 3
 *
 * Light surfaces only. CTA uses navy; gold is reserved for small emphasis
 * (payout figures, badges). Avoid AI purple/pink gradients.
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
          50: '#F4F7FB',
          100: '#E6EEF6',
          200: '#C5D4E6',
          300: '#8FA8C4',
          400: '#5B7DA3',
          500: '#2E5278',
          600: '#1E3A5F',
          700: '#16304E',
          800: '#0F243C',
          900: '#0A1628',
        },
        cta: {
          50: '#EFF6FF',
          600: '#1D4ED8',
          700: '#1E40AF',
        },
        gold: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          600: '#B45309',
          700: '#92400E',
        },
        success: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          500: '#16A34A',
          600: '#15803D',
          700: '#166534',
        },
        danger: {
          50: '#FEF2F2',
          500: '#DC2626',
          700: '#B91C1C',
        },
        ink: {
          DEFAULT: '#0F172A',
          muted: '#334155',
          soft: '#475569',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Source Sans 3', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 23, 42, 0.06), 0 8px 24px -12px rgba(15, 23, 42, 0.12)',
        'card-hover': '0 1px 2px 0 rgba(15, 23, 42, 0.06), 0 16px 32px -12px rgba(30, 58, 95, 0.18)',
      },
      minHeight: {
        tap: '44px',
      },
      minWidth: {
        tap: '44px',
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
