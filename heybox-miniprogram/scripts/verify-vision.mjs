// Offline verification of the shipped recognition assets.
//
// The public package ships the split model as committed data
// (src/vision/generated/**) together with the source-built ONNX Runtime WebGL
// bundle (src/vision/vendor-webgl.js). Regenerating them needs Python, onnx and
// the pinned FP16 weights (see tools/vision/README.md); building the app must not.
// This script is therefore the cold-build gate:
//
//   * the manifest parses and its candidate matches vision-selection.json;
//   * every listed resource file exists and the concatenated gzip bytes hash to
//     the recorded gzipSha256;
//   * every concatenated gzip stream inflates to exactly `bytes` bytes and hashes
//     to the recorded sha256 (so a truncated or substituted segment fails);
//   * the vendored ONNX Runtime tree still matches vendor/ort-webgl-1.30.0 and,
//     when node_modules is installed, the published onnxruntime-web package.
//
// Usage:  node scripts/verify-vision.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readSelection} from './vision-selection.mjs';
import {verifyVendor} from './build-ort-vendor.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generated = path.join(project, 'src/vision/generated');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

const selection = await readSelection(project);
const manifest = JSON.parse(await fs.readFile(path.join(generated, 'manifest.json'), 'utf8'));

if (manifest.schemaVersion !== 2) throw new Error('Unsupported generated-model manifest schema: ' + manifest.schemaVersion);
if (manifest.candidate !== selection.selected) {
  throw new Error(`Generated model candidate "${manifest.candidate}" is not the selected one ("${selection.selected}").`);
}

let resources = 0;
let compressed = 0;
for (const [kind, model] of Object.entries(manifest.models)) {
  if (!['AGPL-3.0', 'AGPL-3.0-only'].includes(model.license)) {
    throw new Error(`Model "${kind}" does not declare an AGPL licence: ${model.license}`);
  }
  for (const segment of model.segments) {
    if (!Array.isArray(segment.resources) || segment.resources.length !== segment.parts) {
      throw new Error(`Segment ${kind}#${segment.index} has an inconsistent part list.`);
    }
    const chunks = [];
    for (const resource of segment.resources) {
      const file = path.join(generated, resource);
      const source = await fs.readFile(file, 'utf8');
      const match = /export default "([A-Za-z0-9+/=]+)"/.exec(source);
      if (!match) throw new Error('Unreadable model resource: ' + resource);
      chunks.push(Buffer.from(match[1], 'base64'));
      resources++;
    }
    const gzipped = Buffer.concat(chunks);
    compressed += gzipped.length;
    if (gzipped.length !== segment.gzipBytes) {
      throw new Error(`Compressed size mismatch for ${kind}#${segment.index}: ${gzipped.length} != ${segment.gzipBytes}`);
    }
    if (digest(gzipped) !== segment.gzipSha256) {
      throw new Error(`Compressed hash mismatch for ${kind}#${segment.index}.`);
    }
    const inflated = zlib.gunzipSync(gzipped);
    if (inflated.length !== segment.bytes) {
      throw new Error(`Inflated size mismatch for ${kind}#${segment.index}: ${inflated.length} != ${segment.bytes}`);
    }
    if (digest(inflated) !== segment.sha256) {
      throw new Error(`Inflated hash mismatch for ${kind}#${segment.index}.`);
    }
  }
}

let installed = false;
try {
  await fs.access(path.join(project, 'node_modules/onnxruntime-web/package.json'));
  installed = true;
} catch {}
const problems = await verifyVendor({allowMissingInstalled: !installed});
if (problems.length) throw new Error('Vendored ONNX Runtime check failed:\n  ' + problems.join('\n  '));

const bundle = await fs.stat(path.join(project, 'src/vision/vendor-webgl.js'));
if (bundle.size < 100_000) throw new Error('src/vision/vendor-webgl.js looks truncated: ' + bundle.size + ' bytes');

console.log(
  `Verified the recognition assets: candidate "${manifest.candidate}", ` +
  `${Object.keys(manifest.models).length} graphs, ${resources} resources ` +
  `(${(compressed / 1024 / 1024).toFixed(1)} MiB gzip), ` +
  `ONNX Runtime ${manifest.models.main ? 'vendor tree' : 'vendor'}${installed ? ' + installed package' : ''}.`
);
