#!/usr/bin/env node
// Build the downloadable release archives for the browser version.
//
//   npm run release:prepare     # build dist/releases/* from dist/web + dist/hela.html
//   npm run release:verify      # re-verify an existing dist/releases
//
// Outputs (all under dist/releases):
//
//   hela-<version>-web.zip        the built browser app + licences + how to run it
//   hela-<version>-offline.zip    the single offline HTML + licences + source offer
//   hela-<version>-source.zip     the complete corresponding source tree
//   hela-<version>.html           the single offline HTML, for a direct download
//   SHA256SUMS                    sha256 of every file above
//   release-manifest.json         versions, sizes, hashes and what each archive is
//
// Design rules:
//   * the archives are built from what was actually built -- if dist/web or
//     dist/hela.html is missing this script fails with the command to run, and
//     never writes a placeholder;
//   * the source archive is exactly the recorded SOURCE_MANIFEST.json file list, so
//     "what was published" and "what the manifest claims" cannot drift;
//   * dependencies, build output and VCS data are refused, and symlinks are never
//     followed;
//   * the recognition model and every licence the build depends on are required
//     inputs, so an archive cannot silently ship without them;
//   * archive entry timestamps are pinned, so re-running the same inputs produces
//     byte-identical archives.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {zipSync, unzipSync} from 'fflate';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Pinned entry timestamp: the release archives are reproducible byte for byte.
const ARCHIVE_MTIME = new Date(Date.UTC(2026, 9, 22, 0, 0, 0));
// Level 6 keeps a ~64 MiB source tree to a reasonable packaging time while still
// compressing the base64 model segments well; level 9 in fflate is several times
// slower for a marginal gain.
const ARCHIVE_LEVEL = 6;

// The full build has to carry the recognition weights; anything much smaller
// means the web build shipped without them.
export const MIN_RECOGNITION_BYTES = 8 * 1024 * 1024;

// Licence and provenance material that every archive must contain. Anything
// missing here fails the build instead of shipping an incomplete notice set.
export const REQUIRED_NOTICES = [
  ['LICENSE', 'LICENSE'],
  ['LICENSES/AGPL-3.0.txt', 'LICENSES/AGPL-3.0.txt'],
  ['LICENSES/MAJIANG-CORE-MIT.txt', 'LICENSES/MAJIANG-CORE-MIT.txt'],
  ['LICENSES/FFLATE-MIT.txt', 'LICENSES/FFLATE-MIT.txt'],
  ['LICENSES/ONNXRUNTIME-MIT.txt', 'LICENSES/ONNXRUNTIME-MIT.txt'],
  ['LICENSES/VITE-MIT.md', 'LICENSES/VITE-MIT.md'],
  ['LICENSES/ESBUILD-MIT.md', 'LICENSES/ESBUILD-MIT.md'],
  ['LICENSES/SHARP-APACHE-2.0.txt', 'LICENSES/SHARP-APACHE-2.0.txt'],
  ['LICENSES/HB-SDK-ISC.md', 'LICENSES/HB-SDK-ISC.md'],
  ['LICENSES/RUNTIME-THIRD-PARTY-NOTICES.txt', 'LICENSES/RUNTIME-THIRD-PARTY-NOTICES.txt'],
  ['LICENSES/MAJSOUL-TEMPLATES-MIT.txt', 'LICENSES/MAJSOUL-TEMPLATES-MIT.txt'],
  // The 37 tile faces are upstream mahjong_graphic artwork under the upstream M+
  // font licence; the artwork's own licence text and provenance ride along in
  // every archive, separate from the AGPL text that covers our code only.
  ['LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt', 'LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt'],
  ['LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md', 'LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md'],
  ['LICENSES/MAHJONG-GRAPHIC-NOTICE.md', 'LICENSES/MAHJONG-GRAPHIC-NOTICE.md'],
  ['assets/tiles/art-provenance.json', 'assets/tiles/art-provenance.json'],
  ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
  ['heybox-miniprogram/public/vision/VISION-MODEL-AGPL.txt', 'LICENSES/vision/VISION-MODEL-AGPL.txt'],
  ['heybox-miniprogram/public/vision/VISION-MODEL-NOTICE.md', 'LICENSES/vision/VISION-MODEL-NOTICE.md'],
  ['heybox-miniprogram/public/vision/VISION-UPSTREAM-MIT.txt', 'LICENSES/vision/VISION-UPSTREAM-MIT.txt'],
  ['heybox-miniprogram/public/vision/ONNXRUNTIME-MIT.txt', 'LICENSES/vision/ONNXRUNTIME-MIT.txt'],
  ['heybox-miniprogram/public/vision/MAJSOUL-TEMPLATES-LICENSE.txt', 'LICENSES/vision/MAJSOUL-TEMPLATES-LICENSE.txt'],
  ['heybox-miniprogram/public/vision/MAJSOUL-TEMPLATES-NOTICE.md', 'LICENSES/vision/MAJSOUL-TEMPLATES-NOTICE.md'],
  ['heybox-miniprogram/public/vision/THIRD_PARTY_NOTICES.txt', 'LICENSES/vision/RUNTIME-THIRD-PARTY-NOTICES.txt']
];

