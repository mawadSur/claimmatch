import type { Metadata } from 'next';
import { Bricolage_Grotesque, Lato } from 'next/font/google';
import './globals.css';
import { SITE } from '@/lib/utils';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';

// Distinctive display face (headings, the big "you're owed" numbers) paired with
// a clean, trustworthy body sans — deliberately not the generic Inter default.
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
  },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="flex min-h-screen flex-col">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
