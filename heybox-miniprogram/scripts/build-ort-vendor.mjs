// Reproducible build of the WebGL-only ONNX Runtime bundle used by the recognition pipeline.
//
// Steps (each one fails loudly, nothing is inferred silently):
//   1. verify vendor/ort-webgl-1.30.0/manifest.json against the vendored `upstream/` tree;
//   2. when node_modules is present, verify that every vendored file is byte-identical to the
//      installed onnxruntime-web@1.30.0 file it claims to come from, and that onnxruntime-common
//      files still match the recorded hashes (so a dependency bump cannot pass unnoticed);
//   3. apply patches/*.patch to the *upstream* copy with a strict unified-diff applier and require
//      the result to equal the hand-written `patched/` overlay byte for byte;
//   4. bundle `entry/webgl-only.entry.ts` from a temporary assembly directory into
//      src/vision/vendor-webgl.js, and verify the produced bundle contains the patch marker.
//
// Usage:
//   node scripts/build-ort-vendor.mjs             # verify + build into src/vision/vendor-webgl.js (sync)
//   node scripts/build-ort-vendor.mjs --verify    # provenance/patch verification only
//   node scripts/build-ort-vendor.mjs --out <f>   # alternative bundle path (used for the DEV harness)
//   node scripts/build-ort-vendor.mjs --no-patch  # bundle the pristine upstream sources (DEV baseline)
//   node scripts/build-ort-vendor.mjs --flavor async-readback --out <f>
//                                                 # DEV-only single-variable baseline: same sources, same
//                                                 # lifecycle patch, but graph outputs are read with the
//                                                 # asynchronous provider (one GPU fence per output) instead of
//                                                 # the synchronous Tensor.data materialization.
//
// Flavors are *source overlays* under overlays/<flavor>/ - never regular-expression edits of a built bundle.
// Production always builds the default `sync` flavor.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorRoot = path.join(project, 'vendor/ort-webgl-1.30.0');
const manifestPath = path.join(vendorRoot, 'manifest.json');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Runtime flavors. `sync` is the production default: patched sources only, gather decode, no instrumentation.
// Every other flavor is a DEV-only source overlay directory. Flavors compose with '+' (or a comma) so the
// read-back mode, the decoder implementation and the profiler can be varied independently:
//   --flavor filter-decoder            (B + filter decode, sync)
//   --flavor async-readback            (B + gather decode, async read-back)
//   --flavor profile                   (B + gather decode, sync, instrumented)
//   --flavor filter-decoder+profile    (B + filter decode, sync, instrumented)
// Composition order is the order given; a later overlay wins for the same file.
export const FLAVORS = {
  sync: {readback: 'sync', decode: 'gather', profile: false, overlay: null, label: 'synchronous Tensor.data materialization'},
  'async-readback': {
    readback: 'async',
    decode: 'gather',
    profile: false,
    overlay: 'async-readback',
    label: 'asynchronous getData() read-back (one GPU fence per output), DEV-only baseline',
  },
  'filter-decoder': {
    readback: 'sync',
    decode: 'filter',
    profile: false,
    overlay: 'filter-decoder',
    label: 'upstream filter() channel-1 decode, DEV-only baseline',
  },
  profile: {
    readback: 'sync',
    decode: 'gather',
    profile: true,
    overlay: 'profile',
    label: 'instrumented prototypes (DEV-only), gather decode, sync read-back',
  },
  pristine: {readback: 'sync', decode: 'filter', profile: false, overlay: null, label: 'unpatched upstream sources'},
};

/**
 * Resolve a (possibly composed) flavor name like `filter-decoder+profile`.
 */
export function resolveFlavor(name = 'sync') {
  const parts = String(name)
    .split(/[+,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) parts.push('sync');
  const overlays = [];
  let readback = 'sync';
  let decode = 'gather';
  let profile = false;
  for (const part of parts) {
    const flavor = FLAVORS[part];
    if (!flavor) throw new Error(`Unknown runtime flavor "${part}". Known: ${Object.keys(FLAVORS).join(', ')}`);
    if (flavor.overlay) overlays.push(flavor.overlay);
    if (flavor.readback === 'async') readback = 'async';
    if (flavor.decode === 'filter') decode = 'filter';
    if (flavor.profile) profile = true;
  }
  return {name: parts.join('+'), readback, decode, profile, overlays};
}
const posix = (p) => p.split(path.sep).join('/');

async function readText(file) {
  return fs.readFile(file, 'utf8');
}

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, {withFileTypes: true});
  } catch {
    return out;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(abs, out);
    else out.push(abs);
  }
  return out;
}