const FORBIDDEN_ARCHIVE_PATH = /^(?:node_modules|dist|\.git)(?:\/|$)|(?:^|\/)(?:node_modules|\.git)(?:\/|$)/;
const RECOGNITION_FILE = /(?:^|\/)(?:vision|assets\/vision)(?:\/|$)|(?:^|\/)(?:main|aux)-s\d{3}-\d{3}/i;
// Markers that must never appear in the offline single page build.
const RECOGNITION_MARKER = /(?:main|aux)-s\d{3}-\d{3}|onnxruntime/i;

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const posix = file => file.split(path.sep).join('/');

export async function readPackageVersion(root = packageRoot) {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  return pkg.version;
}

// Walk `directory` and return regular files only. Symlinks are refused because a
// link can point outside the package (for example into a local parent checkout).
export async function collectRegularFiles(directory, {root = directory} = {}) {
  const files = [];
  const visit = async current => {
    const entries = await fs.readdir(current, {withFileTypes: true});
    entries.sort((left, right) => (left.name < right.name ? -1 : 1));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = posix(path.relative(root, absolute));
      if (entry.isSymbolicLink()) throw new Error('Symlink in a packaged tree is refused: ' + relative);
      if (entry.isDirectory()) {
        if (FORBIDDEN_ARCHIVE_PATH.test(relative + '/')) {
          throw new Error('Refusing to package dependency or VCS directory: ' + relative);
        }
        await visit(absolute);
        continue;
      }
      if (!entry.isFile()) throw new Error('Unsupported file type in a packaged tree: ' + relative);
      files.push({absolute, relative});
    }
  };
  await visit(directory);
  return files.sort((left, right) => (left.relative < right.relative ? -1 : 1));
}

// index.html has to work from any GitHub Pages subdirectory, so no asset may be
// referenced from the server root.
export function assertSubdirectoryPortable(html, label = 'index.html') {
  const offending = [...html.matchAll(/(?:src|href)="(\/(?!\/)[^"]*)"/g)].map(match => match[1]);
  if (offending.length) {
    throw new Error(
      `${label} references ${offending.length} root-absolute asset path(s), so it cannot run from a subdirectory:\n  ` +
      offending.slice(0, 8).join('\n  ') + '\nUse relative paths ("./assets/...").'
    );
  }
}

// The offline page is defined as "no recognition at all", not "recognition
// hidden". Trust the bytes: a model marker or an ONNX Runtime reference in the
// single HTML means the two products were confused, and publishing it would
// mislabel what the user downloads. When the browser build also wrote its
// metafile, check that no recognition input went in either.
export function assertOfflineHasNoRecognition(singleBytes, metafile) {
  const html = Buffer.from(singleBytes).toString('utf8');
  const marker = RECOGNITION_MARKER.exec(html);
  if (marker) {
    throw new Error(
      'dist/hela.html looks like it bundles photo recognition (found "' + marker[0] + '"), ' +
      'but the offline single page must not contain the model or its runtime.\n' +
      'Re-run `npm run build:single`; refusing to publish a mislabelled offline build.'
    );
  }
  if (!metafile) return;
  const inputs = Object.keys(metafile.inputs || {});
  const offending = inputs.filter(input => /vision\/generated|onnxruntime/i.test(input));
  if (offending.length) {
    throw new Error(
      'The single-file build metafile lists recognition inputs (' + offending.length + '), ' +
      'so the offline page is not recognition-free:\n  ' + offending.slice(0, 5).join('\n  ')
    );
  }
}

