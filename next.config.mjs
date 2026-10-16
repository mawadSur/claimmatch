import { productionContactProblem } from './src/lib/contact-email.mjs';

// A production deploy must name a working inbox for privacy and data requests
// (see src/lib/contact-email.mjs). Stopping the build keeps the live site as it
// is until NEXT_PUBLIC_CONTACT_EMAIL is set.
const contactProblem = productionContactProblem(process.env);
if (contactProblem) throw new Error(contactProblem);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Restrict the Next image optimizer to hosts we trust, so it can't be used
    // as an open image proxy / SSRF vector. Add specific CDN hosts as needed.
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
};

export default nextConfig;
