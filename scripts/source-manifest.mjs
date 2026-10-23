#!/usr/bin/env node
// Record and verify a SHA-256 manifest of every file this package ships, and act
// as the single source of truth for the source-release archive.
//
// The manifest is what makes an exported tree auditable: a reviewer can compare
// SOURCE_MANIFEST.json against a fresh checkout (or against the internal tree the
// file came from) without trusting any prose in the documentation.
//
//   node scripts/source-manifest.mjs          # verify against SOURCE_MANIFEST.json
//   node scripts/source-manifest.mjs --write  # rewrite the manifest
//
// Rules that matter for a public release:
//   * hidden directories are included (`.github/` and friends are published
//     source, not noise); only the directories listed below are excluded;
//   * symlinks are refused, never followed -- a link could smuggle in a file from
//     outside the package (or from the local parent checkout);
//   * every resolved path must stay inside the package root;
//   * a file that resolves to a directory, a socket or a device is refused.
//
// Never listed: dependencies and build output (node_modules, dist), the VCS
// directory, editor-private WeChat settings, OS noise, and the local ONNX sources
// used only when regenerating the split model.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const manifestName = 'SOURCE_MANIFEST.json';

// Directories that are never part of the published source. Everything else --
// including dot directories such as `.github/` -- is included.
export const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.git',
  '.vite-cache',
  '.venv-vision',
  '.venv',
  'coverage'
]);

export const SKIP_FILES = new Set([
  '.DS_Store',
  'project.private.config.json',
  manifestName
]);

// Local-only artefacts. `*.onnx` are the source weights for regenerating the
// split model: the generated segments under heybox-miniprogram/src/vision are
// committed instead, so a cold build needs no download.
export const SKIP_PATTERNS = [
  /\.onnx$/,
  /\.f32$/,
  /\.local$/,
  /^dev-/,
  /\.log$/,
  /^Thumbs\.db$/
];

const posix = file => file.split(path.sep).join('/');

export function skippedFile(name) {
  return SKIP_FILES.has(name) || SKIP_PATTERNS.some(pattern => pattern.test(name));
}

function assertInside(root, absolute) {
  const relative = path.relative(root, absolute);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes the package root: ' + absolute);
  }
  return posix(relative);
}

// Collect every publishable file. Throws on symlinks, special files and paths
// that escape `root`; callers get an explicit failure instead of a silent skip.
export async function collectFiles(root = packageRootOf(import.meta.url)) {
  const files = [];
  const visit = async directory => {
    const entries = await fs.readdir(directory, {withFileTypes: true});
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = assertInside(root, absolute);
      if (entry.isSymbolicLink()) {
        throw new Error(
          'Symlink found in the publishable tree: ' + relative +
          '\nThe public package must contain only regular files; remove the link (it can point outside the package).'
        );
      }
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        await visit(absolute);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error('Unsupported file type in the publishable tree: ' + relative);
      }
      if (skippedFile(entry.name)) continue;
      if (relative === '.' || relative.startsWith('../')) {
        throw new Error('Refusing to list a path outside the package: ' + relative);
      }
      files.push({absolute, relative});
    }
  };
  await visit(root);
  return files.sort((left, right) => (left.relative < right.relative ? -1 : 1));
}

// Sanity check shared by the manifest and the release packager: a published list
// may never contain dependencies, build output or VCS data.
export function assertPublishableList(relatives) {
  const forbidden = relatives.filter(relative =>
    /^(?:node_modules|dist|\.git)(?:\/|$)/.test(relative) ||
    /(?:^|\/)(?:node_modules|\.git)(?:\/|$)/.test(relative)
  );
  if (forbidden.length) {
    throw new Error(
      'Refusing to publish dependency or VCS paths (' + forbidden.length + '):\n  ' +
      forbidden.slice(0, 10).join('\n  ')
    );
  }
  return relatives;
}

export async function buildManifest(root, {release = null, packageName = 'hela-riichi-score'} = {}) {
  const collected = await collectFiles(root);
  // The recorded release follows the package version unless a caller overrides
  // it, so a version bump cannot leave a stale `release` field behind.
  const declared = release ?? JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
  const relatives = collected.map(file => file.relative);
  assertPublishableList(relatives);
  const manifest = {
    version: 1,
    package: packageName,
    release: declared,
    generator: 'scripts/source-manifest.mjs',
    includes: [
      '所有公开源码与资源（含 .github/ 等点目录）',
      'SOURCES: LICENSE、LICENSES/**、THIRD_PARTY_NOTICES.md',
      '随包提交的识别模型分段与 vendor 上游源码/补丁（冷构建必需）',
      '模型转换与分段脚本（scripts/prepare-heybox-vision.py、scripts/split_vision_model.py）'
    ],
    excludes: [
      'node_modules/（依赖由 package-lock.json 复现）',
      'dist/（构建产物，由 release 归档另行提供）',
      '.git/（不导出内部历史）',
      'heybox-miniprogram/.vite-cache/、.venv*/、coverage/',
      'wechat-miniprogram/project.private.config.json、.DS_Store',
      '*.onnx / *.f32（仅用于本地重新生成分段；随包提供的是已校验的分段产物）',
      manifestName + '（本文件自身，由 git 提交记录）'
    ],
    fileCount: 0,
    totalBytes: 0,
    files: {}
  };
  for (const file of collected) {
    const bytes = await fs.readFile(file.absolute);
    manifest.totalBytes += bytes.length;
    manifest.files[file.relative] = {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length
    };
  }
  manifest.fileCount = Object.keys(manifest.files).length;
  return manifest;
}

export function compareManifests(recorded, actual) {
  const drift = [];
  for (const [file, record] of Object.entries(actual.files)) {
    const before = recorded.files?.[file];
    if (!before) drift.push('added: ' + file);
    else if (before.sha256 !== record.sha256) drift.push('changed: ' + file);
  }
  for (const file of Object.keys(recorded.files || {})) {
    if (!(file in actual.files)) drift.push('removed: ' + file);
  }
  return drift;
}

function packageRootOf(metaUrl) {
  return path.resolve(path.dirname(fileURLToPath(metaUrl)), '..');
}

export const packageRoot = packageRootOf(import.meta.url);

async function main() {
  const write = process.argv.includes('--write');
  const manifestFile = path.join(packageRoot, manifestName);
  const manifest = await buildManifest(packageRoot);

  if (write) {
    await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Recorded ${manifest.fileCount} files (${(manifest.totalBytes / 1024 / 1024).toFixed(1)} MiB).`);
    return;
  }

  const recorded = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  const drift = compareManifests(recorded, manifest);
  if (drift.length) {
    const preview = drift.slice(0, 25).join('\n  ');
    throw new Error(`Source manifest drift (${drift.length} entries):\n  ${preview}` +
      (drift.length > 25 ? '\n  ...' : '') + '\nRun `npm run manifest` to re-record.');
  }
  console.log(`Verified ${manifest.fileCount} files against ${manifestName}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
