#!/usr/bin/env node
// Offline single-file target:
//
//   npm run build:single     -> dist/hela.html (+ dist/single-metafile.json)
//
// Guarantees enforced here (and re-checked by the tests):
//   * the photo factory module is replaced at build time, so no recognition
//     code, ONNX runtime or model weights can reach the bundle;
//   * the bundle is one IIFE with no runtime import(), fetch() or Worker;
//   * CSS and every required image are inlined (tile artwork, app icon,
//     platform icon), and a literal end tag inside the inlined text is escaped.
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import * as esbuild from 'esbuild';

import {
  DIST_ROOT,
  WEB_ROOT,
  WEB_SRC,
  assetMapPlugin,
  assetMapSource,
  auditBootContract,
  auditMetafile,
  auditSingleHtml,
  baseOptions,
  escapeForInline,
  formatBytes,
  photoSlotStubPlugin,
  readLegalTexts,
  readPackageVersion,
  sha256,
  writeJson
} from './web-build-lib.mjs';

function outputRoot() {
  const index = process.argv.indexOf('--out');
  if (index > 0 && process.argv[index + 1]) return path.resolve(process.argv[index + 1]);
  return DIST_ROOT;
}

function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error('index.html 模板异常（' + label + ' 出现 ' + count + ' 次）');
  // The inlined text is data: a function replacer keeps `$&`/`$\'` sequences in
  // the bundle from being expanded as replacement patterns.
  return source.replace(from, () => to);
}

async function main() {
  const version = await readPackageVersion();
  const outRoot = outputRoot();
  await mkdir(outRoot, {recursive: true});

  const assets = await assetMapSource();
  const legal = await readLegalTexts();
  const result = await esbuild.build(baseOptions(version, {
    legal,
    entryPoints: [path.join(WEB_SRC, 'main.js')],
    outfile: path.join(outRoot, 'hela.bundle.js'),
    format: 'iife',
    bundle: true,
    splitting: false,
    minify: true,
    write: false,
    plugins: [photoSlotStubPlugin(), assetMapPlugin(assets.source)]
  }));

  const problems = auditMetafile(result.metafile, {kind: 'single'});
  if (problems.length) {
    for (const problem of problems) console.error('[build:single] ' + problem);
    throw new Error('单文件构建审计未通过（' + problems.length + ' 项）');
  }

  const files = result.outputFiles || [];
  const js = files.find(file => file.path.endsWith('.js'));
  const css = files.find(file => file.path.endsWith('.css'));
  if (!js || !css) throw new Error('单文件构建缺少 JS 或 CSS 产物');
  if (files.length !== 2) throw new Error('单文件构建产生了多余产物: ' + files.map(file => path.basename(file.path)).join(', '));

  const template = await readFile(path.join(WEB_ROOT, 'index.html'), 'utf8');
  // The template must already carry the static opening note and the classic
  // startup guard; inlining below only replaces the module entry and the assets.
  const templateProblems = auditBootContract(template, {label: 'web/index.html', kind: 'web'});
  if (templateProblems.length) {
    for (const problem of templateProblems) console.error('[build:single] ' + problem);
    throw new Error('web/index.html 启动可见性约定未通过（' + templateProblems.length + ' 项）');
  }
  let html = template;
  html = replaceOnce(html, '<script type="module" src="./main.js"></script>', '<script>\n' + escapeForInline(js.text, 'script') + '\n</script>', '内联脚本');
  html = replaceOnce(html, '<link rel="stylesheet" href="./main.css">', '<style>\n' + escapeForInline(css.text, 'style') + '\n</style>', '内联样式');
  html = replaceOnce(html, '<link rel="icon" href="./assets/platform-icon-mochi.png">', '<link rel="icon" href="' + assets.platformIcon + '">', '平台图标');
  html = replaceOnce(html, '<link rel="apple-touch-icon" href="./assets/app-icon-buddies.webp">', '<link rel="apple-touch-icon" href="' + assets.icon + '">', '应用图标');
  html = replaceOnce(html, '<meta name="theme-color" content="#263e4b">',
    '<meta name="theme-color" content="#263e4b">\n<meta name="hela-build" content="single ' + version + '">', '构建标记');

  const htmlProblems = auditSingleHtml(html);
  if (htmlProblems.length) {
    for (const problem of htmlProblems) console.error('[build:single] ' + problem);
    throw new Error('单文件内容审计未通过（' + htmlProblems.length + ' 项）');
  }

  const htmlFile = path.join(outRoot, 'hela.html');
  await writeFile(htmlFile, html, 'utf8');
  await writeJson(path.join(outRoot, 'single-metafile.json'), {
    target: 'single',
    version,
    entry: 'web/src/main.js',
    inputs: Object.keys(result.metafile.inputs).sort(),
    outputs: Object.keys(result.metafile.outputs),
    inlined: {tiles: assets.tileCount, cssBytes: Buffer.byteLength(css.text), jsBytes: Buffer.byteLength(js.text)},
    htmlSha256: await sha256(htmlFile),
    htmlBytes: Buffer.byteLength(html)
  });

  console.log('[build:single] 版本 ' + version + ' · 单文件 ' + formatBytes(Buffer.byteLength(html)) +
    ' · 内联牌面 ' + assets.tileCount + ' 张 + 图标 2 个 · 无识别/运行时/模型输入');
  console.log('[build:single] 输出 ' + path.relative(process.cwd(), htmlFile) + ' · metafile ' + path.relative(process.cwd(), path.join(outRoot, 'single-metafile.json')));
}

main().catch(error => {
  console.error('[build:single] 失败: ' + (error?.stack || error));
  process.exitCode = 1;
});