function archivedName(actual) {
  return (
    'sha256  ' + actual.sha256 + '\n' +
    'bytes   ' + actual.bytes + '\n' +
    'entries ' + actual.entries + '\n'
  );
}

async function readNotices(root) {
  const notices = new Map();

  // 1. The mandatory set: every licence and provenance document the build depends
  //    on. A missing one fails the release instead of shipping an incomplete
  //    notice set.
  const missing = [];
  for (const [source, destination] of REQUIRED_NOTICES) {
    try {
      notices.set(destination, await fs.readFile(path.join(root, source)));
    } catch {
      missing.push(source);
    }
  }
  if (missing.length) {
    throw new Error(
      'Release archives would be incomplete: required licence/provenance files are missing:\n  ' +
      missing.join('\n  ')
    );
  }

  // 2. Everything else under LICENSES/ ships too, so a newly added licence text
  //    cannot be forgotten by editing only this script.
  const licenseDir = path.join(root, 'LICENSES');
  for (const file of await collectRegularFiles(licenseDir, {root: licenseDir})) {
    const destination = 'LICENSES/' + file.relative;
    if (!notices.has(destination)) notices.set(destination, await fs.readFile(file.absolute));
  }

  return notices;
}

function downloadReadme({version, recognitionBytes, fileCount}) {
  return `# 和啦 · Helā ${version} — 浏览器版（完整功能）

这是一个**已经构建好的静态网站**，不需要安装 Node.js，也不需要联网才能算点。

## 怎么打开

完整版带有本机照片识别，浏览器出于安全限制不允许从 \`file://\` 加载模块与模型，
所以请用一个本地静态服务器打开，而不是双击 index.html：

\`\`\`bash
# 任意一种，任选本机已有的工具；全部离线运行，不上传任何文件
cd hela-${version}-web
python3 -m http.server 8080 --bind 127.0.0.1
# 然后浏览器打开 http://localhost:8080/
\`\`\`

Windows 可用 \`py -m http.server 8080 --bind 127.0.0.1\`；如果你有 Node.js，也可以用 \`npx serve .\`（首次需要联网安装）。
要放到 GitHub Pages / 任意子目录，把这个目录的内容原样上传即可：所有资源都是相对路径。

只想双击就能用、且不需要照片识别？请下载 \`hela-${version}-offline.zip\` 里的单文件版。

### 如果打开后只看到一张「打开说明」卡片

页面本身自带说明，即使脚本没有执行也看得到，所以这种时候不是白屏，而是**没跑起来**：

- 先确认地址是 \`http://127.0.0.1:8080/\`（服务器目录选的是解压出来的 \`hela-${version}-web\`），
  而不是 \`file://\` 双击打开的 \`index.html\`；完整版必须由本地静态服务器提供。
- 说明卡片下面（页面底部）可能出现一条红色的启动提示，写着 \`[error]\` 或 \`[startup]\` 和
  \`build web ${version}\` 这样的构建标记。它是诊断信息，只在首页渲染成功之前出现；
  首页正常显示后不会出现，也不会盖住算点或已录入的手牌。
- 把那条提示的方括号类别和 \`build …\` 标记一起反馈即可定位是哪个产物、哪一类启动失败。

## 两种下载的区别

| | 浏览器版（本压缩包） | 离线单文件版 |
| --- | --- | --- |
| 打开方式 | 本地静态服务器 / 任意静态托管 | 双击 \`hela-<version>.html\` |
| 照片识别 | **有**（本机 WebGL，模型约 ${Math.round(recognitionBytes / 1024 / 1024)} MB） | **没有**（不含模型与运行库） |
| 算点 / 图鉴 / 教学 30 例 / 练习 / 本地点棒表 | 有 | 有 |
| 需要联网 | 不需要 | 不需要 |

## 隐私

- 照片只在本机浏览器里解码与推理：不上传、不写入磁盘、不进入任何网络请求。
- 没有遥测、没有远程字体、没有外部 CDN 运行依赖。
- 记录与设置只写入本机 localStorage（前缀 \`hela-web-v1:\`）；存储被禁用时会提示“仅本次会话”。
- 没有账号、没有云同步：换设备或清空浏览器数据后记录不会跟着走。

## 许可与源码

- 本项目原创**代码**：**AGPL-3.0-only**，正文见 \`LICENSE\` 与 \`LICENSES/AGPL-3.0.txt\`。
- 37 张牌面**不是原创素材**：它们是上游 \`lietxia/mahjong_graphic\` 的矢量图，按上游声明的
  **M+ 字型授權條款**使用，**不按 AGPL 或 MIT 授权**。正文见
  \`LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt\`（上游 LICENSE 原文）、
  \`LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md\`（上游 readme.md 原文）；固定提交、逐张哈希与
  来源链见 \`LICENSES/MAHJONG-GRAPHIC-NOTICE.md\` 与 \`assets/tiles/art-provenance.json\`。
- 第三方组件（和牌算点库、解压库、ONNX Runtime、字体/通知等）各自保留原许可，
  见 \`LICENSES/\` 与 \`THIRD_PARTY_NOTICES.md\`；识别权重单独标注为 AGPL-3.0，
  来源、固定 commit、校验和与转换脚本见 \`LICENSES/vision/\`。
- **对应源码**：同一 release 中的 \`hela-${version}-source.zip\` 是构建本页面所用的完整源码，
  包含牌面来源记录、模型转换脚本与运行时补丁材料，不是只给链接。
- 本包附带的许可与来源清单是工程分发材料，不构成对全部权利或法律合规的保证。

本目录共 ${fileCount} 个文件（含本说明与许可材料），校验值见 release 页面的 \`SHA256SUMS\`。
`;
}

