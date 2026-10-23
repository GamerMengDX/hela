// Shared build helpers for the two browser targets.
//
// Target 1 — `dist/web/`: a real static directory with ESM output and code
// splitting, so the photo recognition page, the ONNX runtime and every model
// segment are fetched only when a photo flow starts. Every URL is relative
// (`./...`), which keeps the build working from any GitHub Pages sub-directory.
//
// Target 2 — `dist/hela.html`: one offline file. The photo factory module and
// the asset module are replaced at build time, so no recognition code, runtime,
// weights, runtime `import()`, `fetch()` or Worker can enter that bundle. CSS,
// the bundle and the required artwork are inlined.
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,rm,stat,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const WEB_ROOT = path.join(PACKAGE_ROOT, 'web');
export const WEB_SRC = path.join(WEB_ROOT, 'src');
export const ASSETS_ROOT = path.join(PACKAGE_ROOT, 'assets');
export const DIST_ROOT = path.join(PACKAGE_ROOT, 'dist');

export const BROWSER_TARGETS = ['chrome105', 'firefox115', 'safari15.4'];

export const TILE_NAMES = Object.freeze([
  ...['m', 'p', 's'].flatMap(suit => [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => suit + n).concat([suit + '0'])),
  ...[1, 2, 3, 4, 5, 6, 7].map(n => 'z' + n)
]);

export const ICON_FILES = Object.freeze(['app-icon-buddies.webp', 'platform-icon-mochi.png']);

