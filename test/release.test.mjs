// Release packaging tests.
//
// These run against small synthetic fixtures in a temporary directory: they never
// touch dist/web or dist/hela.html (which belong to the browser build) and never
// need the network. What they pin down is the packaging contract itself:
//
//   * the archives are built from what exists, and a missing or incomplete build
//     fails loudly instead of producing an empty archive;
//   * licence and provenance material is mandatory and complete;
//   * the source archive is exactly the recorded source manifest;
//   * no dependency, VCS or private path can slip into an archive;
//   * checksums and the release manifest agree with the real bytes;
//   * the same inputs produce byte-identical archives.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';

import {
  REQUIRED_NOTICES,
  assertOfflineHasNoRecognition,
  assertSubdirectoryPortable,
  buildRelease,
  verifyRelease
} from '../scripts/release-packages.mjs';
import {
  assertPublishableList,
  buildManifest,
  collectFiles,
  compareManifests
} from '../scripts/source-manifest.mjs';

const VERSION = '0.6.0';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

const quiet = () => {};

async function writeFile(root, relative, contents) {
  const absolute = path.join(root, relative);
  await fs.mkdir(path.dirname(absolute), {recursive: true});
  await fs.writeFile(absolute, contents);
}

// A miniature package that has every input the packager requires.
async function fixture({recognitionBytes = 4096, indexHtml, mutate, afterManifest} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hela-release-test-'));
  await writeFile(root, 'package.json', JSON.stringify({name: 'hela-riichi-score', version: VERSION}, null, 2));
  await writeFile(root, '.gitignore', 'node_modules/\ndist/\n');
  await writeFile(root, 'README.md', '# fixture\n');
  await writeFile(root, 'src/engine.js', 'export const calculate = () => ({ok: true});\n');
  await writeFile(root, 'scripts/generate-tile-art.mjs', '// generator\n');
  await writeFile(root, 'scripts/prepare-heybox-vision.py', '# converter\n');
  await writeFile(root, 'scripts/split_vision_model.py', '# segmenter\n');
  await writeFile(root, 'heybox-miniprogram/vendor/ort-webgl-1.30.0/patches/0001-resource-lifecycle.patch', '--- a\n+++ b\n');
  await writeFile(root, '.github/workflows/ci.yml', 'name: ci\non: [push]\n');
  for (const [source] of REQUIRED_NOTICES) await writeFile(root, source, `licence text for ${source}\n`);
  await writeFile(root, 'LICENSES/extra-not-mentioned.txt', 'extra terms\n');

  // Build inputs.
  await writeFile(root, 'dist/web/index.html', indexHtml ?? '<!doctype html><script type="module" src="./assets/main-abc.js"></script>\n');
  await writeFile(root, 'dist/web/assets/main-abc.js', 'console.log("app");\n');
  await writeFile(root, 'dist/web/assets/vision/main-s000-000.js', 'x'.repeat(recognitionBytes));
  await writeFile(root, 'dist/web/assets/tiles/m1.svg', '<svg/>\n');
  await writeFile(root, 'dist/hela.html', '<!doctype html><title>offline</title>\n');

  if (mutate) await mutate(root);

  // Installed dependencies exist on disk to prove the packager ignores them.
  await writeFile(root, 'node_modules/left-pad/index.js', 'module.exports = 1;\n');

  // Record the source manifest last, so the tree it describes is final.
  const manifest = await buildManifest(root, {release: VERSION});
  await writeFile(root, 'SOURCE_MANIFEST.json', JSON.stringify(manifest, null, 2) + '\n');
  // Anything added after this point makes the manifest stale on purpose.
  if (afterManifest) await afterManifest(root);
  return root;
}

async function pack(options) {
  return buildRelease({minRecognitionBytes: 1024, log: quiet, ...options});
}

