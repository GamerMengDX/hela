#!/usr/bin/env node
// Full browser target: a static ESM directory with code splitting.
//
//   npm run build:web        -> dist/web/index.html + dist/web/main.js + chunks
//
// The photo recognition page, the ONNX Runtime WebGL build and the model
// segments are dynamic imports, so they land in their own chunks and are
// fetched only when a photo flow starts. All URLs stay relative, so the folder
// works from the root of a host or from any GitHub Pages sub-directory.
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import * as esbuild from 'esbuild';

import {
  ASSETS_ROOT,
  DIST_ROOT,
  WEB_ROOT,
  WEB_SRC,
  auditBootContract,
  auditMetafile,
  baseOptions,
  copyRuntimeAssets,
  directorySize,
  ensureEmptyDir,
  formatBytes,
  readLegalTexts,
  readPackageVersion,
  writeJson
} from './web-build-lib.mjs';

const OUTDIR = path.join(DIST_ROOT, 'web');

async function main() {
  const version = await readPackageVersion();
  const legal = await readLegalTexts();
  await ensureEmptyDir(OUTDIR);

  const result = await esbuild.build(baseOptions(version, {
    legal,
    entryPoints: [path.join(WEB_SRC, 'main.js')],
    outdir: OUTDIR,
    format: 'esm',
    splitting: true,
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'assets/[name]-[hash]',
    minify: true,
    // Keep the directory build honest: nothing may be left as an external import.
    external: []
  }));

  const problems = auditMetafile(result.metafile, {kind: 'web'});
  if (problems.length) {
    for (const problem of problems) console.error('[build:web] ' + problem);
    throw new Error('完整目录构建审计未通过（' + problems.length + ' 项）');
  }

  const assets = await copyRuntimeAssets(OUTDIR);
  const template = await readFile(path.join(WEB_ROOT, 'index.html'), 'utf8');
  // Startup visibility is part of the shipped document: the static opening note
  // and the classic guard must survive in the served index.html.
  const bootProblems = auditBootContract(template, {label: 'web/index.html', kind: 'web'});
  if (bootProblems.length) {
    for (const problem of bootProblems) console.error('[build:web] ' + problem);
    throw new Error('web/index.html 启动可见性约定未通过（' + bootProblems.length + ' 项）');
  }
  const outputs = Object.keys(result.metafile.outputs).map(file => path.basename(file));
  for (const required of ['main.js', 'main.css']) {
    if (!outputs.includes(required)) throw new Error('构建缺少入口产物: ' + required);
  }
  for (const referenced of ['main.js', 'main.css', './assets/platform-icon-mochi.png', './assets/app-icon-buddies.webp']) {
    if (!template.includes(referenced)) throw new Error('index.html 未引用 ' + referenced);
  }
  // Same build tag as the offline file, so a startup message can name which of
  // the two products the user actually opened.
  const builtHtml = template.replace('<meta name="theme-color" content="#263e4b">',
    '<meta name="theme-color" content="#263e4b">\n<meta name="hela-build" content="web ' + version + '">');
  if (builtHtml === template) throw new Error('index.html 缺少构建标记锚点（theme-color meta）');
  await writeFile(path.join(OUTDIR, 'index.html'), builtHtml, 'utf8');
  await writeJson(path.join(OUTDIR, 'metafile.json'), result.metafile);

  const bytes = await directorySize(OUTDIR);
  const chunks = Object.keys(result.metafile.outputs).filter(file => file.includes('/chunks/'));
  // Model segments and the runtime keep their own basenames, so the count is auditable.
  const modelChunks = chunks.filter(file => /\/(main|aux)-s\d+-\d+-|\/vendor-webgl-/.test(file)).length;
  console.log('[build:web] 版本 ' + version + ' · 产物 ' + Object.keys(result.metafile.outputs).length + ' 个 · ' +
    formatBytes(bytes) + ' · 按需分块 ' + chunks.length + ' 个（模型/运行时 ' + modelChunks + ' 个）');
  console.log('[build:web] 牌面 SVG ' + assets.tiles + ' 张 + 图标 ' + assets.icons + ' 个；metafile: ' + path.relative(process.cwd(), path.join(OUTDIR, 'metafile.json')));
  console.log('[build:web] 输出目录 ' + path.relative(process.cwd(), OUTDIR) + ' （相对路径，可直接放到任意子目录）');
}

main().catch(error => {
  console.error('[build:web] 失败: ' + (error?.stack || error));
  process.exitCode = 1;
});
