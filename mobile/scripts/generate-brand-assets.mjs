#!/usr/bin/env node
/**
 * Renders the ClaimMatch app icon, Android adaptive icon layers and splash icon
 * from the website logo (src/components/SiteLogo.tsx): a navy rounded square,
 * brand-600 #1E3A5F to brand-800 #0F243C top to bottom, with a white lucide
 * "scale" glyph (lucide-react 0.469.0, the version the website renders).
 *
 * Uses Playwright and sharp from the web project's node_modules (run `npm ci`
 * at the repo root first):
 *   node scripts/generate-brand-assets.mjs
 */
import { createRequire } from 'node:module';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRequire = createRequire(path.resolve(mobileRoot, '../package.json'));
const { chromium } = webRequire('playwright');
const sharp = webRequire('sharp');

const OUT = path.join(mobileRoot, 'assets/images');
const SIZE = 1024;

// tailwind.config.ts brand scale.
const BRAND_600 = '#1E3A5F';
const BRAND_800 = '#0F243C';
const WHITE = '#FFFFFF';

// SiteLogo.tsx: h-9 w-9 box, h-5 w-5 glyph, rounded-lg (8px of 36px).
const GLYPH_RATIO = 20 / 36;
const RADIUS_RATIO = 8 / 36;
// Android adaptive layers are 108dp; the launcher shows the middle 72dp.
const ADAPTIVE_VISIBLE = 72 / 108;

// lucide-react 0.469.0 "Scale", 24x24 viewBox.
const SCALE_PATHS = [
  'm16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z',
  'm2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z',
  'M7 21h10',
  'M12 3v18',
  'M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2',
];

function glyph(box, color, canvas = SIZE) {
  const offset = (canvas - box) / 2;
  const paths = SCALE_PATHS.map((d) => `<path d="${d}"/>`).join('');
  return `<svg x="${offset}" y="${offset}" width="${box}" height="${box}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function gradient(id, from = '0', to = '1') {
  return `<linearGradient id="${id}" x1="0" y1="${from}" x2="0" y2="${to}"><stop offset="0" stop-color="${BRAND_600}"/><stop offset="1" stop-color="${BRAND_800}"/></linearGradient>`;
}

function page(svgBody, size = SIZE) {
  return `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style></head><body><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${svgBody}</svg></body></html>`;
}

const fullBleedGlyph = Math.round(SIZE * GLYPH_RATIO);
const adaptiveGlyph = Math.round(SIZE * GLYPH_RATIO * ADAPTIVE_VISIBLE);
const visibleTop = (1 - ADAPTIVE_VISIBLE) / 2;

const ASSETS = [
  {
    // iOS and fallback icon: full bleed, no transparency (the OS rounds the corners).
    file: 'icon.png',
    opaque: true,
    body: `<defs>${gradient('g')}</defs><rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>${glyph(fullBleedGlyph, WHITE)}`,
  },
  {
    // Gradient spans the visible 72dp so it matches the full-bleed icon.
    file: 'android-icon-background.png',
    opaque: true,
    body: `<defs>${gradient('g', String(visibleTop), String(1 - visibleTop))}</defs><rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>`,
  },
  {
    file: 'android-icon-foreground.png',
    opaque: false,
    body: glyph(adaptiveGlyph, WHITE),
  },
  {
    // Android 13+ themed icons read only the alpha channel.
    file: 'android-icon-monochrome.png',
    opaque: false,
    body: glyph(adaptiveGlyph, '#000000'),
  },
  {
    // The website mark itself: rounded navy square, transparent corners.
    file: 'splash-icon.png',
    opaque: false,
    body: `<defs>${gradient('g')}</defs><rect width="${SIZE}" height="${SIZE}" rx="${SIZE * RADIUS_RATIO}" fill="url(#g)"/>${glyph(fullBleedGlyph, WHITE)}`,
  },
  {
    // Android status-bar icon for expo-notifications: 96x96 (24dp at xxxhdpi), all white
    // on transparent. Lucide's 24-unit grid already leaves Material's 2dp padding.
    file: 'notification-icon.png',
    opaque: false,
    size: 96,
    body: glyph(96, WHITE, 96),
  },
];

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  const tab = await context.newPage();
  await mkdir(OUT, { recursive: true });
  for (const asset of ASSETS) {
    const size = asset.size ?? SIZE;
    await tab.setContent(page(asset.body, size));
    const png = await tab.screenshot({
      clip: { x: 0, y: 0, width: size, height: size },
      omitBackground: !asset.opaque,
    });
    const target = path.join(OUT, asset.file);
    await rm(target, { force: true });
    const image = sharp(png);
    // Opaque assets are written as RGB so no alpha channel reaches App Store Connect.
    await (asset.opaque ? image.removeAlpha() : image).png({ compressionLevel: 9 }).toFile(target);
    console.log(`wrote ${path.relative(mobileRoot, target)}`);
  }
} finally {
  await browser.close();
}
