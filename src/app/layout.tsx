import type { Metadata } from 'next';
import { Newsreader, Source_Sans_3 } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { SITE } from '@/lib/utils';
import { jsonLd } from '@/lib/jsonld';
import { SITE_OG_IMAGE } from '@/lib/site-metadata';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { PostHogProvider } from '@/components/PostHogProvider';

// Trust & Authority pairing (UI UX Pro Max): Newsreader, an editorial serif, for
// page and section headlines (h1/h2); Source Sans 3 for body and all app UI.
const display = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  variable: '--font-display',
  display: 'swap',
});
const body = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  openGraph: {
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    url: SITE.url,
    siteName: SITE.name,
    type: 'website',
    images: [SITE_OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    images: [SITE_OG_IMAGE.url],
  },
  icons: { icon: '/favicon.svg' },
};

const orgJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: SITE.name,
      url: SITE.url,
      logo: `${SITE.url.replace(/\/$/, '')}/opengraph-image`,
      image: `${SITE.url.replace(/\/$/, '')}/opengraph-image`,
      description: SITE.description,
    },
    {
      '@type': 'WebSite',
      name: SITE.name,
      url: SITE.url,
      description: SITE.description,
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="flex min-h-screen flex-col bg-brand-50">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(orgJsonLd) }}
        />
        <PostHogProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-700 focus:shadow-card focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            Skip to content
          </a>
          <Nav />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
        </PostHogProvider>
        <Analytics />
      </body>
    </html>
  );
}