test('completes with every artifact, matching checksums and a consistent release manifest', async () => {
  const root = await fixture();
  const result = await pack({packageRoot: root});
  const out = result.outDir;

  const expected = [
    `hela-${VERSION}-web.zip`,
    `hela-${VERSION}-offline.zip`,
    `hela-${VERSION}-source.zip`,
    `hela-${VERSION}.html`,
    `hela-${VERSION}-SOURCE.md`,
    'SHA256SUMS',
    'release-manifest.json'
  ];
  const present = (await fs.readdir(out)).sort();
  assert.deepEqual(present, expected.sort());

  const sums = await fs.readFile(path.join(out, 'SHA256SUMS'), 'utf8');
  const listed = new Map(sums.trim().split('\n').map(line => {
    const [hash, name] = line.split('  ');
    return [name, hash];
  }));
  for (const [name, hash] of listed) {
    const bytes = await fs.readFile(path.join(out, name));
    assert.equal(digest(bytes), hash, 'SHA256SUMS must match the real bytes of ' + name);
  }
  assert.equal(listed.size, expected.length - 2, 'SHA256SUMS covers every archive/output except itself and the manifest');

  const manifest = JSON.parse(await fs.readFile(path.join(out, 'release-manifest.json'), 'utf8'));
  assert.equal(manifest.version, VERSION);
  assert.equal(manifest.licenses.code, 'AGPL-3.0-only');
  for (const output of manifest.outputs) {
    const bytes = await fs.readFile(path.join(out, output.name));
    assert.equal(output.bytes, bytes.length, 'size recorded for ' + output.name);
    assert.equal(output.sha256, digest(bytes), 'hash recorded for ' + output.name);
  }

  assert.deepEqual(await verifyRelease(out), []);
});

