#!/usr/bin/env node
// Generate the Heybox cover image from assets this package actually owns.
//
// The platform listing needs a cover image (441x858). The public package must not
// ship the internal preview screenshot, so the cover is composed here from the
// reviewed brand icon and the upstream tile faces in assets/tiles only.
//
//   node scripts/generate-icons.mjs            # write the cover
//   node scripts/generate-icons.mjs --check    # verify it matches
//
// Requires the `sharp` devDependency (npm ci).
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coverFile = path.join(packageRoot, 'heybox-miniprogram/assets/cover-home.webp');
const check = process.argv.includes('--check');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

const WIDTH = 441;
const HEIGHT = 858;

// The same faces the app opens with, so the cover and the product agree.
const COVER_TILES = ['m1', 'p5', 's7', 'z6', 'z7'];
// The tile faces carry the upstream `0 0 19 26` viewBox. The thumbnail size is an
// exact multiple of it (19 x 4, 26 x 4) so the cover never stretches the artwork;
// five faces plus the gaps still fit inside the 441 px cover width.
const TILE_VIEWBOX = {width: 19, height: 26};
const TILE_SCALE = 4;
const TILE_WIDTH = TILE_VIEWBOX.width * TILE_SCALE;
const TILE_HEIGHT = TILE_VIEWBOX.height * TILE_SCALE;
const TILE_GAP = 8;

async function build() {
  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">` +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#27424e"/><stop offset="0.55" stop-color="#1c3138"/>' +
    '<stop offset="1" stop-color="#12262a"/></linearGradient></defs>' +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#g)"/>` +
    `<circle cx="${WIDTH / 2}" cy="238" r="132" fill="#ffffff" opacity="0.05"/>` +
    '</svg>',
    'utf8'
  );

  const icon = await sharp(path.join(packageRoot, 'assets/app-icon-buddies.webp'))
    .resize(148, 148, {fit: 'cover'})
    .png()
    .toBuffer();

  const rowWidth = COVER_TILES.length * TILE_WIDTH + (COVER_TILES.length - 1) * TILE_GAP;
  const rowLeft = Math.round((WIDTH - rowWidth) / 2);
  const rowTop = 424;

  const tiles = [];
  for (const [index, id] of COVER_TILES.entries()) {
    tiles.push({
      // The vector face is the canonical artwork; sharp rasterises it here so the
      // cover never depends on the mini-program PNG copies.
      input: await sharp(path.join(packageRoot, 'assets/tiles', id + '.svg'), {density: 384})
        .resize(TILE_WIDTH, TILE_HEIGHT, {fit: 'fill', kernel: 'lanczos3'})
        .png()
        .toBuffer(),
      left: rowLeft + index * (TILE_WIDTH + TILE_GAP),
      top: rowTop
    });
  }

  return sharp(background)
    .composite([
      {input: icon, left: Math.round((WIDTH - 148) / 2), top: 164},
      ...tiles
    ])
    .webp({quality: 88, effort: 6})
    .toBuffer();
}

const bytes = await build();

if (check) {
  const existing = await fs.readFile(coverFile).catch(() => null);
  if (!existing) throw new Error('Missing heybox-miniprogram/assets/cover-home.webp; run npm run assets:icons.');
  if (digest(existing) !== digest(bytes)) {
    throw new Error('cover-home.webp does not match the generated cover; run npm run assets:icons.');
  }
  console.log('Verified the Heybox cover image (' + bytes.length + ' bytes).');
} else {
  await fs.mkdir(path.dirname(coverFile), {recursive: true});
  await fs.writeFile(coverFile, bytes);
  console.log('Generated heybox-miniprogram/assets/cover-home.webp (' + bytes.length + ' bytes, ' +
    WIDTH + 'x' + HEIGHT + ') from the selected icon and the upstream tile faces.');
}