export async function readPackageVersion() {
  const json = JSON.parse(await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  if (typeof json.version !== 'string' || !json.version.trim()) throw new Error('package.json 缺少 version');
  return json.version;
}

export async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

export async function writeJson(file, value) {
  await mkdir(path.dirname(file), {recursive: true});
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

/**
 * Full licence texts shipped inside every browser artifact.
 *
 * The public package already carries `LICENSE` and `LICENSES/**`; the browser
 * builds embed the same bytes at build time so the help dialog and the offline
 * file never read a licence file at runtime. Nothing is fetched remotely.
 */
export const LEGAL_FILES = Object.freeze({
  agpl: 'LICENSE',
  mit: 'LICENSES/MAJIANG-CORE-MIT.txt'
});

export async function readLegalTexts() {
  const legal = {};
  for (const [key, relative] of Object.entries(LEGAL_FILES)) {
    const text = await readFile(path.join(PACKAGE_ROOT, relative), 'utf8');
    if (text.trim().length < 500) throw new Error('许可正文异常（' + relative + '）');
    legal[key] = text;
  }
  if (!/GNU AFFERO GENERAL PUBLIC LICENSE/.test(legal.agpl)) throw new Error('LICENSE 不是 AGPL 正文');
  if (!/MIT License/.test(legal.mit)) throw new Error('LICENSES/MAJIANG-CORE-MIT.txt 不是 MIT 正文');
  return legal;
}

/** Common esbuild options: same sources, same version define, metafile always on. */
export function baseOptions(version, {legal, ...extra} = {}) {
  return {
    absWorkingDir: PACKAGE_ROOT,
    bundle: true,
    platform: 'browser',
    target: BROWSER_TARGETS,
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'warning',
    metafile: true,
    define: {
      '__HELA_VERSION__': JSON.stringify(version),
      // Both build scripts pass the texts from readLegalTexts(); the sources
      // fall back to a short notice when they run without a bundler.
      ...(legal ? {'__HELA_LEGAL__': JSON.stringify(legal)} : {})
    },
    ...extra
  };
}

/** Verified tile artwork, read from the package assets (never from another tree). */
export async function readTileFiles() {
  const dir = path.join(ASSETS_ROOT, 'tiles');
  const present = (await readdir(dir)).filter(name => name.endsWith('.svg')).map(name => name.slice(0, -4)).sort();
  const expected = [...TILE_NAMES].sort();
  if (JSON.stringify(present) !== JSON.stringify(expected)) {
    throw new Error('牌面资源不完整：期望 37 张 ' + expected.join(',') + '，实际 ' + present.join(','));
  }
  const files = new Map();
  for (const name of TILE_NAMES) files.set(name, await readFile(path.join(dir, name + '.svg')));
  return files;
}

/** Copy exactly the runtime artwork the browser UI needs, keeping the layout flat. */
export async function copyRuntimeAssets(outdir) {
  const copy = async (from, to) => {
    await mkdir(path.dirname(to), {recursive: true});
    await copyFile(from, to);
  };
  const tiles = await readTileFiles();
  for (const [name, bytes] of tiles) await copy(path.join(ASSETS_ROOT, 'tiles', name + '.svg'), path.join(outdir, 'assets', 'tiles', name + '.svg'));
  for (const name of ICON_FILES) await copy(path.join(ASSETS_ROOT, name), path.join(outdir, 'assets', name));
  return {tiles: tiles.size, icons: ICON_FILES.length};
}

export const PHOTO_SLOT_STUB = `// Generated for the offline single-file build: the recognition page is
// compiled out, so this factory can never load recognition code, a runtime or
// model weights. The entry buttons are hidden and direct navigation is refused
// before this function is called.
export const PHOTO_ENABLED = false;

export async function loadPhotoPage() {
  return null;
}
`;

/** Replaces the photo factory module of the single-file build at build time. */
export function photoSlotStubPlugin() {
  return {
    name: 'hela-photo-slot-stub',
    setup(build) {
      build.onResolve({filter: /^\.[/\\]photo-slot\.js$/}, args => {
        // Relative virtual path: the metafile must not contain machine paths.
        if (args.resolveDir === WEB_SRC) return {path: 'web/src/photo-slot.js', namespace: 'hela-photo-stub'};
        return null;
      });
      build.onLoad({filter: /.*/, namespace: 'hela-photo-stub'}, () => ({contents: PHOTO_SLOT_STUB, loader: 'js'}));
    }
  };
}

const dataUri = (mime, bytes) => 'data:' + mime + ';base64,' + Buffer.from(bytes).toString('base64');

/** Builds the inlined asset module used by the single-file target. */
export async function assetMapSource() {
  const tiles = await readTileFiles();
  const entries = [...tiles].map(([name, bytes]) => '  ' + JSON.stringify(name) + ': ' + JSON.stringify(dataUri('image/svg+xml', bytes)));
  const icon = await readFile(path.join(ASSETS_ROOT, 'app-icon-buddies.webp'));
  const platformIcon = await readFile(path.join(ASSETS_ROOT, 'platform-icon-mochi.png'));
  return {
    source: [
      '// Generated for the offline single-file build.',
      '// Every required image is inlined; no path is resolved at runtime.',
      'const TILES = {',
      entries.join(',\n'),
      '};',
      'const APP_ICON = ' + JSON.stringify(dataUri('image/webp', icon)) + ';',
      'const PLATFORM_ICON = ' + JSON.stringify(dataUri('image/png', platformIcon)) + ';',
      'export const TILE_BASE = \'\';',
      'export const tileSrc = tile => TILES[tile] || APP_ICON;',
      'export const appIconSrc = () => APP_ICON;',
      'export const platformIconSrc = () => PLATFORM_ICON;',
      ''
    ].join('\n'),
    tileCount: tiles.size,
    icon: dataUri('image/webp', icon),
    platformIcon: dataUri('image/png', platformIcon)
  };
}

/** Replaces the relative-path asset module of the single-file build. */
export function assetMapPlugin(source) {
  return {
    name: 'hela-asset-map',
    setup(build) {
      build.onResolve({filter: /^\.[/\\]assets\.js$/}, args => {
        if (args.resolveDir === WEB_SRC) return {path: 'web/src/assets.js', namespace: 'hela-asset-map'};
        return null;
      });
      build.onLoad({filter: /.*/, namespace: 'hela-asset-map'}, () => ({contents: source, loader: 'js'}));
    }
  };
}

const FORBIDDEN_SINGLE_INPUT = /(^|\/)(vision\/|vendor-webgl|generated\/|heybox-miniprogram\/|onnxruntime)/;
// The directory build may reuse the platform-neutral model code of the public
// Heybox copy, but never its SDK, entry point, gate or preview helpers.
const FORBIDDEN_WEB_INPUT = /(@heybox\/hb-sdk|heybox-miniprogram\/src\/(platform|main|app|locale|repository|ui)\.js|heybox-miniprogram\/src\/dev\/|\/preview)/;

/**
 * Audits a metafile so the two targets cannot silently converge.
 * kind 'web': no Heybox SDK/entry/gate input, and the recognition code really is
 * in the graph (proving the full build keeps local recognition).
 * kind 'single': no recognition, runtime or model input at all, and no output
 * keeps a runtime import edge.
 */
export function auditMetafile(metafile, {kind}) {
  if (kind !== 'web' && kind !== 'single') throw new Error('auditMetafile 需要 kind=web|single');
  const problems = [];
  const inputs = Object.keys(metafile.inputs || {});
  if (!inputs.length) problems.push('metafile 没有记录任何输入');
  if (kind === 'single') {
    for (const input of inputs) {
      if (FORBIDDEN_SINGLE_INPUT.test(input)) problems.push('单文件图包含识别/运行时输入: ' + input);
    }
    for (const [file, output] of Object.entries(metafile.outputs || {})) {
      for (const imported of output.imports || []) problems.push('单文件图仍有运行时导入: ' + file + ' -> ' + imported.path);
    }
    return problems;
  }
  for (const input of inputs) {
    if (FORBIDDEN_WEB_INPUT.test(input)) problems.push('完整图引入了小程序平台代码: ' + input);
  }
  if (!inputs.some(input => /(^|\/)vision\/(photo-page|recognizer)\.js$/.test(input))) problems.push('完整图没有包含本机识别模块');
  return problems;
}

/**
 * Every inline `<script>` block of a document, in document order.
 *
 * The startup guard and the application bundle are separate classic inline
 * scripts, so anything that executes an artifact must run them in this order
 * instead of extracting "the" script block.
 */
export function inlineScripts(html) {
  const scripts = [];
  const pattern = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(String(html))) !== null) {
    scripts.push({attributes: match[1].trim(), code: match[2]});
  }
  return scripts;
}