function offlineReadme({version}) {
  return `# 和啦 · Helā ${version} — 离线单文件版

\`hela-${version}.html\` 是一个可以直接双击打开的**单文件**页面：
算点、43 役图鉴、30 个教学示例、组牌练习、算点练习、本地四人点棒表、三语、三主题都在里面。

## 使用

1. 解压本压缩包，得到 \`hela-${version}.html\`。
2. 先把文件保存到本机，再双击用浏览器打开（断网也能用）。
3. 想换设备？把这个 html 文件拷过去即可，不需要服务器。

### 如果只看到一张「打开说明」卡片 / 页面底部有一条启动提示

单文件版把打开说明写在 HTML 里，所以脚本被拦截或浏览器不执行页面脚本时，看到的仍然是
这段说明而不是白屏：

- 说明卡片里的「正在启动…」一直不动：多半是当前浏览器（或内嵌预览器、文件管理器预览）
  不执行页面脚本，换 Chrome / Edge / Safari / Firefox 打开同一个文件即可，**不需要联网**。
- 页面底部若出现红色的启动提示，第一行是提示类别 \`[error]\` / \`[load]\` / \`[startup]\`
  之一，末行带 \`build single ${version}\` 构建标记；它只出现在首页渲染成功之前，
  首页正常显示后不会出现，也不会覆盖算点页或已录入的手牌。反馈时把类别与构建标记一起给出即可。

## 这个版本**没有**照片识别

单文件版在构建时把照片识别整块裁掉：不含识别模型、不含推理运行库、没有入口也没有隐藏按钮，
不会在运行时去加载或请求任何模型。需要拍照/截图识别请下载 \`hela-${version}-web.zip\` 并用本地静态
服务器打开（原因见那个包的说明：\`file://\` 不允许加载模块与模型）。

## 隐私

无遥测、无远程字体、无外部 CDN 依赖、无上传；记录只写入本机 localStorage（前缀 \`hela-web-v1:\`），
没有账号与云同步。

## 许可与源码

- 本项目原创代码：**AGPL-3.0-only**（\`LICENSE\`、\`LICENSES/AGPL-3.0.txt\`）。
- 37 张牌面**不是原创素材**，按上游 \`lietxia/mahjong_graphic\` 的 **M+ 字型授權條款**使用，
  **不按 AGPL 或 MIT 授权**：正文 \`LICENSES/MAHJONG-GRAPHIC-M-PLUS-LICENSE.txt\`（上游 LICENSE 原文）
  与 \`LICENSES/MAHJONG-GRAPHIC-UPSTREAM-README.md\`（上游 readme.md 原文），固定提交与逐张哈希见
  \`LICENSES/MAHJONG-GRAPHIC-NOTICE.md\`。
- 第三方组件保留各自许可：\`LICENSES/\`、\`THIRD_PARTY_NOTICES.md\`。
- **对应源码**：同一 release 中的 \`hela-${version}-source.zip\`（含构建脚本、牌面校验/栅格脚本与
  来源记录、模型转换/补丁材料）。
`;
}