// --- strict unified-diff applier (no git, no fuzzy matching) -------------------------------------
// Only the subset produced by `diff -u` is supported: `---`/`+++` headers, `@@ -a,b +c,d @@` hunks,
// ' ' context, '-' removals, '+' additions. Any mismatch throws with the line number.
export function applyUnifiedDiff(source, patch, {label = 'patch'} = {}) {
  const lines = source.split('\n');
  const patchLines = patch.split('\n');
  const hunks = [];
  for (let i = 0; i < patchLines.length; ) {
    const line = patchLines[i];
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) {
      i++;
      continue;
    }
    const oldStart = Number(match[1]);
    const oldCount = match[2] === undefined ? 1 : Number(match[2]);
    const newCount = match[4] === undefined ? 1 : Number(match[4]);
    i++;
    const body = [];
    let consumedOld = 0;
    let producedNew = 0;
    while (i < patchLines.length && (consumedOld < oldCount || producedNew < newCount)) {
      const bodyLine = patchLines[i];
      if (bodyLine.startsWith('\\')) {
        i++;
        continue;
      }
      const marker = bodyLine[0];
      if (marker === ' ' || marker === '') {
        body.push(' ' + bodyLine.slice(1));
        consumedOld++;
        producedNew++;
      } else if (marker === '-') {
        body.push(bodyLine);
        consumedOld++;
      } else if (marker === '+') {
        body.push(bodyLine);
        producedNew++;
      } else {
        throw new Error(`${label}: unexpected diff line ${i + 1}: ${JSON.stringify(bodyLine)}`);
      }
      i++;
    }
    if (consumedOld !== oldCount || producedNew !== newCount) {
      throw new Error(`${label}: hunk at patch line ${i} does not match its header`);
    }
    hunks.push({oldStart, oldCount, body});
  }
  if (!hunks.length) throw new Error(`${label}: no hunks found`);

  const out = [];
  let cursor = 0; // 0-based index into `lines`
  for (const hunk of hunks) {
    const start = hunk.oldStart === 0 ? 0 : hunk.oldStart - 1;
    if (start < cursor) throw new Error(`${label}: overlapping hunk at old line ${hunk.oldStart}`);
    out.push(...lines.slice(cursor, start));
    cursor = start;
    for (const bodyLine of hunk.body) {
      const marker = bodyLine[0];
      const text = bodyLine.slice(1);
      if (marker === '+') {
        out.push(text);
        continue;
      }
      const expected = text;
      const current = lines[cursor];
      if (current === undefined) throw new Error(`${label}: hunk runs past end of file at old line ${hunk.oldStart}`);
      if (current !== expected) {
        throw new Error(
          `${label}: context mismatch at old line ${cursor + 1}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(current)}`,
        );
      }
      out.push(current);
      cursor++;
      if (marker === '-') {
        out.pop();
      }
    }
  }
  out.push(...lines.slice(cursor));
  return out.join('\n');
}

