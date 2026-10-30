import type { Metadata } from 'next';
import { Bricolage_Grotesque, Lato } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { SITE } from '@/lib/utils';
import { jsonLd } from '@/lib/jsonld';
import { SITE_OG_IMAGE } from '@/lib/site-metadata';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import { PostHogProvider } from '@/components/PostHogProvider';

// Distinctive display face for headings, paired with a clean, readable body
// sans — deliberately not the generic Inter default.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});
const body = Lato({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
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
      <body className="flex min-h-screen flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(orgJsonLd) }}
        />
        <PostHogProvider>
          <Nav />
          <main className="flex-1">{children}</main>
          <Footer />
        </PostHogProvider>
        <Analytics />
      </body>
    </html>
  );
}
