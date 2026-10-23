import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {buildVendorBundle, verifyVendor} from './build-ort-vendor.mjs';
import {auditManifest, readSelection} from './vision-selection.mjs';

// Production vision preparation.
//   * the shipped model set is whatever `vision-selection.json` selects (A = 20 nodes / 32 MiB by default,
//     B = 40 nodes / 32 MiB); the policy and the candidate label come from scripts/vision-selection.mjs, which
//     scripts/verify-dist.mjs reads as well, so generation and audit cannot disagree;
//   * the WebGL runtime is the locally source-built ONNX Runtime 1.30.0 bundle with the auditable
//     lifecycle patch (see vendor/ort-webgl-1.30.0/PATCHES.md), never the pristine npm dist bundle;
//   * every segment resource is checksum-verified against the manifest before anything is written.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(project);
const destination = path.join(project, 'src/vision/generated');
const pythonScript = path.join(repo, 'scripts/prepare-heybox-vision.py');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Selection is data, not code: the build never hardcodes which candidate it ships.
const selection = await readSelection(project);
const CANDIDATE = selection.selected;
const SPLIT_POLICY = {maxNodes: selection.candidate.maxNodes, maxOutputBytes: selection.candidate.maxOutputBytes};

await fs.mkdir(destination, {recursive: true});
let manifest;
try {
  manifest = JSON.parse(await fs.readFile(path.join(destination, 'manifest.json'), 'utf8'));
} catch {}
const generator = digest(await fs.readFile(pythonScript));
const sourceConfigs = {};
for (const [kind, file] of [
  ['main', 'vision-model.json'],
  ['aux', 'vision-aux-model.json'],
]) {
  sourceConfigs[kind] = JSON.parse(await fs.readFile(path.join(repo, 'wechat-miniprogram/utils', file), 'utf8'));
}
const stale =
  manifest?.candidate !== CANDIDATE ||
  manifest?.splitPolicy?.maxNodes !== SPLIT_POLICY.maxNodes ||
  manifest?.splitPolicy?.maxOutputBytes !== SPLIT_POLICY.maxOutputBytes ||
  manifest?.segmenterSha256 !== digest(await fs.readFile(path.join(repo, 'scripts/split_vision_model.py'))) ||
  manifest?.generatorSha256 !== generator ||
  Object.entries(sourceConfigs).some(([kind, config]) => manifest?.models?.[kind]?.sourceSha256 !== config.sha256);
if (stale) {
  const localPython = path.join(repo, '.venv-vision/bin/python');
  let python = localPython;
  try {
    await fs.access(localPython);
  } catch {
    python = process.env.HELA_VISION_PYTHON || 'python3';
  }
  const result = spawnSync(
    python,
    [
      pythonScript,
      '--output',
      destination,
      '--candidate',
      CANDIDATE,
      '--max-nodes',
      String(SPLIT_POLICY.maxNodes),
      '--max-output-bytes',
      String(SPLIT_POLICY.maxOutputBytes),
    ],
    {cwd: repo, stdio: 'inherit'},
  );
  if (result.status !== 0) throw new Error('Model preparation failed. Python dependencies: onnx and numpy.');
  manifest = JSON.parse(await fs.readFile(path.join(destination, 'manifest.json'), 'utf8'));
}
// One shared audit for "is this the candidate we selected, with the approved policy and the fixed graph".
const selectionProblems = auditManifest(manifest, CANDIDATE);
if (selectionProblems.length) {
  throw new Error(`generated models do not match the selection (${CANDIDATE}):\n- ${selectionProblems.join('\n- ')}`);
}

// Verify every segment resource before it can reach the production bundle.
let resourceBytes = 0;
for (const [kind, model] of Object.entries(manifest.models)) {
  for (const info of model.segments) {
    const chunks = [];
    for (const file of info.resources) {
      const code = await fs.readFile(path.join(destination, file), 'utf8');
      const payload = JSON.parse(code.slice('export default '.length).trim().replace(/;$/, ''));
      chunks.push(Buffer.from(payload, 'base64'));
      resourceBytes += payload.length;
    }
    if (chunks.length !== info.parts || digest(Buffer.concat(chunks)) !== info.gzipSha256) {
      throw new Error('Segment checksum mismatch: ' + kind + ' ' + info.index);
    }
  }
}

const shared = path.join(project, 'src/vision/shared.js');
await build({
  stdin: {
    contents:
      "export {createTileTap} from './wechat-miniprogram/utils/tile-tap.js';export {detectMahjongSoul,recognizeMahjongSoul} from './wechat-miniprogram/utils/majsoul-recognition.js';export {inferMeldDirection} from './wechat-miniprogram/utils/meld-layout.js';export {recognizeTable} from './wechat-miniprogram/utils/model-pipeline.js';export {letterbox,decode,unrotate,nms} from './wechat-miniprogram/utils/model-postprocess.js';",
    resolveDir: repo,
    sourcefile: 'vision-shared-entry.js',
  },
  outfile: shared,
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2020',
  legalComments: 'eof',
  banner: {js: '// Generated from the unchanged WeChat detection and meld-layout modules. Run npm run prepare:vision.'},
});