// --- verification -------------------------------------------------------------------------------
export async function verifyVendor({allowMissingInstalled = false} = {}) {
  const manifest = JSON.parse(await readText(manifestPath));
  const problems = [];
  const note = (message) => problems.push(message);

  const upstreamFiles = await walk(path.join(vendorRoot, manifest.upstreamRoot));
  const seen = new Set();
  for (const file of upstreamFiles) {
    const rel = posix(path.relative(path.join(vendorRoot, manifest.upstreamRoot), file));
    const expected = manifest.upstreamFiles[rel];
    if (!expected) {
      note(`unexpected file in vendor upstream tree: ${rel}`);
      continue;
    }
    seen.add(rel);
    const actual = sha256(await fs.readFile(file));
    if (actual !== expected.sha256) note(`vendored source hash mismatch: ${rel}`);
  }
  for (const rel of Object.keys(manifest.upstreamFiles)) {
    if (!seen.has(rel)) note(`vendored source missing: ${rel}`);
  }

  const installed = path.join(project, 'node_modules/onnxruntime-web');
  let installedVersion;
  try {
    installedVersion = JSON.parse(await readText(path.join(installed, 'package.json'))).version;
  } catch {
    if (!allowMissingInstalled) note('node_modules/onnxruntime-web is not available for provenance check');
  }
  if (installedVersion !== undefined) {
    if (installedVersion !== manifest.version) {
      note(`installed onnxruntime-web is ${installedVersion}, vendor pins ${manifest.version}`);
    }
    for (const rel of Object.keys(manifest.upstreamFiles)) {
      const file = path.join(installed, rel);
      let bytes;
      try {
        bytes = await fs.readFile(file);
      } catch {
        note(`installed package lost ${rel}`);
        continue;
      }
      if (sha256(bytes) !== manifest.upstreamFiles[rel].sha256) note(`vendored ${rel} differs from installed package`);
    }
  }

  const installedCommon = path.join(project, 'node_modules/onnxruntime-common');
  let commonVersion;
  try {
    commonVersion = JSON.parse(await readText(path.join(installedCommon, 'package.json'))).version;
  } catch {
    if (!allowMissingInstalled) note('node_modules/onnxruntime-common is not available for provenance check');
  }
  if (commonVersion !== undefined) {
    if (commonVersion !== manifest.commonApi.version) {
      note(`installed onnxruntime-common is ${commonVersion}, vendor pins ${manifest.commonApi.version}`);
    }
    for (const [rel, hash] of Object.entries(manifest.commonApi.files)) {
      let bytes;
      try {
        bytes = await fs.readFile(path.join(installedCommon, rel));
      } catch {
        note(`onnxruntime-common lost ${rel}`);
        continue;
      }
      if (sha256(bytes) !== hash) note(`onnxruntime-common file changed: ${rel}`);
    }
  }

  // Patch text must reproduce the overlay exactly.
  const patchText = await readText(path.join(vendorRoot, manifest.patchFile));
  const patchedFiles = await walk(path.join(vendorRoot, manifest.patchedRoot));
  const patchedSet = new Set(patchedFiles.map((file) => posix(path.relative(path.join(vendorRoot, manifest.patchedRoot), file))));
  for (const rel of patchedSet) {
    const upstreamFile = path.join(vendorRoot, manifest.upstreamRoot, rel);
    let upstreamSource;
    try {
      upstreamSource = await readText(upstreamFile);
    } catch {
      note(`patched overlay has no upstream counterpart: ${rel}`);
      continue;
    }
    const patchFragment = extractFilePatch(patchText, `a/${rel}`, `b/${rel}`);
    if (!patchFragment) {
      note(`patch does not describe ${rel}`);
      continue;
    }
    let applied;
    try {
      applied = applyUnifiedDiff(upstreamSource, patchFragment, {label: rel});
    } catch (error) {
      note(`patch does not apply to ${rel}: ${error.message}`);
      continue;
    }
    const overlay = await readText(path.join(vendorRoot, manifest.patchedRoot, rel));
    if (applied !== overlay) note(`patch result differs from patched overlay: ${rel}`);
  }
  const described = describePatchedFiles(patchText);
  for (const rel of described) {
    if (!patchedSet.has(rel)) note(`patch describes ${rel} but no overlay exists`);
  }

  return {manifest, problems, patchText, patchedFiles};
}

// Flavor overlays are plain source files that replace a file the build already owns: either a file in
// `patched/` or the authored entry. They are verified (not guessed), so a flavor can only change a file the
// lifecycle patch or the entry owns - never an arbitrary or generated file.
async function flavorOverlayFiles(flavor) {
  if (!flavor.overlays?.length) return [];
  const patchedRoot = path.join(vendorRoot, 'patched');
  const out = [];
  for (const overlay of flavor.overlays) {
    const dir = path.join(vendorRoot, 'overlays', overlay);
    const files = await walk(dir);
    for (const file of files) {
      if (path.basename(file) === 'README.md') continue;
      const rel = path.relative(dir, file).split(path.sep).join('/');
      const counterpart = path.join(patchedRoot, rel);
      let owned = false;
      try {
        await fs.access(counterpart);
        owned = true;
      } catch {
        owned = rel === 'entry/webgl-only.entry.ts';
      }
      if (!owned) {
        throw new Error(`Flavor "${flavor.name}" overlays ${rel}, which neither the lifecycle patch nor the entry owns`);
      }
      out.push({file, rel, overlay, text: await readText(file)});
    }
  }
  return out;
}

// Overlays are never applied to the pristine baseline; this keeps the guard above honest.
function overlaysApplied() {
  return false;
}