/** Marker attribute of the startup guard script (must stay byte-identical in the template). */
export const STARTUP_GUARD_ATTRIBUTE = 'data-hela-startup-guard';
/** DOM id of the status line the guard may add; it never touches `#app`. */
export const STARTUP_STATUS_ID = 'hela-startup-status';
/** Ready marker the app sets on `<html>` after the first screen rendered. */
export const READY_ATTRIBUTE = 'data-hela-ready';

/**
 * Startup-visibility contract shared by the served template and both artifacts:
 * the static opening note must be in the served HTML (visible when no script
 * runs) and both startup scripts must exist in this order.
 *
 * kind 'single': the second script is the inlined classic bundle.
 * kind 'web': the second script is the ES-module entry, so its code is not part
 * of the document; the ready marker is only checked where it is visible.
 */
export function auditBootContract(html, {label = 'HTML', kind = 'single'} = {}) {
  const problems = [];
  const require = (condition, message) => { if (!condition) problems.push(label + ' ' + message); };
  // Comments explain the contract, so they must not be able to satisfy it.
  const markup = String(html).replace(/<!--[\s\S]*?-->/g, '');
  const scripts = inlineScripts(markup);
  const withoutScripts = markup.replace(/<script[\s\S]*?<\/script>/gi, '');
  // The static note lives inside #app so it shows before (and without) JavaScript.
  const appStart = withoutScripts.indexOf('id="app"');
  require(appStart >= 0, '缺少 #app 容器');
  const noteAt = withoutScripts.indexOf('id="startup-note"');
  require(noteAt >= 0, '缺少静态启动说明 #startup-note');
  if (noteAt >= 0 && appStart >= 0) {
    const appEnd = withoutScripts.indexOf('</div>', appStart);
    require(noteAt < appEnd, '静态启动说明必须在 #app 内，脚本未运行时才看得到');
  }
  // No script may be the only source of the opening instructions.
  require(withoutScripts.includes('id="startup-note"'), '静态启动说明被脚本包裹，禁用脚本时不可见');
  for (const needle of ['静态服务器', '静的サーバー', 'static server']) {
    require(withoutScripts.includes(needle), '静态说明缺少「完整 Web 版需静态服务器」提示: ' + needle);
  }
  require(/<noscript[\s>]/.test(withoutScripts), '缺少 <noscript> 说明');
  require(scripts.length === 2, '应只有启动 guard 与主脚本两个内联脚本，实际 ' + scripts.length + ' 个');
  const [guard, bundle] = scripts;
  if (guard) {
    require(guard.attributes.includes(STARTUP_GUARD_ATTRIBUTE), '第一个内联脚本必须是启动 guard');
    require(!/\bsrc=/.test(guard.attributes), '启动 guard 必须是内联脚本');
    require(!/type\s*=/.test(guard.attributes), '启动 guard 必须是经典脚本而不是 module');
    require(guard.code.includes(STARTUP_STATUS_ID), '启动 guard 未定义状态条 ' + STARTUP_STATUS_ID);
    require(guard.code.includes(READY_ATTRIBUTE), '启动 guard 未检查就绪标记 ' + READY_ATTRIBUTE);
    require(!/\bpreventDefault\s*\(/.test(guard.code), '启动 guard 不得吞掉错误');
    require(!/\bonnxruntime\b/i.test(guard.code), '启动 guard 混入了识别运行库内容');
  }
  if (bundle && kind === 'single') {
    require(!/\bsrc=/.test(bundle.attributes), '主脚本必须内联');
    require(!/type\s*=\s*"module"/.test(bundle.attributes), '主脚本仍是 ES module');
    require(bundle.code.includes(READY_ATTRIBUTE), '主脚本未设置就绪标记 ' + READY_ATTRIBUTE);
  }
  if (bundle && kind === 'web') {
    require(/type\s*=\s*"module"/.test(bundle.attributes), '完整目录版入口必须仍是 ES module');
    require(/src="\.\/main\.js"/.test(bundle.attributes), '完整目录版入口必须相对引用 ./main.js');
  }
  return problems;
}

/** Attributes of the produced single file, checked against the inline contract. */
export function auditSingleHtml(html) {
  const problems = [];
  const require = (condition, message) => { if (!condition) problems.push(message); };
  require(/<style>/.test(html), '缺少内联 <style>');
  require(/<script>/.test(html), '缺少内联 <script>');
  problems.push(...auditBootContract(html, {label: '单文件'}));
  require(!/<script[^>]+src=/.test(html), '仍有外链脚本');
  require(!/<link[^>]+stylesheet/.test(html), '仍有外链样式表');
  require(!/type="module"/.test(html), '单文件仍然是 ES module');
  require(!/\bimport\s*\(/.test(html), '仍有运行时动态 import()');
  require(!/\bnew\s+Worker\b|\bimportScripts\b/.test(html), '仍有 Worker 或 importScripts');
  require(!/\bfetch\s*\(|\bXMLHttpRequest\b/.test(html), '仍有运行时 fetch/XHR');
  require(!/\bsrc="https?:|\bhref="https?:|\burl\(["']?https?:/.test(html), '仍有外部资源地址');
  require(/data:image\/svg\+xml;base64,/.test(html), '牌面图像未内联');
  require(/data:image\/webp;base64,/.test(html), '应用图标未内联');
  require(/data:image\/png;base64,/.test(html), '平台图标未内联');
  for (const forbidden of ['vendor-webgl', 'onnxruntime', 'generated/main-s', 'generated/aux-s']) {
    require(!html.includes(forbidden), '单文件仍包含识别资源: ' + forbidden);
  }
  return problems;
}

/** Escapes inline text so a literal end tag cannot close the wrapper element. */
export function escapeForInline(text, tag) {
  return String(text).replace(new RegExp('</' + tag, 'gi'), () => '<\\/' + tag);
}

export async function ensureEmptyDir(dir) {
  await rm(dir, {recursive: true, force: true});
  await mkdir(dir, {recursive: true});
}

export async function directorySize(dir) {
  let total = 0;
  const walk = async current => {
    for (const entry of await readdir(current, {withFileTypes: true})) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else total += (await stat(full)).size;
    }
  };
  await walk(dir);
  return total;
}

export const formatBytes = bytes => (bytes / 1024 / 1024).toFixed(2) + ' MiB';