// Locally source-built WebGL runtime (ONNX Runtime 1.30.0 + auditable lifecycle patch).
const vendorProblems = (await verifyVendor()).problems;
if (vendorProblems.length) throw new Error('ONNX Runtime vendor verification failed:\n- ' + vendorProblems.join('\n- '));
const vendor = await buildVendorBundle();
if (vendor.readback !== 'sync') throw new Error(`production bundle must use the sync readback flavor, got ${vendor.readback}`);
if (vendor.decode !== 'gather') throw new Error(`production bundle must use the gather decoder, got ${vendor.decode}`);
if (vendor.profile) throw new Error('production bundle must not carry the DEV profile instrumentation');

const notices = path.join(project, 'public/vision');
await fs.mkdir(notices, {recursive: true});
for (const name of ['VISION-MODEL-AGPL.txt', 'VISION-UPSTREAM-MIT.txt', 'VISION-MODEL-NOTICE.md', 'MAJSOUL-TEMPLATES-LICENSE.txt']) {
  await fs.copyFile(path.join(repo, 'wechat-miniprogram', name), path.join(notices, name));
}
await fs.writeFile(path.join(notices, 'model-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await fs.copyFile(path.join(project, 'vendor/ort-webgl-1.30.0/LICENSE-MIT.txt'), path.join(notices, 'ONNXRUNTIME-MIT.txt'));
const vendorManifest = JSON.parse(await fs.readFile(path.join(project, 'vendor/ort-webgl-1.30.0/manifest.json'), 'utf8'));
await fs.writeFile(
  path.join(notices, 'runtime-provenance.json'),
  JSON.stringify(
    {
      runtime: {package: vendorManifest.package, version: vendorManifest.version, license: vendorManifest.packageLicense},
      build: {
        kind: 'local source build from vendor/ort-webgl-1.30.0 (WebGL only)',
        script: 'scripts/build-ort-vendor.mjs',
        entry: vendorManifest.entry,
        patch: vendorManifest.patchFile,
        patchSha256: vendor.patchSha256,
        patchedFiles: vendor.patchedFiles,
        // The readback mode is part of the provenance: the production bundle must be the synchronous flavor,
        // and the DEV-only async-readback overlay must never be able to masquerade as it.
        readback: vendor.readback,
        decode: vendor.decode,
        profile: vendor.profile,
        flavor: vendor.flavor,
        flavorOverlay: vendor.flavorOverlay,
        upstreamFileCount: vendorManifest.upstreamFileCount,
        bundleBytes: vendor.bytes,
        backendRegistration: vendorManifest.provenance.backendRegistration,
      },
      upstreamSources: vendorManifest.upstreamFiles,
      publicApi: {package: vendorManifest.commonApi.package, version: vendorManifest.commonApi.version},
      model: {
        candidate: manifest.candidate,
        splitPolicy: manifest.splitPolicy,
        segments: Object.fromEntries(
          Object.entries(manifest.models).map(([kind, model]) => [kind, model.segments.length]),
        ),
      },
    },
    null,
    2,
  ) + '\n',
);

const packages = ['onnxruntime-web', 'onnxruntime-common', 'long', 'protobufjs', 'flatbuffers', 'guid-typescript', 'fflate'];
let licenseText = 'Third-party runtime notices. Model licenses are supplied separately.\n';
for (const name of packages) {
  const folder = path.join(project, 'node_modules', name);
  let names;
  try {
    names = await fs.readdir(folder);
  } catch {
    continue;
  }
  const pkg = JSON.parse(await fs.readFile(path.join(folder, 'package.json'), 'utf8'));
  licenseText += '\n' + name + ' ' + pkg.version + ' (' + pkg.license + ')\n';
  for (const file of names.filter((file) => /licen[sc]e|notice/i.test(file))) {
    try {
      licenseText += (await fs.readFile(path.join(folder, file), 'utf8')) + '\n';
    } catch {}
  }
}
licenseText +=
  '\nONNX Runtime WebGL runtime in this build is compiled from the vendored 1.30.0 sources with the\n' +
  'lifecycle patch recorded in vendor/ort-webgl-1.30.0/patches/0001-resource-lifecycle.patch\n' +
  '(sha256 ' + vendor.patchSha256 + ').\n';
await fs.writeFile(path.join(notices, 'THIRD_PARTY_NOTICES.txt'), licenseText);
await fs.appendFile(
  path.join(notices, 'VISION-MODEL-NOTICE.md'),
  '\n\n小黑盒版本将既有 FP16 权重展开为 FP32，使用等价的 Reshape/Tile 替换最近邻放大，并为 GPU 广播调整常量维度。未使用验收照片训练或更改类别。转换脚本：scripts/prepare-heybox-vision.py。模型图按拓扑顺序拆为独立子图，保留全部权重、算子、640 输入及跨段依赖；每段将边界输出下载到 CPU 后释放 GPU 会话。运行时：ONNX Runtime Web WebGL（MIT），由项目内 vendor/ort-webgl-1.30.0 源码构建并附加资源生命周期补丁。\n',
);
console.log(
  `Prepared candidate ${manifest.candidate}${selection.source === 'default' ? ' (default selection)' : ''} ` +
    `(${manifest.models.main.segments.length} main + ${manifest.models.aux.segments.length} aux segments, ` +
    `${(resourceBytes / 1024).toFixed(1)} KiB base64 resources), shared pipeline and the locally patched WebGL runtime ` +
    `(${(vendor.bytes / 1024).toFixed(1)} KiB, readback=${vendor.readback}, decode=${vendor.decode}, patch ${vendor.patchSha256.slice(0, 16)}).`,
);
