// Freeze the ONNX Runtime Web 1.30.0 WebGL source closure into vendor/.
//
// Reads the *unmodified* installed package (node_modules/onnxruntime-web), never writes to it, and
// copies the published TypeScript sources of the onnx.js (WebGL) backend. The resulting `upstream/`
// tree is byte-identical to the published 1.30.0 sources; `manifest.json` records the sha256 of every
// file so a later build can prove the closure was not edited silently.
//
// Run: node scripts/vendor-ort-source.mjs
// Re-run only when the pinned runtime version changes on purpose.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendorRoot = path.join(project, 'vendor/ort-webgl-1.30.0');
const upstreamDir = path.join(vendorRoot, 'upstream');
const installed = path.join(project, 'node_modules/onnxruntime-web');
const installedCommon = path.join(project, 'node_modules/onnxruntime-common');
const PINNED_VERSION = '1.30.0';

const sha256 = async (file) => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const posix = (p) => p.split(path.sep).join('/');

async function walk(dir, suffix) {
  const out = [];
  const entries = await fs.readdir(dir, {withFileTypes: true});
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(abs, suffix)));
    else if (entry.name.endsWith(suffix)) out.push(abs);
  }
  return out;
}

const pkg = JSON.parse(await fs.readFile(path.join(installed, 'package.json'), 'utf8'));
if (pkg.version !== PINNED_VERSION) throw new Error(`Expected onnxruntime-web ${PINNED_VERSION}, found ${pkg.version}`);
const commonPkg = JSON.parse(await fs.readFile(path.join(installedCommon, 'package.json'), 'utf8'));
if (commonPkg.version !== PINNED_VERSION) throw new Error(`Expected onnxruntime-common ${PINNED_VERSION}, found ${commonPkg.version}`);

// Every TypeScript source of the onnx.js (WebGL) backend, plus the generated protobuf module, which
// is the only reachable file that ships without a .ts twin. Compiled .js twins and .map files of the
// same directory are deliberately excluded so resolution can never silently pick a compiled file.
const sources = [
  ...(await walk(path.join(installed, 'lib/onnxjs'), '.ts')),
  path.join(installed, 'lib/backend-onnxjs.ts'),
  path.join(installed, 'lib/version.ts'),
  path.join(installed, 'lib/onnxjs/ort-schema/protobuf/onnx.js'),
];

await fs.rm(upstreamDir, {recursive: true, force: true});
const files = {};
for (const source of sources) {
  const rel = posix(path.relative(installed, source));
  const target = path.join(upstreamDir, rel);
  await fs.mkdir(path.dirname(target), {recursive: true});
  await fs.copyFile(source, target);
  files[rel] = {sha256: await sha256(target), bytes: (await fs.stat(target)).size};
}

// The local entry is the only file we author ourselves. It reuses the same onnxruntime-common
// public registry (registerBackend) as the upstream `ort.webgl` bundle, so no private export is
// used and no compressed bundle is rewritten by regex.
const entrySource = `// Authored for hela 0.3.12. WebGL-only ONNX Runtime entry, source-built from vendor/ort-webgl-${PINNED_VERSION}.
// Mirrors upstream lib/index.ts for the WebGL backend only, using the public onnxruntime-common API.
export * from 'onnxruntime-common';
import * as ort from 'onnxruntime-common';
export default ort;

import {env, registerBackend} from 'onnxruntime-common';
import {onnxjsBackend} from './lib/backend-onnxjs';
import {version} from './lib/version';

registerBackend('webgl', onnxjsBackend, -10);
Object.defineProperty(env.versions, 'web', {value: version, enumerable: true});
`;
await fs.mkdir(path.join(vendorRoot, 'entry'), {recursive: true});
await fs.writeFile(path.join(vendorRoot, 'entry/webgl-only.entry.ts'), entrySource);

// The public API surface (registry, env, Tensor, InferenceSession) is intentionally NOT vendored:
// the build resolves the same installed onnxruntime-common copy the rest of the app uses, so there
// is exactly one backend registry in the bundle. Its hashes are recorded here for auditability.
const commonFiles = {};
for (const file of await walk(path.join(installedCommon, 'dist/esm'), '.js')) {
  commonFiles[posix(path.relative(installedCommon, file))] = await sha256(file);
}
const runtimeDependencies = {};
for (const name of [
  '@protobufjs/aspromise',
  '@protobufjs/base64',
  '@protobufjs/eventemitter',
  '@protobufjs/float',
  '@protobufjs/pool',
  '@protobufjs/utf8',
  'flatbuffers',
  'guid-typescript',
  'long',
  'protobufjs',
]) {
  const meta = JSON.parse(await fs.readFile(path.join(project, 'node_modules', name, 'package.json'), 'utf8'));
  runtimeDependencies[name] = meta.version;
}

const manifest = {
  schemaVersion: 1,
  package: 'onnxruntime-web',
  version: PINNED_VERSION,
  packageLicense: pkg.license,
  repository: pkg.repository?.url,
  licenseFile: 'LICENSE-MIT.txt',
  entry: 'entry/webgl-only.entry.ts',
  upstreamRoot: 'upstream',
  patchedRoot: 'patched',
  patchFile: 'patches/0001-resource-lifecycle.patch',
  buildScript: 'scripts/build-ort-vendor.mjs',
  provenance: {
    source: 'unmodified installed node_modules/onnxruntime-web@1.30.0 sources (lib/onnxjs/**, lib/backend-onnxjs.ts, lib/version.ts)',
    compiledTwinsExcluded: 'lib/**/*.js and *.map of the same modules are not vendored, so .ts-first resolution is unambiguous',
    backendRegistration: 'onnxruntime-common registerBackend("webgl", onnxjsBackend, -10), the same public API upstream lib/index.ts uses',
    notUsed: 'no private package exports, no regex editing of dist bundles, no node_modules writes',
  },
  commonApi: {
    package: 'onnxruntime-common',
    version: commonPkg.version,
    resolvedFrom: 'node_modules/onnxruntime-common/dist/esm',
    files: commonFiles,
  },
  runtimeDependencies,
  upstreamFiles: files,
  upstreamFileCount: Object.keys(files).length,
};
await fs.writeFile(path.join(vendorRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Vendored ${Object.keys(files).length} ORT ${PINNED_VERSION} source files into vendor/ort-webgl-1.30.0/upstream`);
