#!/usr/bin/env node
// Public-export scan.
//
// Checks that the package contains no platform bindings, personal absolute paths,
// credentials, private WeChat settings, user photos or internal diagnostics --
// and that the two selected brand assets are the reviewed ones.
//
// The report names only the category and the path; it never echoes the matched
// value, so running it in CI cannot leak a secret to the log.
//
// Usage:  node scripts/public-scan.mjs [--quiet]
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quiet = process.argv.includes('--quiet');

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  '.git',
  '.vite-cache',
  '.venv-vision',
  '.venv',
  'coverage'
]);
const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.html', '.css', '.wxss', '.wxml',
  '.py', '.yml', '.yaml', '.svg', '.ts', '.sh', '.xml', '.gitignore'
]);

// Category -> list of [label, pattern]. Labels are what the report prints.
// Hidden directories (`.github/` and friends) are scanned like any other published
// source; only the dependency/VCS/build directories listed above are skipped.
const RULES = [
  ['personal absolute path', [
    ['macOS home path', /\/Users\/[A-Za-z0-9._-]+\//],
    ['Linux home path', /\/home\/[A-Za-z0-9._-]+\//],
    ['Windows home path', /[A-Za-z]:\\\\?Users\\\\[A-Za-z0-9._-]+/]
  ]],
  ['platform binding', [
    ['WeChat AppID', /\bwx[0-9a-f]{16}\b/],
    ['UUID-style mini-program id', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/]
  ]],
  ['credential material', [
    ['private key block', /BEGIN (?:RSA |OPENSSH |EC |PGP )?PRIVATE KEY/],
    ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
    ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
    ['generic secret assignment', /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i]
  ]]
  // Photo fixtures and diagnostic dumps are caught by file name instead of text:
  // the shipped docs and UI copy legitimately *mention* acceptance photos when
  // explaining that no photo data is used or shipped.
];

// Reviewed brand assets: option 03 (in-app) and option 01 (platform icon) of the
// selected icon set. Any other bytes mean the artwork was swapped.
const PINNED_ASSETS = {
  'assets/app-icon-buddies.webp': '5b6d70a3c812d291432e965124d514bb2baa12e634b94cb45bf8a63e74f34f78',
  'assets/platform-icon-mochi.png': '348fcf978da888be637942f67093eaa1ae6f672cca2399c3370c0182b80b15e8'
};

const ALLOWED_ABSOLUTE = [
  // Standard URLs and relative paths only; nothing at all is expected to match,
  // this list documents the exemptions we would accept if one were ever needed.
];

const findings = [];
const note = (category, label, file) => findings.push({category, label, file});

async function walk(directory, out = []) {
  for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
    const absolute = path.join(directory, entry.name);
    // A symlink is reported and never followed: it could point outside the
    // package (for example into the local parent checkout) and make the scan
    // claim a file is fine while the published tree is not what was scanned.
    if (entry.isSymbolicLink()) {
      note('symlink', 'link in the publishable tree', path.relative(packageRoot, absolute));
      continue;
    }
    if (entry.isDirectory()) {
      // Dependencies and build output are local-only: .gitignore and
      // SOURCE_MANIFEST.json both exclude them, so they are skipped here rather
      // than reported as if they were shipped.
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      await walk(absolute, out);
    } else {
      out.push(absolute);
    }
  }
  return out;
}

const files = await walk(packageRoot);
const forbiddenNames = new Set(['.DS_Store', 'project.private.config.json']);

for (const file of files) {
  const relative = path.relative(packageRoot, file).split(path.sep).join('/');
  const base = path.basename(file);
  if (forbiddenNames.has(base)) note('private artefact', 'local-only file', relative);
  if (/\.onnx$/.test(base)) note('private artefact', 'model weight source', relative);
  if (/\.(jpe?g|webp|png)$/i.test(base) && /^(?:photo|screenshot|截图)/i.test(base)) {
    note('private artefact', 'user photo', relative);
  }
  if (/实拍|验收照片|screenshot|截图/i.test(base) && /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(base)) {
    note('private artefact', 'user photo or screenshot', relative);
  }
  if (/(?:^|\/)fixtures?\//.test(relative) && /\.(png|jpe?g|webp|f32|json)$/i.test(base)) {
    note('private artefact', 'test fixture directory', relative);
  }
  if (/raw-output\.f32$|vision-journal\.json$/i.test(base)) note('private artefact', 'diagnostic dump', relative);
  const extension = path.extname(base) || base;
  if (!TEXT_EXTENSIONS.has(extension)) continue;
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  if (!text) continue;
  for (const [category, rules] of RULES) {
    for (const [label, pattern] of rules) {
      const match = pattern.exec(text);
      if (!match) continue;
      // A UUID that is entirely zeroes is a protobuf default, not a binding.
      if (label === 'UUID-style mini-program id' && /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(match[0])) continue;
      if (ALLOWED_ABSOLUTE.some(allow => allow.test(match[0]))) continue;
      note(category, label, relative);
    }
  }
}

for (const [relative, expected] of Object.entries(PINNED_ASSETS)) {
  const bytes = await fs.readFile(path.join(packageRoot, relative)).catch(() => null);
  if (!bytes) {
    note('asset provenance', 'missing reviewed asset', relative);
    continue;
  }
  if (createHash('sha256').update(bytes).digest('hex') !== expected) {
    note('asset provenance', 'reviewed asset was replaced', relative);
  }
}

// Reviewed tile artwork. The 37 faces are upstream mahjong_graphic vector art used
// under the upstream M+ font licence (not AGPL, not MIT). Both the faces and the
// two upstream licence texts are checked against the recorded provenance record,
// so a redrawn/recoloured face or a truncated licence fails the export gate here
// instead of shipping quietly.
const PROVENANCE_FILE = 'assets/tiles/art-provenance.json';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const provenanceBytes = await fs.readFile(path.join(packageRoot, PROVENANCE_FILE)).catch(() => null);
const artwork = provenanceBytes ? JSON.parse(provenanceBytes.toString('utf8')).artwork : null;
if (!artwork || typeof artwork.tiles !== 'object') {
  note('asset provenance', 'missing tile provenance record', PROVENANCE_FILE);
} else {
  const expectedTiles = Object.keys(artwork.tiles);
  if (expectedTiles.length !== 37) {
    note('asset provenance', 'tile provenance does not cover 37 faces', PROVENANCE_FILE);
  }
  for (const [id, record] of Object.entries(artwork.tiles)) {
    const relative = `assets/tiles/${id}.svg`;
    const bytes = await fs.readFile(path.join(packageRoot, relative)).catch(() => null);
    if (!bytes) {
      note('asset provenance', 'missing artwork face', relative);
      continue;
    }
    if (sha256(bytes) !== record.localSha256) {
      note('asset provenance', 'artwork face was modified', relative);
    }
  }
  for (const [label, file, expected] of [
    ['upstream licence text', artwork.license?.file, artwork.upstream?.licenseFile?.sha256],
    ['upstream README', artwork.license?.upstreamReadme, artwork.upstream?.readmeFile?.sha256]
  ]) {
    if (!file || !expected) {
      note('asset provenance', 'provenance does not name the ' + label, PROVENANCE_FILE);
      continue;
    }
    const bytes = await fs.readFile(path.join(packageRoot, file)).catch(() => null);
    if (!bytes) note('asset provenance', 'missing ' + label, file);
    else if (sha256(bytes) !== expected) note('asset provenance', label + ' was modified', file);
  }
}

// Every licence that the shipped dependency set requires must be present.
const REQUIRED_LICENCES = [
  'LICENSE',
  'LICENSES/AGPL-3.0.txt',
  'LICENSES/MAJIANG-CORE-MIT.txt',
  'LICENSES/FFLATE-MIT.txt',
  'LICENSES/ONNXRUNTIME-MIT.txt',
  'LICENSES/VITE-MIT.md',
  'LICENSES/ESBUILD-MIT.md',
  'LICENSES/SHARP-APACHE-2.0.txt',
  'LICENSES/HB-SDK-ISC.md',
  'LICENSES/RUNTIME-THIRD-PARTY-NOTICES.txt',
  'LICENSES/MAJSOUL-TEMPLATES-MIT.txt',
  'LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt',
  'LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md',
  'LICENSES/MAHJONG-GRAPHIC-NOTICE.md',
  'THIRD_PARTY_NOTICES.md',
  'SOURCE_MANIFEST.json'
];
for (const relative of REQUIRED_LICENCES) {
  await fs.access(path.join(packageRoot, relative)).catch(() => {
    note('licence completeness', 'required licence file missing', relative);
  });
}

const grouped = new Map();
for (const finding of findings) {
  const key = finding.category + ' · ' + finding.label;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(finding.file);
}

if (grouped.size === 0) {
  if (!quiet) console.log(`Public scan clean: ${files.length} files, no bindings, paths, credentials or private artefacts.`);
  process.exit(0);
}

console.error(`Public scan found ${grouped.size} issue group(s) across ${findings.length} file(s):`);
for (const [key, matches] of [...grouped].sort()) {
  console.error(`  [${key}] ${matches.length} file(s):`);
  for (const file of matches.slice(0, 10)) console.error('    ' + file);
  if (matches.length > 10) console.error('    ...');
}
console.error('Values are intentionally not printed; inspect the listed paths locally.');
process.exit(1);