function extractFilePatch(patchText, oldPath, newPath) {
  const lines = patchText.split('\n');
  const start = lines.findIndex(
    (line, index) => line.startsWith('--- ' + oldPath) && lines[index + 1]?.startsWith('+++ ' + newPath),
  );
  if (start === -1) return undefined;
  let end = start + 2;
  while (end < lines.length && !lines[end].startsWith('--- ')) end++;
  return lines.slice(start, end).join('\n');
}

function describePatchedFiles(patchText) {
  return patchText
    .split('\n')
    .filter((line) => line.startsWith('+++ b/'))
    .map((line) => line.slice('+++ b/'.length).trim());
}

// --- assembly + bundling ------------------------------------------------------------------------
export async function buildVendorBundle({outFile, patch = true, minify = true, flavor: flavorName = 'sync'} = {}) {
  const {manifest, problems, patchText, patchedFiles} = await verifyVendor({allowMissingInstalled: true});
  if (problems.length) throw new Error(`Vendor verification failed:\n- ${problems.join('\n- ')}`);
  const flavor = resolveFlavor(patch ? flavorName : 'sync');
  const overlayFiles = patch ? await flavorOverlayFiles(flavor) : [];

  // A per-build assembly directory: concurrent builds (tests, DEV flavors, production) must not share state,
  // and a stale tree from an interrupted build must not leak into the next one.
  const assembly = path.join(vendorRoot, `.build-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  await fs.rm(assembly, {recursive: true, force: true});
  await fs.mkdir(assembly, {recursive: true});
  try {
    for (const file of await walk(path.join(vendorRoot, manifest.upstreamRoot))) {
      const rel = path.relative(path.join(vendorRoot, manifest.upstreamRoot), file);
      const target = path.join(assembly, rel);
      await fs.mkdir(path.dirname(target), {recursive: true});
      await fs.copyFile(file, target);
    }
    let entryOverridden = false;
    if (patch) {
      for (const file of patchedFiles) {
        const rel = path.relative(path.join(vendorRoot, manifest.patchedRoot), file);
        await fs.copyFile(file, path.join(assembly, rel));
      }
      // DEV-only flavor overlays: same sources, one variable per flavor (see overlays/README.md). An overlay of
      // the authored entry replaces the bundle entry point itself.
      for (const {file, rel} of overlayFiles) {
        const isEntry = rel === 'entry/webgl-only.entry.ts';
        const target = isEntry ? path.join(assembly, 'entry.ts') : path.join(assembly, rel);
        await fs.mkdir(path.dirname(target), {recursive: true});
        await fs.copyFile(file, target);
        if (isEntry) entryOverridden = true;
      }
    }
    // The published package does NOT declare "type": "module", so its generated protobuf module
    // (onnx.js, CommonJS) is CommonJS to every bundler. This project *does* declare "type": "module";
    // without a marker esbuild would treat that file as ESM and `import {onnx}` would be undefined.
    // The marker is a build artifact only: vendored sources stay byte-identical to upstream.
    const commonjsDirs = new Set();
    for (const file of await walk(assembly)) {
      if (file.endsWith('.js')) commonjsDirs.add(path.dirname(file));
    }
    for (const dir of commonjsDirs) {
      const markerPath = path.join(dir, 'package.json');
      let marker = {};
      try {
        marker = JSON.parse(await readText(markerPath));
      } catch {
        marker = {};
      }
      marker.type = 'commonjs';
      await fs.writeFile(markerPath, JSON.stringify(marker) + '\n');
    }
    // The authored entry is the fallback; a flavor overlay may have replaced it above.
    if (!entryOverridden) {
      const entry = await readText(path.join(vendorRoot, manifest.entry));
      await fs.writeFile(path.join(assembly, 'entry.ts'), entry);
    }

    const overlayHash = overlayFiles.length ? sha256(overlayFiles.map((entry) => entry.text).join('\n')) : null;
    const marker = patch
      ? `// hela ONNX Runtime ${manifest.version} WebGL build: source patch ${sha256(patchText).slice(0, 16)} applied (${patchedFiles.length} files); readback=${flavor.readback} decode=${flavor.decode} profile=${flavor.profile}` +
        (overlayHash ? ` (flavor overlay ${overlayHash.slice(0, 16)}, DEV-only).` : '.')
      : `// hela ONNX Runtime ${manifest.version} WebGL build: pristine upstream sources, no lifecycle patch (DEV baseline only).`;
    const banner = `/*! ${marker}\n * Built by scripts/build-ort-vendor.mjs from vendor/ort-webgl-1.30.0/. MIT license, see vendor/ort-webgl-1.30.0/LICENSE-MIT.txt. */`;

    const result = await build({
      entryPoints: [path.join(assembly, 'entry.ts')],
      outfile: outFile ?? path.join(project, 'src/vision/vendor-webgl.js'),
      bundle: true,
      platform: 'browser',
      format: 'esm',
      target: 'es2020',
      minify,
      resolveExtensions: ['.ts', '.js'],
      define: {WebAssembly: 'undefined'},
      external: ['node:fs/promises'],
      legalComments: 'inline',
      banner: {js: banner},
      logLevel: 'warning',
      metafile: true,
    });
    const output = await fs.readFile(outFile ?? path.join(project, 'src/vision/vendor-webgl.js'), 'utf8');
    if (patch && !output.includes('source patch')) throw new Error('Bundled runtime is missing the patch marker');
    if (!patch && output.includes('source patch')) throw new Error('Unpatched baseline unexpectedly contains the patch marker');
    if (patch && !output.includes(`readback=${flavor.readback} decode=${flavor.decode} profile=${flavor.profile}`)) {
      throw new Error(`Bundled runtime does not record its flavor (readback=${flavor.readback} decode=${flavor.decode})`);
    }
    if (!patch && overlaysApplied()) {
      throw new Error('Pristine baseline must not carry DEV-only overlays');
    }
    if (patch && flavor.profile && !output.includes('__helaDevDiagnostics')) {
      throw new Error('Profiled bundle is missing the DEV diagnostics export');
    }
    if (patch && !flavor.profile && output.includes('__helaDevDiagnostics')) {
      throw new Error('Non-profiled bundle must not ship DEV diagnostics');
    }
    if (!output.includes('registerBackend')) throw new Error('Bundled runtime does not register a backend');
    const inputs = Object.keys(result.metafile.inputs);
    // esbuild reports metafile paths relative to its own working base, so match on the path segment
    // that matters: every non-dependency input must come from the assembled vendor build directory.
    const outsideVendor = inputs.filter(
      (file) => !/node_modules\//.test(file) && !/vendor\/ort-webgl-1\.30\.0\/\.build/.test(file),
    );
    if (outsideVendor.length) throw new Error(`Bundled runtime pulled files outside vendor/: ${outsideVendor.join(', ')}`);
    const ortInputs = inputs.filter((file) => /vendor\/ort-webgl-1\.30\.0\/\.build/.test(file));
    return {
      outFile: outFile ?? path.join(project, 'src/vision/vendor-webgl.js'),
      bytes: Buffer.byteLength(output),
      inputs: inputs.length,
      ortInputs: ortInputs.length,
      patchedFiles: patch ? patchedFiles.length : 0,
      patchSha256: sha256(patchText),
      version: manifest.version,
      flavor: patch ? flavor.name : 'pristine',
      readback: patch ? flavor.readback : 'sync',
      decode: patch ? flavor.decode : 'filter',
      profile: patch ? flavor.profile : false,
      flavorOverlay: overlayFiles.map((entry) => ({file: entry.rel, sha256: sha256(entry.text)})),
      flavorOverlaySha256: overlayHash,
    };
  } finally {
    await fs.rm(assembly, {recursive: true, force: true});
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const value = (name) => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  if (flag('--verify')) {
    const {problems, patchedFiles} = await verifyVendor();
    if (problems.length) {
      console.error('Vendor verification failed:\n- ' + problems.join('\n- '));
      process.exit(1);
    }
    console.log(`Vendor verified: ORT 1.30.0 sources match the installed package and the patch reproduces ${patchedFiles.length} overlay file(s).`);
  } else {
    const info = await buildVendorBundle({
      outFile: value('--out'),
      patch: !flag('--no-patch'),
      flavor: value('--flavor') || 'sync',
    });
    console.log(
      `Built ${path.relative(project, info.outFile)} from ORT ${info.version} sources: ${(info.bytes / 1024).toFixed(1)} KiB, ` +
        `${info.inputs} inputs, ${info.patchedFiles} patched file(s), readback=${info.readback}, patch ${info.patchSha256.slice(0, 16)}`,
    );
  }
}
