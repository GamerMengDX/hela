#!/usr/bin/env node
// Tile artwork pipeline: verify the upstream SVG faces, rasterise them, compose
// the example strip, and record every byte that ships.
//
// The 37 faces are NOT drawn by this file. They are upstream vector artwork from
// lietxia/mahjong_graphic (pinned commit, `Vectors 矢量图/SVG/`), released upstream
// under the M+ font licence -- see LICENSES/MAHJONG-GRAPHIC-NOTICE.md and
// LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt. They are not AGPL-3.0-only and not
// MIT; only this project's own code is AGPL-3.0-only.
//
//   node scripts/generate-tile-art.mjs            # verify + write all outputs
//   node scripts/generate-tile-art.mjs --check    # verify committed outputs only
//
// Inputs (the only canonical source; nothing is read from another tree)
//   assets/tiles/<id>.svg             37 upstream faces, byte for byte
//   assets/tiles/art-provenance.json  upstream repo/commit/path/blob sha per face
//
// Outputs
//   wechat-miniprogram/assets/tiles/<id>.png           raster faces, 133x182
//   heybox-miniprogram/public/assets/tiles/<id>.png
//   wechat-miniprogram/assets/examples/hand-demo.png   synthetic example strip
//   heybox-miniprogram/public/assets/examples/hand-demo.png
//   assets/tiles/art-manifest.json    sha256 of every produced byte
//
// Uses the `sharp` devDependency (npm ci) for SVG rasterisation. The faces keep
// the upstream 19:26 viewBox aspect ratio exactly -- the pixel geometry below is
// derived from the viewBox and the run fails rather than stretch a face.

import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const TILES_DIR = path.join(project, 'assets/tiles');
const PROVENANCE_FILE = path.join(TILES_DIR, 'art-provenance.json');
const MANIFEST_FILE = path.join(TILES_DIR, 'art-manifest.json');

// ------------------------------------------------------------- tile geometry ---
// The upstream faces all share the viewBox `0 0 19 26`. A face is rendered at an
// exact integer multiple of that box, so the pixel grid matches the artwork's own
// aspect ratio and nothing is squashed: 133 = 19 x 7 and 182 = 26 x 7.
const TILE_SCALE = 7;
const EXPECTED_VIEWBOX = '0 0 19 26';

// Palette PNG at quality 85 keeps every stroke legible (the source is flat vector
// art, so quantisation is nearly lossless) and keeps the 37 faces inside the
// mini-program image budget. Measured: ~153 KiB for the whole deck.
const PNG_OPTIONS = {palette: true, quality: 85, effort: 10, compressionLevel: 9, dither: 1};

// The deck budget is enforced here so a careless quality bump fails the build
// instead of blowing the platform limit in `build:mini` (200,000 B for all images).
const DECK_BUDGET_BYTES = 155 * 1024;

// ---------------------------------------------------------------- demo strip ---
// The example strip is a *composite* of 14 faces on a green field: it is what the
// "try the sample image" button feeds to recognition. It is not a photo and not a
// screenshot. Tiles are placed at an exact 4x multiple of the viewBox (76x104).
const DEMO_TILES = ['m2', 'm3', 'm4', 'p2', 'p3', 'p4', 'p5', 'p6', 's2', 's3', 's4', 's5', 's6', 's7'];
const DEMO_TILE_SCALE = 4;
const DEMO_GAP = 2;
const DEMO_BG = {r: 43, g: 74, b: 64};
const DEMO_MARGIN_X = 8;
const DEMO_MARGIN_Y = 24;

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
/** git's own blob id: sha1("blob <len>\0" + content). */
const gitBlobSha = bytes => createHash('sha1')
  .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]))
  .digest('hex');

