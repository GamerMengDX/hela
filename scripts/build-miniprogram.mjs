#!/usr/bin/env node
// Build the native WeChat mini-program in this package.
//
// The shared engine, teaching model and catalogs are bundled from `src/` into
// two CommonJS files the mini-program requires at runtime:
//
//   wechat-miniprogram/utils/core.js        engine + data + hand input + teaching
//   wechat-miniprogram/utils/i18n-core.js   catalogs + presenters (reusing core.js)
//
// Everything is resolved relative to this script, so the package builds from any
// working directory and never reads a parent checkout. The mini-program imports
// no npm package at runtime; only the build needs esbuild and the majiang-core
// licence that is copied next to it.
//
// Usage:  node scripts/build-miniprogram.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {validateCatalogs} from '../src/i18n/catalogs.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(packageRoot, 'wechat-miniprogram');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

const catalogs = validateCatalogs();
if (!catalogs.ok) throw new Error('Translation catalogs are invalid:\n' + catalogs.errors.join('\n'));
if (catalogs.count < 500) throw new Error('Catalog looks truncated: only ' + catalogs.count + ' keys.');

await fs.mkdir(path.join(target, 'utils'), {recursive: true});

await build({
  entryPoints: [path.join(packageRoot, 'src/miniprogram-core.js')],
  bundle: true,
  platform: 'neutral',
  format: 'cjs',
  outfile: path.join(target, 'utils/core.js'),
  target: ['es2018'],
  minify: true,
  legalComments: 'eof'
});

// Reuse the existing native engine bundle instead of packaging Mahjong twice.
const canonicalCoreModules = new Set(['src/engine.js', 'src/data.js'].map(file => path.join(packageRoot, file)));
const reuseNativeCore = {
  name: 'reuse-native-core',
  setup(builder) {
    builder.onResolve({filter: /^\.\.?\/.*\.js$/}, args => {
      const resolved = path.resolve(args.resolveDir, args.path);
      return canonicalCoreModules.has(resolved) ? {path: './core.js', external: true} : undefined;
    });
  }
};

await build({
  entryPoints: [path.join(packageRoot, 'src/i18n/native-entry.js')],
  bundle: true,
  platform: 'neutral',
  format: 'cjs',
  outfile: path.join(target, 'utils/i18n-core.js'),
  target: ['es2018'],
  minify: true,
  legalComments: 'eof',
  plugins: [reuseNativeCore]
});

await fs.copyFile(
  path.join(packageRoot, 'node_modules/@kobalab/majiang-core/LICENSE'),
  path.join(target, 'MAJIANG-LICENSE.txt')
);

// The tile faces must be the generated artwork recorded in assets/tiles, never a
// stray copy of some other deck.
const artManifest = JSON.parse(await fs.readFile(path.join(packageRoot, 'assets/tiles/art-manifest.json'), 'utf8'));
for (const [id, record] of Object.entries(artManifest.tiles)) {
  const file = path.join(target, 'assets/tiles', id + '.png');
  if (digest(await fs.readFile(file)) !== record.pngSha256) {
    throw new Error('Tile face does not match the generated artwork manifest: ' + id + '.png (run npm run assets:tiles)');
  }
}

async function size(directory) {
  let total = 0;
  for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await size(file);
    else total += (await fs.stat(file)).size;
  }
  return total;
}

async function pictureSize(directory) {
  let bytes = 0, count = 0;
  for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const next = await pictureSize(file);
      bytes += next.bytes; count += next.count;
    } else if (/\.(png|jpe?g|webp|gif|bmp|svg|avif)$/i.test(entry.name)) {
      bytes += (await fs.stat(file)).size; count++;
    }
  }
  return {bytes, count};
}

const config = JSON.parse(await fs.readFile(path.join(target, 'app.json'), 'utf8'));
const packages = [];
for (const entry of config.subPackages || []) {
  const bytes = await size(path.join(target, entry.root));
  if (bytes >= 1_500_000) throw new Error('Subpackage exceeds the 1.5 MB budget: ' + entry.root);
  packages.push({root: entry.root, bytes});
}
const bytes = await size(target);
const main = bytes - packages.reduce((sum, entry) => sum + entry.bytes, 0);
const pictures = await pictureSize(target);
if (pictures.bytes >= 200_000) throw new Error('Mini-program images exceed the 200,000-byte budget: ' + pictures.bytes);
if (main >= 2 * 1024 * 1024) throw new Error('Main package exceeds 2 MiB.');
if (main >= 1_500_000) throw new Error('Main package exceeds the 1.5 MB budget.');
if (bytes >= 30 * 1024 * 1024) throw new Error('Total native package exceeds 30 MiB.');

console.log(
  `WeChat mini-program built · main package ${(main / 1024).toFixed(0)} KiB · ` +
  `${packages.length} model subpackages · total ${(bytes / 1024 / 1024).toFixed(2)} MiB · ` +
  `${pictures.count} images = ${pictures.bytes.toLocaleString('en-US')} bytes · ` +
  `catalogs ${catalogs.count} keys`
);
console.log(
  `Largest subpackage ${Math.max(0, ...packages.map(entry => entry.bytes)).toLocaleString('en-US')} bytes; ` +
  `main package and every subpackage stay below 1,500,000 bytes.`
);