function sourceOffer({version, sourceSha}) {
  return `# 对应源码 / Corresponding source

本构建产物（Helā ${version}）依据 AGPL-3.0 提供对应源码：

- 归档：\`hela-${version}-source.zip\`（同一 release 内）
- 归档 sha256：\`${sourceSha}\`
- 归档内容：完整公开源码树，逐文件哈希见其中的 \`SOURCE_MANIFEST.json\`；
  含牌面校验/栅格脚本 \`scripts/generate-tile-art.mjs\` 与来源记录 \`assets/tiles/art-provenance.json\`、
  模型转换与分段脚本 \`scripts/prepare-heybox-vision.py\` / \`scripts/split_vision_model.py\`、
  ONNX Runtime 源码构建补丁 \`heybox-miniprogram/vendor/ort-webgl-1.30.0/\`（上游源码 + 补丁 + 校验清单）。
- 构建方式见源码内的 \`README.md\`、\`docs/ARCHITECTURE.md\`、\`docs/VISION-MODEL.md\`。

发布或再分发本产物时，请依适用许可保持对应源码可获取；修改版本涉及远程网络交互时，也请核对 AGPL-3.0 第13条。具体义务以随包完整许可证为准。
`;
}

async function readManifest(root) {
  const file = path.join(root, 'SOURCE_MANIFEST.json');
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
  return {file, manifest, bytes: await fs.readFile(file)};
}

// Verify the on-disk tree against SOURCE_MANIFEST.json without importing the
// manifest CLI, so a stale manifest can never be packaged as "the source".
async function verifySourceTree(root, {collectFiles, compareManifests, buildManifest}) {
  const recorded = JSON.parse(await fs.readFile(path.join(root, 'SOURCE_MANIFEST.json'), 'utf8'));
  const actual = await buildManifest(root, {release: recorded.release});
  const drift = compareManifests(recorded, actual);
  if (drift.length) {
    throw new Error(
      `SOURCE_MANIFEST.json does not match the tree (${drift.length} entries):\n  ` +
      drift.slice(0, 10).join('\n  ') + (drift.length > 10 ? '\n  ...' : '') +
      '\nRun `npm run manifest` and re-run the release.'
    );
  }
  return recorded;
}

