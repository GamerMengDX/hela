// Post-build audit of dist/ (the upload set).
//
// Fails the build when a DEV-only artifact leaked into dist, when the shipped model resources no longer match
// exactly one candidate manifest, when the shipped candidate is not the one selected in vision-selection.json
// (read through the same module scripts/build-vision.mjs uses), or when the runtime provenance drifted.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {auditManifest, readSelection} from './vision-selection.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(project, 'dist');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const RESOURCE_FILE = /^(main|aux)-s(\d{3})-(\d{3})(-[A-Za-z0-9_-]+)?\.js$/;

async function walk(dir, out = []) {
  for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(abs, out);
    else out.push(abs);
  }
  return out;
}

const files = await walk(dist);
const problems = [];
let totalBytes = 0;
const byRel = new Map();
for (const file of files) {
  const rel = path.relative(dist, file).split(path.sep).join('/');
  const bytes = await fs.readFile(file);
  totalBytes += bytes.length;
  byRel.set(rel, bytes);
}

// DEV-only markers. These strings exist only in src/dev/*, dev-gpu/*, test fixtures and 0.3.11 leftovers.
const DEV_MARKERS = [
  'hela_ui_polish_benchmark_checkpoint',
  'runVisionSmoke',
  'runSegmentSmoke',
  'hela-lifecycle-test',
  'hela-dev-variant-metadata',
  'hela-dev-cpu-canary',
  'runVariantRecognition',
  'createProductionSession',
  'GPU 验收',
  'dev-models/',
  'dev-build/',
];
for (const [rel, bytes] of byRel) {
  if (!/\.(js|mjs|html|json|css|txt|md)$/i.test(rel)) continue;
  const isModelResource = RESOURCE_FILE.test(path.basename(rel));
  const text = bytes.toString('utf8');
  for (const marker of DEV_MARKERS) {
    if (text.includes(marker)) problems.push(`DEV marker "${marker}" found in dist/${rel}`);
  }
  if (!isModelResource) {
    // No multi-kilobyte base64 blob may reach a non-model file (fixtures are megabytes of base64).
    const blob = /[A-Za-z0-9+/]{8192,}={0,2}/.exec(text);
    if (blob) problems.push(`unexpected ${blob[0].length}-char base64 literal in dist/${rel}`);
  }
}
for (const forbidden of ['dev-models', 'dev-build', 'dev-gpu', 'fixtures', 'node_modules', 'async-readback', 'filter-decoder', 'profile-webgl', 'filter-profile']) {
  const leaked = [...byRel.keys()].filter((rel) => rel.split('/').includes(forbidden));
  if (leaked.length) problems.push(`DEV path in dist: ${leaked.slice(0, 5).join(', ')}`);
}

// Exactly one candidate model set, matching its own manifest hashes.
const manifestPath = path.join(dist, 'vision/model-manifest.json');
const segments = {};
let manifest;
try {
  manifest = JSON.parse((await fs.readFile(manifestPath)).toString('utf8'));
} catch {
  problems.push('dist/vision/model-manifest.json is missing');
}
// The selected candidate comes from the same module the build reads; nothing here may hardcode A or B.
const selection = await readSelection(project);
if (manifest) {
  // Structure, fixed graph (weights/operators), 640 input and the segmentation limits of the *selected* policy.
  problems.push(...auditManifest(manifest, selection.selected).map((problem) => `dist: ${problem}`));

  const shippedResources = new Map();
  for (const rel of byRel.keys()) {
    const match = RESOURCE_FILE.exec(path.basename(rel));
    if (!match) continue;
    const base = `${match[1]}-s${match[2]}-${match[3]}.js`;
    if (shippedResources.has(base)) problems.push(`duplicate model resource for ${base}: ${rel}`);
    shippedResources.set(base, rel);
  }
  const expected = new Set();
  for (const [kind, model] of Object.entries(manifest.models)) {
    if (!Array.isArray(model.segments) || !model.segments.length) problems.push(`model ${kind} has no segments`);
    segments[kind] = model.segments.length;
    for (const segment of model.segments) {
      const chunks = [];
      for (const resource of segment.resources) {
        expected.add(resource);
        const rel = shippedResources.get(resource);
        if (!rel) {
          problems.push(`dist is missing model resource ${resource}`);
          continue;
        }
        const text = byRel.get(rel).toString('utf8');
        const payload = /[A-Za-z0-9+/]{16,}={0,2}/.exec(text);
        if (!payload) {
          problems.push(`dist resource ${rel} carries no base64 payload`);
          continue;
        }
        chunks.push(Buffer.from(payload[0], 'base64'));
      }
      if (chunks.length === segment.parts && digest(Buffer.concat(chunks)) !== segment.gzipSha256) {
        problems.push(`dist ${kind} segment ${segment.index} does not match its manifest gzip hash`);
      }
    }
  }
  for (const base of shippedResources.keys()) {
    if (!expected.has(base)) problems.push(`dist contains a model resource no manifest describes: ${base}`);
  }

  const provenancePath = path.join(dist, 'vision/runtime-provenance.json');
  try {
    const provenance = JSON.parse((await fs.readFile(provenancePath)).toString('utf8'));
    if (provenance.runtime.version !== '1.30.0') problems.push('runtime provenance is not ONNX Runtime 1.30.0');
    if (provenance.runtime.license !== 'MIT') problems.push('runtime provenance lost the MIT license record');
    if (!provenance.build.patchedFiles) problems.push('runtime provenance reports no applied lifecycle patch');
    if (!/registerBackend/.test(provenance.build.backendRegistration || '')) {
      problems.push('runtime provenance does not document the onnxruntime-common backend registration');
    }
    if (!provenance.build.patchSha256) problems.push('runtime provenance is missing the patch hash');
    if (provenance.build.readback !== 'sync') {
      problems.push(`dist ships readback=${provenance.build.readback}; production must be the sync flavor`);
    }
    if (provenance.build.decode !== 'gather') {
      problems.push(`dist ships decode=${provenance.build.decode}; production must use the gather decoder`);
    }
    if (provenance.build.profile) problems.push('dist ships the DEV prototype profile instrumentation');
    if ((provenance.build.flavorOverlay || []).length) problems.push('dist ships a DEV-only runtime flavor overlay');
  } catch {
    problems.push('dist/vision/runtime-provenance.json is missing');
  }
  for (const required of ['vision/ONNXRUNTIME-MIT.txt', 'vision/VISION-MODEL-AGPL.txt', 'vision/VISION-UPSTREAM-MIT.txt']) {
    if (!byRel.has(required)) problems.push(`dist is missing ${required}`);
  }
}

console.log(`dist: ${files.length} files, ${(totalBytes / 2 ** 20).toFixed(2)} MiB`);
console.log(`selection: ${selection.selected} (${selection.candidate.label}, source ${selection.source})`);
if (manifest) {
  console.log(
    `model candidate ${manifest.candidate}: ${Object.entries(segments)
      .map(([kind, count]) => `${kind} ${count}`)
      .join(' + ')} segments (policy ${manifest.splitPolicy.maxNodes} nodes / ${(manifest.splitPolicy.maxOutputBytes / 2 ** 20).toFixed(0)} MiB)`,
  );
}
if (problems.length) {
  console.error('dist audit failed:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(
  `dist audit passed: single candidate ${selection.selected} (matches the selection), all segment hashes match, ` +
    'no DEV fixtures/benchmark/extra candidates.',
);