test('the web archive ships the built app at its root with licences and how to run it', async () => {
  const root = await fixture();
  const {outDir} = await pack({packageRoot: root});
  const entries = unzipSync(new Uint8Array(await fs.readFile(path.join(outDir, `hela-${VERSION}-web.zip`))));
  const names = Object.keys(entries).sort();

  for (const required of [
    'index.html',
    'assets/main-abc.js',
    'assets/tiles/m1.svg',
    'assets/vision/main-s000-000.js',
    'README-DOWNLOAD.md',
    'LICENSE',
    'LICENSES/AGPL-3.0.txt',
    'LICENSES/extra-not-mentioned.txt',
    'THIRD_PARTY_NOTICES.md',
    'LICENSES/vision/VISION-MODEL-AGPL.txt',
    'LICENSES/vision/RUNTIME-THIRD-PARTY-NOTICES.txt'
  ]) {
    assert.ok(names.includes(required), 'web archive must contain ' + required);
  }
  assert.deepEqual(names.filter(name => /^(?:node_modules|dist|\.git)(?:\/|$)/.test(name)), [], 'no dependency paths');
  assert.deepEqual(names.filter(name => name.includes('node_modules')), [], 'no nested dependency paths');

  const readme = Buffer.from(entries['README-DOWNLOAD.md']).toString('utf8');
  assert.match(readme, /http\.server/, 'explains how to start a local static server');
  assert.match(readme, /file:\/\//, 'explains why double-clicking the full build is not supported');
  assert.match(readme, /照片识别/, 'states that the full build includes recognition');
  assert.match(readme, /离线上|offline/i, 'points at the offline download');
  assert.match(readme, /AGPL-3\.0/, 'states the licence');
  assert.match(readme, /source|源码/i, 'offers the corresponding source');
});

test('the offline archive carries the single page, licences and the source offer only', async () => {
  const root = await fixture();
  const {outDir} = await pack({packageRoot: root});
  const entries = unzipSync(new Uint8Array(await fs.readFile(path.join(outDir, `hela-${VERSION}-offline.zip`))));
  const names = Object.keys(entries).sort();

  assert.ok(names.includes(`hela-${VERSION}.html`));
  assert.ok(names.includes('README-OFFLINE.md'));
  assert.ok(names.includes('LICENSE'));
  assert.ok(names.includes('LICENSES/AGPL-3.0.txt'));
  // The tile faces are upstream artwork under the upstream M+ font licence, so the
  // artwork licence, the upstream README and the provenance record travel with
  // every archive -- they are not implied by the AGPL text that covers our code.
  assert.ok(names.includes('LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt'), 'offline archive carries the artwork licence');
  assert.ok(names.includes('LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md'), 'offline archive carries the upstream README');
  assert.ok(names.includes('LICENSES/MAHJONG-GRAPHIC-NOTICE.md'), 'offline archive carries the artwork provenance notice');
  assert.ok(names.includes('assets/tiles/art-provenance.json'), 'offline archive carries the machine-readable provenance');
  assert.deepEqual(names, [
    'LICENSE',
    'LICENSES/AGPL-3.0.txt',
    'LICENSES/ESBUILD-MIT.md',
    'LICENSES/FFLATE-MIT.txt',
    'LICENSES/HB-SDK-ISC.md',
    'LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt',
    'LICENSES/MAHJONG-GRAPHIC-NOTICE.md',
    'LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md',
    'LICENSES/MAJIANG-CORE-MIT.txt',
    'LICENSES/MAJSOUL-TEMPLATES-MIT.txt',
    'LICENSES/ONNXRUNTIME-MIT.txt',
    'LICENSES/RUNTIME-THIRD-PARTY-NOTICES.txt',
    'LICENSES/SHARP-APACHE-2.0.txt',
    'LICENSES/VITE-MIT.md',
    'LICENSES/extra-not-mentioned.txt',
    'LICENSES/vision/MAJSOUL-TEMPLATES-LICENSE.txt',
    'LICENSES/vision/MAJSOUL-TEMPLATES-NOTICE.md',
    'LICENSES/vision/ONNXRUNTIME-MIT.txt',
    'LICENSES/vision/RUNTIME-THIRD-PARTY-NOTICES.txt',
    'LICENSES/vision/VISION-MODEL-AGPL.txt',
    'LICENSES/vision/VISION-MODEL-NOTICE.md',
    'LICENSES/vision/VISION-UPSTREAM-MIT.txt',
    'README-OFFLINE.md',
    'THIRD_PARTY_NOTICES.md',
    'assets/tiles/art-provenance.json',
    `hela-${VERSION}.html`
  ]);
  assert.ok(!names.some(name => /vision\/.*\.js$/.test(name)), 'the offline archive carries no model chunks');
  const readme = Buffer.from(entries['README-OFFLINE.md']).toString('utf8');
  assert.match(readme, /双击/, 'explains the double-click flow');
  assert.match(readme, /没有.*识别|不含识别/, 'states that recognition is absent');
});

test('the source archive is exactly the recorded manifest plus the manifest itself', async () => {
  const root = await fixture();
  const {outDir} = await pack({packageRoot: root});
  const unpacked = unzipSync(new Uint8Array(await fs.readFile(path.join(outDir, `hela-${VERSION}-source.zip`))));
  const names = Object.keys(unpacked).sort();
  const recorded = JSON.parse(await fs.readFile(path.join(root, 'SOURCE_MANIFEST.json'), 'utf8'));

  for (const required of ['SOURCE_MANIFEST.json', '.gitignore', 'src/engine.js', 'scripts/generate-tile-art.mjs',
    'scripts/prepare-heybox-vision.py', 'scripts/split_vision_model.py',
    'heybox-miniprogram/vendor/ort-webgl-1.30.0/patches/0001-resource-lifecycle.patch',
    '.github/workflows/ci.yml']) {
    assert.ok(names.includes(required), 'source archive must contain ' + required);
  }
  assert.deepEqual(
    names.filter(name => name !== 'SOURCE_MANIFEST.json').sort(),
    Object.keys(recorded.files).sort(),
    'the source archive must be exactly the manifest list'
  );
  assert.deepEqual(names.filter(name => /(?:^|\/)(?:node_modules|dist|\.git)(?:\/|$)/.test(name)), []);
  assert.deepEqual(names.filter(name => name.startsWith('.github/')).length, 1, 'hidden directories are published');

  for (const [relative, record] of Object.entries(recorded.files)) {
    assert.equal(digest(Buffer.from(unpacked[relative])), record.sha256, 'byte-for-byte source: ' + relative);
  }
});

test('re-running with the same inputs produces byte-identical archives', async () => {
  const root = await fixture();
  const first = await pack({packageRoot: root});
  const names = (await fs.readdir(first.outDir)).filter(name => name.endsWith('.zip') || name.endsWith('.html'));
  assert.ok(names.length >= 3, 'expected the archives plus the single page');
  const firstHashes = {};
  for (const name of names) firstHashes[name] = digest(await fs.readFile(path.join(first.outDir, name)));

  const second = await pack({packageRoot: root, outDir: path.join(root, 'dist/releases-2')});
  for (const [name, hash] of Object.entries(firstHashes)) {
    assert.equal(digest(await fs.readFile(path.join(second.outDir, name))), hash, 'reproducible archive: ' + name);
  }
});

test('a missing browser build fails with the command to run and writes nothing', async () => {
  const root = await fixture({mutate: async (dir) => fs.rm(path.join(dir, 'dist/web'), {recursive: true})});
  await assert.rejects(
    () => pack({packageRoot: root}),
    /dist\/web\/index\.html[\s\S]*npm run build:web[\s\S]*No archive was written/
  );
  await assert.rejects(() => fs.access(path.join(root, 'dist/releases')));
});

test('a missing offline page fails with the command to run', async () => {
  const root = await fixture({mutate: async (dir) => fs.rm(path.join(dir, 'dist/hela.html'))});
  await assert.rejects(() => pack({packageRoot: root}), /dist\/hela\.html[\s\S]*npm run build:single/);
});

test('a web build without the recognition model is refused, not silently published', async () => {
  const root = await fixture({recognitionBytes: 16});
  await assert.rejects(
    () => pack({packageRoot: root}),
    /recognition assets[\s\S]*Re-run `npm run build:web`[\s\S]*silently lost photo recognition/
  );
});

test('root-absolute asset paths are rejected because they break subdirectory hosting', async () => {
  assert.throws(
    () => assertSubdirectoryPortable('<script src="/assets/main.js"></script>'),
    /root-absolute[\s\S]*relative paths/
  );
  assert.doesNotThrow(() => assertSubdirectoryPortable('<script src="./assets/main.js"></script>'));
  assert.doesNotThrow(() => assertSubdirectoryPortable('<script src="https://example.com/x.js"></script>'));

  const root = await fixture({indexHtml: '<!doctype html><link href="/assets/app.css" rel="stylesheet">\n'});
  await assert.rejects(() => pack({packageRoot: root}), /root-absolute/);
});

test('the offline page is refused when it carries recognition markers', async () => {
  assert.doesNotThrow(() => assertOfflineHasNoRecognition(Buffer.from('<html><body>算点</body></html>')));
  assert.throws(
    () => assertOfflineHasNoRecognition(Buffer.from('import "./chunks/main-s000-000-ABC.js"')),
    /looks like it bundles photo recognition[\s\S]*mislabelled offline build/
  );
  assert.throws(
    () => assertOfflineHasNoRecognition(Buffer.from('console.log("onnxruntime-web")')),
    /looks like it bundles photo recognition/
  );
  assert.throws(
    () => assertOfflineHasNoRecognition(Buffer.from('<html></html>'), {
      inputs: {'src/vision/generated/main.js': {bytes: 1}, 'web/src/app.js': {bytes: 2}}
    }),
    /metafile lists recognition inputs \(1\)/
  );
  assert.doesNotThrow(() => assertOfflineHasNoRecognition(Buffer.from('<html></html>'), {
    inputs: {'web/src/app.js': {bytes: 2}}
  }));

  // End to end: a single page that bundles a model is refused by the packager.
  const root = await fixture({
    mutate: async (dir) => writeFile(dir, 'dist/hela.html', '<script>aux-s001-000-X.js</script>\n')
  });
  await assert.rejects(() => pack({packageRoot: root}), /mislabelled offline build/);
});

test('a missing licence file fails the packaging instead of shipping an incomplete notice set', async () => {
  const root = await fixture({
    mutate: async (dir) => fs.rm(path.join(dir, 'LICENSES/MAJSOUL-TEMPLATES-MIT.txt'))
  });
  await assert.rejects(
    () => pack({packageRoot: root}),
    /required licence\/provenance files are missing[\s\S]*MAJSOUL-TEMPLATES-MIT\.txt/
  );
});

test('a stale source manifest blocks packaging, so the source archive cannot lie', async () => {
  const root = await fixture({
    afterManifest: async (dir) => {
      await writeFile(dir, 'src/added-later.js', 'export const later = true;\n');
    }
  });
  await assert.rejects(
    () => pack({packageRoot: root}),
    /SOURCE_MANIFEST\.json does not match the tree[\s\S]*added: src\/added-later\.js[\s\S]*npm run manifest/
  );
});

test('symlinks are refused in packaged trees and in the source manifest', async (t) => {
  const root = await fixture();
  const webLink = path.join(root, 'dist/web/assets/linked.js');
  const sourceLink = path.join(root, 'src/linked.js');
  try {
    fsSync.symlinkSync(path.join(root, 'src/engine.js'), webLink);
    fsSync.symlinkSync(path.join(root, 'src/engine.js'), sourceLink);
  } catch {
    t.skip('symlinks are not available in this environment');
    return;
  }
  // The built web tree is packaged directly, so a link there is refused.
  await assert.rejects(() => collectFiles(path.join(root, 'dist/web')), /Symlink found in the publishable tree: assets\/linked\.js/);
  await assert.rejects(() => pack({packageRoot: root}), /Symlink/);
  // A link inside the source tree is refused when the manifest is recorded.
  await assert.rejects(() => buildManifest(root), /Symlink found in the publishable tree: src\/linked\.js/);
});

test('a dependency directory inside the built app is refused instead of shipped', async () => {
  const root = await fixture({
    mutate: async (dir) => writeFile(dir, 'dist/web/node_modules/should-not-ship.js', 'nope\n')
  });
  await assert.rejects(
    () => pack({packageRoot: root}),
    /Refusing to package dependency or VCS directory: node_modules/
  );
});

test('the source manifest refuses dependency and VCS paths', () => {
  assert.throws(() => assertPublishableList(['src/engine.js', 'node_modules/pkg/index.js']), /dependency or VCS paths/);
  assert.throws(() => assertPublishableList(['dist/web/index.html']), /dependency or VCS paths/);
  assert.throws(() => assertPublishableList(['.git/config']), /dependency or VCS paths/);
  assert.deepEqual(assertPublishableList(['src/engine.js', '.github/workflows/ci.yml']), ['src/engine.js', '.github/workflows/ci.yml']);
});

test('the manifest comparison reports added, changed and removed files', () => {
  const recorded = {files: {a: {sha256: '1'}, b: {sha256: '2'}}};
  const actual = {files: {a: {sha256: '1'}, c: {sha256: '3'}}};
  assert.deepEqual(compareManifests(recorded, actual), ['added: c', 'removed: b']);
  assert.deepEqual(compareManifests(recorded, {files: {a: {sha256: '9'}, b: {sha256: '2'}}}), ['changed: a']);
});

test('release verification catches a tampered archive and a tampered manifest', async () => {
  const root = await fixture();
  const {outDir} = await pack({packageRoot: root});

  // Tamper with an archive: the checksum no longer matches.
  const webZip = path.join(outDir, `hela-${VERSION}-web.zip`);
  const original = await fs.readFile(webZip);
  await fs.writeFile(webZip, Buffer.concat([original, Buffer.from('tampered')]));
  const archiveProblems = await verifyRelease(outDir);
  assert.ok(archiveProblems.some(problem => /checksum mismatch: hela-0\.6\.0-web\.zip/.test(problem)), archiveProblems.join('\n'));
  assert.ok(archiveProblems.some(problem => /size mismatch vs release manifest/.test(problem)), archiveProblems.join('\n'));
  await fs.writeFile(webZip, original);
  assert.deepEqual(await verifyRelease(outDir), [], 'restoring the file makes verification clean again');

  // Tamper with the release manifest: the recorded hash no longer matches.
  const manifestFile = path.join(outDir, 'release-manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  manifest.outputs[0].sha256 = '0'.repeat(64);
  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2));
  const manifestProblems = await verifyRelease(outDir);
  assert.ok(manifestProblems.some(problem => /hash mismatch vs release manifest/.test(problem)), manifestProblems.join('\n'));
});