export async function buildRelease(options = {}) {
  const root = options.packageRoot || packageRoot;
  const version = options.version || await readPackageVersion(root);
  const distDir = options.distDir || path.join(root, 'dist');
  const webDir = options.webDir || path.join(distDir, 'web');
  const singleFile = options.singleFile || path.join(distDir, 'hela.html');
  const outDir = options.outDir || path.join(distDir, 'releases');
  const minRecognitionBytes = options.minRecognitionBytes ?? MIN_RECOGNITION_BYTES;
  const log = options.log || ((message) => console.log(message));

  // ---- inputs -------------------------------------------------------------
  const webIndex = path.join(webDir, 'index.html');
  const webIndexHtml = await fs.readFile(webIndex, 'utf8').catch(() => {
    throw new Error(
      `Missing built browser app: ${posix(path.relative(root, webIndex))}\n` +
      'Run `npm run build:web` first (see docs/RELEASE.md). No archive was written.'
    );
  });
  const singleBytes = await fs.readFile(singleFile).catch(() => {
    throw new Error(
      `Missing built offline page: ${posix(path.relative(root, singleFile))}\n` +
      'Run `npm run build:single` first (see docs/RELEASE.md). No archive was written.'
    );
  });

  assertSubdirectoryPortable(webIndexHtml, 'dist/web/index.html');

  // The full build must carry the recognition weights and its chunks.
  const webFiles = await collectRegularFiles(webDir, {root: webDir});
  if (!webFiles.length) throw new Error('dist/web is empty; run `npm run build:web` first.');
  const recognitionBytes = (await Promise.all(webFiles.map(async file => {
    if (!RECOGNITION_FILE.test(file.relative)) return 0;
    return (await fs.stat(file.absolute)).size;
  }))).reduce((sum, size) => sum + size, 0);
  if (recognitionBytes < minRecognitionBytes) {
    throw new Error(
      `dist/web carries only ${recognitionBytes} bytes of recognition assets ` +
      `(< ${minRecognitionBytes}); the full build must include the model chunks.\n` +
      'Re-run `npm run build:web`; refusing to publish a build that silently lost photo recognition.'
    );
  }

  // The single page may ship its build metafile next to it (dist/single-metafile.json);
  // use it when present to prove no recognition input was compiled in.
  const singleMetafilePath = options.singleMetafile || path.join(path.dirname(singleFile), 'single-metafile.json');
  const singleMetafile = JSON.parse(await fs.readFile(singleMetafilePath, 'utf8').catch(() => 'null'));
  assertOfflineHasNoRecognition(singleBytes, singleMetafile);

  const notices = await readNotices(root);
  const sourceManifest = await readManifest(root);

  // ---- web archive --------------------------------------------------------
  // The built app keeps the archive root, so extracting and serving the folder is
  // all a user has to do; the notices sit next to it and are simply served too.
  const webEntries = {};
  for (const file of webFiles) {
    if (FORBIDDEN_ARCHIVE_PATH.test(file.relative)) {
      throw new Error('Refusing to package dependency or VCS path: ' + file.relative);
    }
    webEntries[file.relative] = new Uint8Array(await fs.readFile(file.absolute));
  }
  const addNotice = (destination, bytes) => {
    if (webEntries[destination]) {
      throw new Error('The built app already contains ' + destination + '; refusing to overwrite a shipped file.');
    }
    webEntries[destination] = new Uint8Array(bytes);
  };
  for (const [destination, bytes] of notices) addNotice(destination, bytes);
  addNotice('README-DOWNLOAD.md', Buffer.from(
    downloadReadme({version, recognitionBytes, fileCount: Object.keys(webEntries).length + 1}), 'utf8'
  ));

  // ---- offline archive ----------------------------------------------------
  const offlineEntries = {};
  offlineEntries[`hela-${version}.html`] = new Uint8Array(singleBytes);
  for (const [destination, bytes] of notices) offlineEntries[destination] = new Uint8Array(bytes);
  offlineEntries['README-OFFLINE.md'] = new Uint8Array(Buffer.from(offlineReadme({version}), 'utf8'));

  // ---- source archive -----------------------------------------------------
  const manifestTools = await import('./source-manifest.mjs');
  const recorded = await verifySourceTree(root, manifestTools);
  const sourceEntries = {};
  for (const relative of Object.keys(recorded.files)) {
    if (FORBIDDEN_ARCHIVE_PATH.test(relative)) {
      throw new Error('Refusing to package dependency or VCS path: ' + relative);
    }
    sourceEntries[relative] = new Uint8Array(await fs.readFile(path.join(root, relative)));
  }
  sourceEntries['SOURCE_MANIFEST.json'] = new Uint8Array(sourceManifest.bytes);

  // ---- write --------------------------------------------------------------
  await fs.mkdir(outDir, {recursive: true});
  const outputs = [];
  const writeArchive = async (name, entries) => {
    const zipped = zipSync(entries, {level: 9, mtime: ARCHIVE_MTIME});
    await fs.writeFile(path.join(outDir, name), zipped);
    outputs.push({
      name,
      bytes: zipped.length,
      sha256: digest(zipped),
      entries: Object.keys(entries).length,
      kind: name.includes('-web') ? 'web-app' : name.includes('-offline') ? 'offline-single-html' : 'source',
      includes: archivedName({sha256: digest(zipped), bytes: zipped.length, entries: Object.keys(entries).length})
    });
    return zipped;
  };

  await writeArchive(`hela-${version}-web.zip`, webEntries);
  await writeArchive(`hela-${version}-offline.zip`, offlineEntries);
  const sourceZip = await writeArchive(`hela-${version}-source.zip`, sourceEntries);
  const sourceSha = digest(sourceZip);

  // The single HTML is also published on its own, and every archive states where
  // its corresponding source is, so the offer cannot rot.
  await fs.writeFile(path.join(outDir, `hela-${version}.html`), singleBytes);
  outputs.push({
    name: `hela-${version}.html`,
    bytes: singleBytes.length,
    sha256: digest(singleBytes),
    kind: 'offline-single-html',
    includes: 'single-file offline build (no recognition)'
  });

  const offer = Buffer.from(sourceOffer({version, sourceSha}), 'utf8');
  const offerName = `hela-${version}-SOURCE.md`;
  await fs.writeFile(path.join(outDir, offerName), offer);
  outputs.push({
    name: offerName,
    bytes: offer.length,
    sha256: digest(offer),
    kind: 'corresponding-source-notice',
    includes: 'corresponding-source notice pointing at the versioned source archive'
  });

  const sums = outputs
    .filter(output => output.name !== 'SHA256SUMS')
    .map(output => `${output.sha256}  ${output.name}`)
    .join('\n') + '\n';
  await fs.writeFile(path.join(outDir, 'SHA256SUMS'), sums);
  outputs.push({
    name: 'SHA256SUMS',
    bytes: Buffer.byteLength(sums),
    sha256: digest(Buffer.from(sums, 'utf8')),
    kind: 'checksums',
    includes: `${outputs.length} entries`
  });

  const releaseManifest = {
    schemaVersion: 1,
    package: 'hela-riichi-score',
    version,
    generatedAt: ARCHIVE_MTIME.toISOString(),
    generator: 'scripts/release-packages.mjs',
    node: process.versions.node,
    sourceManifest: {
      file: 'SOURCE_MANIFEST.json',
      sha256: digest(sourceManifest.bytes),
      fileCount: recorded.fileCount,
      totalBytes: recorded.totalBytes
    },
    inputs: {
      web: {files: webFiles.length, recognitionBytes, minRecognitionBytes},
      offline: {
        bytes: singleBytes.length,
        recognitionMarkers: 0,
        metafile: singleMetafile ? posix(path.relative(root, singleMetafilePath)) : null,
        metafileInputs: singleMetafile ? Object.keys(singleMetafile.inputs || {}).length : null
      }
    },
    differences: {
      web: '带本机照片识别（模型与运行库随包），需用本地静态服务器或任意静态托管打开；资源均为相对路径',
      offline: '单文件，可双击；不含识别模型/运行库，也没有识别入口',
      shared: '算点、43 役图鉴、30 教学、组牌与算点练习、本地四人点棒表、三语、三主题'
    },
    licenses: {
      code: 'AGPL-3.0-only',
      artwork: 'M+ 字型授權條款（37 张牌面来自上游 mahjong_graphic，非 AGPL、非 MIT）',
      model: 'AGPL-3.0（权重单独标注，见 LICENSES/vision/）',
      notices: [...REQUIRED_NOTICES.map(([, destination]) => destination)]
    },
    outputs,
    notes: [
      '归档条目时间戳固定为 2026-10-22T00:00:00Z，相同输入重跑得到相同字节',
      '源归档等于 SOURCE_MANIFEST.json 的文件清单 + 清单自身，不含 node_modules/dist/.git',
      '本清单是工程分发材料，不构成对全部权利或法律合规的保证'
    ]
  };
  const manifestBytes = Buffer.from(JSON.stringify(releaseManifest, null, 2) + '\n', 'utf8');
  await fs.writeFile(path.join(outDir, 'release-manifest.json'), manifestBytes);

  log(`Release archives written to ${posix(path.relative(root, outDir))}/`);
  for (const output of outputs) {
    log(`  ${output.name.padEnd(28)} ${(output.bytes / 1024 / 1024).toFixed(2).padStart(7)} MiB  ${output.sha256.slice(0, 12)}…`);
  }
  log(`  ${'release-manifest.json'.padEnd(28)} ${(manifestBytes.length / 1024).toFixed(1).padStart(7)} KiB`);

  return {outDir, version, outputs, sourceManifestSha: digest(sourceManifest.bytes), recognitionBytes};
}

