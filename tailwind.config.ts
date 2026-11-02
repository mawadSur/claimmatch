import type { Config } from 'tailwindcss';

/**
 * Public-site design system (UI UX Pro Max):
 *   Style:    Trust & Authority, product-led (real app screens)
 *   Pattern:  Hero + product proof + scroll story + trust facts + CTA
 *   Palette:  Banking / traditional finance (navy + trust blue + gold)
 *   Fonts:    Newsreader (editorial serif, h1/h2 only) + Source Sans 3 (UI/body)
 *
 * Light surfaces, one navy panel per page at most. CTA uses navy; gold is
 * reserved for small emphasis (payout figures, highlights on navy). Avoid AI
 * purple/pink gradients.
 *
 * Font names that are not valid CSS identifiers (e.g. "Source Sans 3") MUST be
 * quoted here: Tailwind emits them verbatim, and one invalid name voids the
 * whole font-family declaration (the body silently fell back to Times).
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
          200: '#F8E3B0',
          300: '#F1CD7F',
          400: '#E6B455',
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
        sans: ['var(--font-sans)', '"Source Sans 3"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        display: ['var(--font-display)', 'Newsreader', 'Georgia', '"Times New Roman"', 'serif'],
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
        '4xl': '2rem',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 23, 42, 0.06), 0 8px 24px -12px rgba(15, 23, 42, 0.12)',
        'card-hover': '0 1px 2px 0 rgba(15, 23, 42, 0.06), 0 16px 32px -12px rgba(30, 58, 95, 0.18)',
        // Device frames and floating product shots.
        device:
          '0 0 0 1px rgba(15, 23, 42, 0.06), 0 24px 48px -16px rgba(10, 22, 40, 0.28), 0 48px 96px -32px rgba(10, 22, 40, 0.30)',
        'btn-primary': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.12), 0 1px 2px 0 rgba(10, 22, 40, 0.24)',
      },
      maxWidth: {
        page: '72rem',
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
