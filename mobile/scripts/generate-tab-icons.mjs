#!/usr/bin/env node
/**
 * Renders the tab bar icons from lucide (lucide-react-native, the same icon
 * family as the rest of the app and the website) to PNGs, because native tabs
 * take SF Symbols, Material Symbols or images, not React components.
 *
 * Each tab gets a default and a selected image at @1x/@2x/@3x (24 pt, the
 * lucide grid). iOS draws them as template images tinted with the tab colors
 * (src/app/(tabs)/_layout.tsx); Android draws image icons in their own colors,
 * so the two variants are baked in the tab colors below.
 *
 * Uses sharp from the web project's node_modules (run `npm ci` at the repo
 * root first):
 *   node scripts/generate-tab-icons.mjs
 */
import { Buffer } from 'node:buffer';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRequire = createRequire(path.resolve(mobileRoot, '../package.json'));
const sharp = webRequire('sharp');

const OUT = path.join(mobileRoot, 'assets/images/tabs');
const POINTS = 24;
const SCALES = [1, 2, 3];

// src/theme/tokens.ts: colors.textSoft (ink-soft) and colors.primary (brand-700).
const COLORS = { default: '#475569', selected: '#16304E' };

// Tab route name -> lucide icon.
const TABS = {
  lawsuits: 'file-search',
  dashboard: 'list-checks',
  settings: 'settings',
};

/** The icon's SVG elements, read from lucide-react-native's data (`node: [...]`). */
async function iconNode(name) {
  const file = path.join(mobileRoot, 'node_modules/lucide-react-native/dist/esm/icons', `${name}.mjs`);
  const source = await readFile(file, 'utf8');
  const match = /node:\s*(\[[\s\S]*?\n {2}\])\n/.exec(source);
  if (!match) throw new Error(`No icon data in ${file}`);
  // A plain array literal of [tag, attributes] pairs, from the installed package.
  return vm.runInNewContext(`(${match[1]})`, Object.create(null), { timeout: 1000 });
}

function svg(node, color, size) {
  const children = node
    .map(([tag, attributes]) => {
      const attrs = Object.entries(attributes)
        .filter(([key]) => key !== 'key')
        .map(([key, value]) => `${key}="${String(value)}"`)
        .join(' ');
      return `<${tag} ${attrs}/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const [tab, icon] of Object.entries(TABS)) {
  const node = await iconNode(icon);
  for (const [state, color] of Object.entries(COLORS)) {
    for (const scale of SCALES) {
      const name = `${tab}${state === 'selected' ? '-selected' : ''}${scale === 1 ? '' : `@${scale}x`}.png`;
      const size = POINTS * scale;
      await sharp(Buffer.from(svg(node, color, size)), { density: 72 * scale })
        .resize(size, size)
        .png({ compressionLevel: 9 })
        .toFile(path.join(OUT, name));
      console.log(`wrote assets/images/tabs/${name}`);
    }
  }
}