// Re-verify a produced release: checksums against bytes, manifest against files,
// and that no archive contains dependency, VCS or absolute-path content.
export async function verifyRelease(dir) {
  const problems = [];
  const sumsText = await fs.readFile(path.join(dir, 'SHA256SUMS'), 'utf8');
  const listed = new Map();
  for (const line of sumsText.split('\n')) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (match) listed.set(match[2], match[1]);
  }
  if (!listed.size) problems.push('SHA256SUMS has no entries');

  const present = (await fs.readdir(dir)).filter(name => name !== 'SHA256SUMS' && name !== 'release-manifest.json');
  for (const name of present) {
    if (!listed.has(name)) problems.push('not listed in SHA256SUMS: ' + name);
  }
  for (const [name, expected] of listed) {
    const bytes = await fs.readFile(path.join(dir, name)).catch(() => null);
    if (!bytes) { problems.push('listed but missing: ' + name); continue; }
    if (digest(bytes) !== expected) problems.push('checksum mismatch: ' + name);
  }

  const manifest = JSON.parse(await fs.readFile(path.join(dir, 'release-manifest.json'), 'utf8'));
  for (const output of manifest.outputs) {
    const bytes = await fs.readFile(path.join(dir, output.name)).catch(() => null);
    if (!bytes) { problems.push('release manifest lists a missing file: ' + output.name); continue; }
    if (bytes.length !== output.bytes) problems.push('size mismatch vs release manifest: ' + output.name);
    if (digest(bytes) !== output.sha256) problems.push('hash mismatch vs release manifest: ' + output.name);
  }

  for (const name of present.filter(entry => entry.endsWith('.zip'))) {
    const entries = Object.keys(unzipSync(new Uint8Array(await fs.readFile(path.join(dir, name)))));
    const forbidden = entries.filter(entry => FORBIDDEN_ARCHIVE_PATH.test(entry));
    if (forbidden.length) problems.push(name + ' contains dependency/VCS paths: ' + forbidden.slice(0, 5).join(', '));
    for (const required of ['LICENSE', 'LICENSES/AGPL-3.0.txt', 'THIRD_PARTY_NOTICES.md']) {
      if (!entries.includes(required)) problems.push(name + ' is missing ' + required);
    }
    if (name.includes('-web') && !entries.some(entry => RECOGNITION_FILE.test(entry))) {
      problems.push(name + ' has no recognition assets');
    }
    if (name.includes('-source')) {
      for (const required of ['SOURCE_MANIFEST.json', '.gitignore', 'src/engine.js', 'scripts/generate-tile-art.mjs']) {
        if (!entries.includes(required)) problems.push(name + ' is missing ' + required);
      }
    }
  }

  const sourceZip = present.find(name => name.includes('-source'));
  if (!sourceZip) problems.push('no source archive found');
  else {
    const unpacked = unzipSync(new Uint8Array(await fs.readFile(path.join(dir, sourceZip))));
    const entries = new Set(Object.keys(unpacked));
    if (!entries.has('SOURCE_MANIFEST.json')) problems.push(sourceZip + ' is missing SOURCE_MANIFEST.json');
    else {
      const manifestInZip = JSON.parse(Buffer.from(unpacked['SOURCE_MANIFEST.json']).toString('utf8'));
      const missing = Object.keys(manifestInZip.files).filter(relative => !entries.has(relative));
      if (missing.length) {
        problems.push(sourceZip + ' is missing ' + missing.length + ' file(s) listed in its own manifest: ' + missing.slice(0, 5).join(', '));
      }
      const stray = [...entries].filter(entry => !(entry in manifestInZip.files) && entry !== 'SOURCE_MANIFEST.json');
      if (stray.length) problems.push(sourceZip + ' carries ' + stray.length + ' file(s) not in its manifest: ' + stray.slice(0, 5).join(', '));
    }
  }

  return problems;
}

async function main() {
  const argv = process.argv.slice(2);
  const outIndex = argv.indexOf('--out');
  const outDir = outIndex >= 0 ? path.resolve(argv[outIndex + 1]) : path.join(packageRoot, 'dist/releases');

  if (argv.includes('--verify')) {
    const problems = await verifyRelease(outDir);
    if (problems.length) {
      console.error('Release verification failed:\n  ' + problems.join('\n  '));
      process.exitCode = 1;
      return;
    }
    console.log('Release verified: checksums, manifest and archive contents agree.');
    return;
  }

  const result = await buildRelease({outDir});
  const problems = await verifyRelease(result.outDir);
  if (problems.length) {
    console.error('Release verification failed right after packaging:\n  ' + problems.join('\n  '));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