// -------------------------------------------------------------- canonical set ---
// Verify that every shipped SVG really is the pinned upstream file: the recorded
// sha256 must match the bytes on disk, and the CRLF-normalised bytes must hash to
// the upstream git blob id. A redrawn, recoloured or swapped face fails here.
async function loadCanonicalFaces() {
  const provenance = JSON.parse(await fs.readFile(PROVENANCE_FILE, 'utf8'));
  const artwork = provenance.artwork;
  if (!artwork?.tiles || typeof artwork.tiles !== 'object') {
    throw new Error('art-provenance.json has no artwork.tiles map; refusing to guess the deck.');
  }

  const ids = Object.keys(artwork.tiles).sort();
  if (ids.length !== 37) throw new Error('art-provenance.json lists ' + ids.length + ' faces, expected 37.');

  const faces = new Map();
  for (const id of ids) {
    const record = artwork.tiles[id];
    const file = path.join(TILES_DIR, id + '.svg');
    const bytes = await fs.readFile(file).catch(() => null);
    if (!bytes) throw new Error('Missing canonical face: assets/tiles/' + id + '.svg');

    const actual = digest(bytes);
    if (actual !== record.localSha256) {
      throw new Error(
        `Face assets/tiles/${id}.svg does not match its recorded provenance hash.\n` +
        `  recorded: ${record.localSha256}\n  actual:   ${actual}\n` +
        'The upstream artwork must ship unmodified; restore the file instead of editing it.'
      );
    }

    // Line endings are the only accepted difference from upstream: the project
    // copy is CRLF, upstream is LF. Normalising must reproduce the upstream blob.
    const normalized = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    const normalizedSha = gitBlobSha(normalized);
    if (normalizedSha !== record.upstreamGitBlobSha) {
      throw new Error(
        `Face assets/tiles/${id}.svg is not ${record.upstreamPath} from the pinned upstream commit.\n` +
        `  expected git blob: ${record.upstreamGitBlobSha}\n  normalised blob:   ${normalizedSha}`
      );
    }

    const viewBox = /viewBox="([^"]+)"/.exec(bytes.toString('utf8'));
    if (!viewBox) throw new Error('Face assets/tiles/' + id + '.svg has no viewBox.');
    if (viewBox[1].trim() !== EXPECTED_VIEWBOX) {
      throw new Error(
        `Face assets/tiles/${id}.svg has viewBox "${viewBox[1]}", expected "${EXPECTED_VIEWBOX}".\n` +
        'The raster geometry below is derived from the viewBox; update the constants deliberately.'
      );
    }

    faces.set(id, {bytes, record});
  }
  return {provenance, faces, ids};
}

// Pixel size for a face: an integer multiple of the 19:26 viewBox, never a stretch.
function faceSize(scale) {
  const [, , width, height] = EXPECTED_VIEWBOX.split(/\s+/).map(Number);
  const pixelWidth = width * scale;
  const pixelHeight = height * scale;
  if (!Number.isInteger(pixelWidth) || !Number.isInteger(pixelHeight)) {
    throw new Error('Face scale ' + scale + ' does not produce an integer pixel size.');
  }
  return {width: pixelWidth, height: pixelHeight};
}

const FACE_PNG = faceSize(TILE_SCALE);
const DEMO_PNG_TILE = faceSize(DEMO_TILE_SCALE);

// ----------------------------------------------------------------- rasteriser ---
// Render one face at the requested pixel size. `fit: 'fill'` is only reachable
// because the target size is an exact multiple of the ViewBox -- faceSize()
// guarantees the aspect ratio, so no face can be distorted here.
async function rasterizeFace(bytes, width, height, options) {
  return sharp(bytes, {density: 384})
    .resize(width, height, {fit: 'fill', kernel: 'lanczos3'})
    .png(options)
    .toBuffer();
}

async function demoStrip(faces) {
  const tileCount = DEMO_TILES.length;
  const width = tileCount * DEMO_PNG_TILE.width + (tileCount - 1) * DEMO_GAP + DEMO_MARGIN_X * 2;
  const height = DEMO_PNG_TILE.height + DEMO_MARGIN_Y * 2;
  const composites = [];
  let left = DEMO_MARGIN_X;
  const top = DEMO_MARGIN_Y;
  for (const id of DEMO_TILES) {
    const face = faces.get(id);
    if (!face) throw new Error('Example strip references an unknown face: ' + id);
    composites.push({
      input: await rasterizeFace(face.bytes, DEMO_PNG_TILE.width, DEMO_PNG_TILE.height, PNG_OPTIONS),
      left,
      top
    });
    left += DEMO_PNG_TILE.width + DEMO_GAP;
  }
  return sharp({create: {width, height, channels: 3, background: DEMO_BG}})
    .composite(composites)
    .png(PNG_OPTIONS)
    .toBuffer();
}

// ------------------------------------------------------------------- outputs ---
async function writeOrCheck(file, bytes) {
  const relative = path.relative(project, file).split(path.sep).join('/');
  if (check) {
    let existing;
    try {
      existing = await fs.readFile(file);
    } catch {
      throw new Error('Missing generated asset: ' + relative + ' (run npm run assets:tiles)');
    }
    if (!existing.equals(bytes)) {
      throw new Error('Stale generated asset: ' + relative + ' (run npm run assets:tiles)');
    }
    return;
  }
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, bytes);
}

async function main() {
  const {provenance, faces, ids} = await loadCanonicalFaces();
  const artwork = provenance.artwork;

  const pngTargets = [
    path.join(project, 'wechat-miniprogram/assets/tiles'),
    path.join(project, 'heybox-miniprogram/public/assets/tiles')
  ];
  const demoFile = 'assets/examples/hand-demo.png';
  const demoTargets = [
    path.join(project, 'wechat-miniprogram', demoFile),
    path.join(project, 'heybox-miniprogram/public', demoFile)
  ];

  const manifest = {
    version: 2,
    generator: 'scripts/generate-tile-art.mjs',
    artworkSource: {
      note: '牌面矢量图来自上游 mahjong_graphic（固定提交），按上游 M+ 字型授權條款使用，不按 AGPL/MIT 授权。',
      repository: artwork.upstream.repository,
      commit: artwork.upstream.commit,
      directory: artwork.upstream.directory,
      provenance: 'assets/tiles/art-provenance.json',
      licenseNotice: artwork.license.notice,
      licenseText: artwork.license.file
    },
    codeLicense: 'AGPL-3.0-only',
    artworkLicense: artwork.license.id,
    faces: {
      svgDirectory: 'assets/tiles',
      viewBox: EXPECTED_VIEWBOX,
      scale: TILE_SCALE,
      pngWidth: FACE_PNG.width,
      pngHeight: FACE_PNG.height,
      pngOptions: PNG_OPTIONS
    },
    tiles: {},
    examples: {}
  };

  let deckBytes = 0;
  for (const id of ids) {
    const face = faces.get(id);
    const png = await rasterizeFace(face.bytes, FACE_PNG.width, FACE_PNG.height, PNG_OPTIONS);
    deckBytes += png.length;
    for (const directory of pngTargets) await writeOrCheck(path.join(directory, id + '.png'), png);
    manifest.tiles[id] = {
      // The SVG ships as-is: this is the hash of the upstream face on disk.
      svgSha256: face.record.localSha256,
      upstreamGitBlobSha: face.record.upstreamGitBlobSha,
      pngSha256: digest(png),
      pngBytes: png.length
    };
  }

  const demo = await demoStrip(faces);
  for (const target of demoTargets) await writeOrCheck(target, demo);
  manifest.examples['hand-demo.png'] = {
    sha256: digest(demo),
    bytes: demo.length,
    tiles: DEMO_TILES,
    tilePixels: [DEMO_PNG_TILE.width, DEMO_PNG_TILE.height]
  };

  await writeOrCheck(MANIFEST_FILE, Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8'));

  console.log(
    `${check ? 'Verified' : 'Generated'} ${ids.length} upstream faces ` +
    `(${FACE_PNG.width}x${FACE_PNG.height} PNG x ${pngTargets.length} copies) + the example strip; ` +
    `deck ${(deckBytes / 1024).toFixed(1)} KiB, average ${Math.round(deckBytes / ids.length)} B per face.`
  );
  if (deckBytes > DECK_BUDGET_BYTES) {
    throw new Error(
      `Tile PNGs are ${deckBytes} B, over the ${DECK_BUDGET_BYTES} B deck budget.\n` +
      'Lower PNG_OPTIONS.quality (or the render scale) rather than shipping faces that break the platform image limit.'
    );
  }
}

await main();
