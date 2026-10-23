// Build artifact tests.
//
// The offline target is rebuilt into a temporary directory and audited from its
// own metafile and output, so the exclusion of recognition/runtime/model code is
// proven by the build graph, not by a hidden button. The directory target is
// audited when `npm run build:web` has produced `dist/web`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile, readdir, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  PACKAGE_ROOT,
  auditBootContract,
  auditMetafile,
  auditSingleHtml,
  inlineScripts,
  readPackageVersion,
  TILE_NAMES
} from '../scripts/web-build-lib.mjs';

const TMP = path.join(PACKAGE_ROOT, 'test', '.tmp-web-build');
const RUN = path.join(PACKAGE_ROOT, 'dist', 'web');

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {cwd: PACKAGE_ROOT, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error('命令失败 (' + code + '): node ' + args.join(' ') + '\n' + output)));
  });
}

const exists = async file => {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
};

test('the offline single-file build excludes recognition code, runtime and model data', async () => {
  await rm(TMP, {recursive: true, force: true});
  try {
    await runNode([path.join(PACKAGE_ROOT, 'scripts', 'build-single.mjs'), '--out', TMP]);
    const htmlFile = path.join(TMP, 'hela.html');
    const metaFile = path.join(TMP, 'single-metafile.json');
    assert.ok(await exists(htmlFile), '缺少 hela.html');
    assert.ok(await exists(metaFile), '缺少 single-metafile.json');

    const html = await readFile(htmlFile, 'utf8');
    const meta = JSON.parse(await readFile(metaFile, 'utf8'));

    // 1. The build graph itself must not contain recognition inputs.
    assert.deepEqual(auditMetafile({inputs: Object.fromEntries(meta.inputs.map(input => [input, {}])), outputs: {}}, {kind: 'single'}), []);
    for (const input of meta.inputs) {
      assert.ok(!/(^|\/)vision\//.test(input), '单文件图含 vision 目录: ' + input);
      assert.ok(!/vendor-webgl|generated\/|onnxruntime|heybox-miniprogram/.test(input), '单文件图含识别资源: ' + input);
    }
    // The photo factory really was replaced at build time.
    assert.ok(meta.inputs.includes('hela-photo-stub:web/src/photo-slot.js'), '单文件构建未替换照片工厂');
    assert.ok(meta.inputs.includes('hela-asset-map:web/src/assets.js'), '单文件构建未替换资源映射');

    // 2. The produced document must be one offline file.
    assert.deepEqual(auditSingleHtml(html), []);
    // Exactly two classic inline scripts: the startup guard and the app bundle.
    const scripts = inlineScripts(html);
    assert.equal(scripts.length, 2, '应当只有启动 guard 与主脚本两个内联脚本');
    assert.equal(html.match(/<script/g)?.length, 2, '不允许多余的脚本标签');
    assert.equal(html.match(/<\/script>/g)?.length, 2, '脚本文本内的结束标记必须转义');
    assert.match(scripts[0].attributes, /data-hela-startup-guard/, '第一个内联脚本必须是启动 guard');
    assert.equal(scripts[1].attributes, '', '主脚本必须内联');
    // Two inline style blocks: the boot styles and the bundled app CSS.
    assert.equal(html.match(/<style/g)?.length, 2, '应当有启动占位与内联样式两个样式块');
    // Startup visibility: static note + noscript + ready marker inside the bundle.
    assert.deepEqual(auditBootContract(html, {label: '单文件'}), []);
    assert.ok(html.includes('id="startup-note"'), '单文件缺少静态启动说明');
    assert.ok(/<noscript>/.test(html), '单文件缺少 noscript 说明');
    assert.ok(scripts[1].code.includes('data-hela-ready'), '主脚本缺少就绪标记');
    assert.ok(Buffer.byteLength(html) > 200_000, '单文件体积异常，可能没有内联资源');
    assert.ok(Buffer.byteLength(html) < 4 * 1024 * 1024, '单文件体积过大，可能混入了模型数据');
    assert.ok(html.includes('data:image/svg+xml;base64,'), '牌面未内联');
    // Licence visibility: the offline file embeds both full texts and the
    // same-version source archive name, without reading anything at runtime.
    assert.ok(html.includes('GNU AFFERO GENERAL PUBLIC LICENSE'), '单文件未内嵌 AGPL 正文');
    assert.ok(html.includes('Copyright (c) 2021 Satoshi Kobayashi'), '单文件未内嵌 majiang-core MIT 正文');
    // The archive name is assembled at runtime from the injected version, so the
    // artifact carries the version plus the `-source.zip` suffix literal.
    assert.ok(html.includes('-source.zip'), '单文件缺少源码包名后缀');
    assert.ok(html.includes(await readPackageVersion()), '单文件缺少用途版本号');
    assert.ok(!/href="[^"]*\.zip"/.test(html), '源码包不应是运行时的远端下载链接');
    assert.ok(!/LICENSE|MAJIANG-CORE-MIT/.test(meta.inputs.join('\n')), '单文件输入图不应读取许可文件');
    // The offline build states that photo recognition is not included.
    assert.ok(/照片识别|写真認識|Photo recognition/.test(html), '缺少离线版照片识别说明');
    // No framework or platform leftovers.
    for (const forbidden of ['hb-sdk', 'heybox-miniprogram', 'miniProgramId', 'preview=']) {
      assert.ok(!html.includes(forbidden), '单文件仍含平台残留: ' + forbidden);
    }
    console.log('[test] 单文件 ' + (Buffer.byteLength(html) / 1024 / 1024).toFixed(2) + ' MiB · 输入 ' + meta.inputs.length + ' 个 · 无识别/运行时/模型');
  } finally {
    await rm(TMP, {recursive: true, force: true});
  }
});

test('the directory build is relative-only ESM with on-demand recognition chunks', async t => {
  if (!await exists(path.join(RUN, 'metafile.json'))) {
    t.skip('dist/web 尚未构建；先运行 npm run build:web');
    return;
  }
  const meta = JSON.parse(await readFile(path.join(RUN, 'metafile.json'), 'utf8'));
  const entryFile = path.join(RUN, 'main.js');
  const entry = await readFile(entryFile, 'utf8');

  // Relative URLs only: no absolute /assets or repository-name prefix.
  for (const relative of Object.keys(meta.outputs)) {
    const importPaths = [...(meta.outputs[relative].imports || []), ...(meta.outputs[relative].dynamicImports || [])];
    for (const imported of importPaths) {
      assert.ok(imported.path.startsWith('dist/web/'), '产物引用不在输出目录内: ' + imported.path);
    }
  }
  const html = await readFile(path.join(RUN, 'index.html'), 'utf8');
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert.ok(references.length >= 3, 'index.html 资源引用过少: ' + references.length);
  for (const reference of references) {
    assert.ok(reference.startsWith('./'), '存在非相对地址: ' + reference);
    assert.ok(!/^(?:https?:)?\/\//.test(reference), '存在外部地址: ' + reference);
  }

  // The entry must lazy-load the photo page instead of statically bundling it.
  assert.ok(entry.includes('import("./chunks/'), '入口没有动态加载照片页');
  assert.ok(!/InferenceSession|onnxruntime/.test(entry), '入口包含推理运行时代码');
  const entryBytes = Buffer.byteLength(entry);
  assert.ok(entryBytes < 400_000, '入口过大，识别代码可能被静态打包: ' + entryBytes);

  // Recognition, runtime and model inputs really are part of the full graph.
  const inputs = Object.keys(meta.inputs);
  assert.ok(inputs.some(input => /vision\/photo-page\.js$/.test(input)), '完整图缺少照片页');
  assert.ok(inputs.some(input => /vision\/recognizer\.js$/.test(input)), '完整图缺少识别入口');
  assert.ok(inputs.some(input => /vendor-webgl\.js$/.test(input)), '完整图缺少推理运行库');
  assert.ok(inputs.some(input => /generated\/main-s\d+-\d+\.js$/.test(input)), '完整图缺少主模型分段');
  assert.deepEqual(auditMetafile(meta, {kind: 'web'}), []);

  // Every model segment is its own chunk, so it is fetched only when needed.
  const segmentChunks = Object.keys(meta.outputs).filter(file => /chunks\/(main|aux)-s\d+-\d+-/.test(file));
  assert.ok(segmentChunks.length >= 100, '模型分段没有独立分块: ' + segmentChunks.length);

  // Artwork is present and relative.
  const tiles = (await readdir(path.join(RUN, 'assets', 'tiles'))).filter(name => name.endsWith('.svg'));
  assert.deepEqual(tiles.sort(), [...TILE_NAMES].map(name => name + '.svg').sort());
  for (const icon of ['app-icon-buddies.webp', 'platform-icon-mochi.png']) {
    assert.ok(await exists(path.join(RUN, 'assets', icon)), '缺少图标 ' + icon);
  }
  console.log('[test] 完整目录入口 ' + (entryBytes / 1024).toFixed(0) + ' KiB · 分块 ' +
    Object.keys(meta.outputs).filter(file => file.includes('/chunks/')).length + ' 个 · 模型分块 ' + segmentChunks.length + ' 个');
});

test('the offline build hides and refuses the photo entry', async () => {
  const calculator = await readFile(path.join(PACKAGE_ROOT, 'web', 'src', 'calculator.js'), 'utf8');
  assert.ok(/this\.config\.onPhoto \?/.test(calculator), '算点页没有按可用性隐藏照片入口');
  const app = await readFile(path.join(PACKAGE_ROOT, 'web', 'src', 'app.js'), 'utf8');
  assert.ok(/if\(view==='photo'&&!PHOTO_ENABLED\)/.test(app), '缺少直接导航拦截');
  assert.ok(/if\(!PHOTO_ENABLED\)\{this\.message\(webText\('web\.photo\.unavailable'\)\);return;\}/.test(app), '缺少照片入口拦截提示');
  assert.ok(/PHOTO_ENABLED\?\{onPhoto:/.test(app), '算点页仍无条件传入照片入口');
  const slot = await readFile(path.join(PACKAGE_ROOT, 'web', 'src', 'photo-slot.js'), 'utf8');
  assert.ok(/export const PHOTO_ENABLED = true;/.test(slot), '源照片工厂应为启用状态');
  assert.ok(/import\('\.\/vision\/photo-page\.js'\)/.test(slot), '照片页必须按需动态加载');
});

test('the model metadata copy stays byte-identical to the public mini-program copy', async () => {
  // The generated*/vendor/shared modules are facades, but the manifest is a
  // copy: it must not drift when the model segmentation is regenerated.
  const webCopy = path.join(PACKAGE_ROOT, 'web', 'src', 'vision', 'generated', 'manifest.json');
  const source = path.join(PACKAGE_ROOT, 'heybox-miniprogram', 'src', 'vision', 'generated', 'manifest.json');
  const [webBytes, sourceBytes] = await Promise.all([readFile(webCopy), readFile(source)]);
  assert.deepEqual(webBytes, sourceBytes, '模型元数据副本与小程序副本不一致，请重新复制');
  const manifest = JSON.parse(webBytes.toString('utf8'));
  assert.ok(manifest.models?.main?.inputSize, '模型元数据缺少输入尺寸');
});

test('the browser sources keep their storage isolation and asset indirection', async () => {
  const assets = await readFile(path.join(PACKAGE_ROOT, 'web', 'src', 'assets.js'), 'utf8');
  assert.ok(/\.svg'/.test(assets), '牌面应指向公开工程的 SVG');
  for (const file of ['app.js', 'ui.js', 'calculator.js', 'teaching-view.js']) {
    const text = await readFile(path.join(PACKAGE_ROOT, 'web', 'src', file), 'utf8');
    assert.ok(!/\.\/assets\/tiles\//.test(text), file + ' 仍硬编码牌面路径，单文件无法内联');
  }
  const platform = await readFile(path.join(PACKAGE_ROOT, 'web', 'src', 'platform.js'), 'utf8');
  assert.ok(/hela-web-v1:/.test(platform), '存储前缀缺失');
  assert.ok(!/hb-sdk/.test(platform), '浏览器适配器不得依赖小黑盒 SDK');
  const repository = await readFile(path.join(PACKAGE_ROOT, 'web', 'src', 'repository.js'), 'utf8');
  assert.ok(!/hela_ui_polish_test_v1/.test(repository), '浏览器版不应沿用内部测试存储键');
});

test('the startup-visibility audit rejects a template that loses its static note or guard', async () => {
  const template = await readFile(path.join(PACKAGE_ROOT, 'web', 'index.html'), 'utf8');
  // The served template must satisfy the contract for the directory build.
  assert.deepEqual(auditBootContract(template, {label: 'web/index.html', kind: 'web'}), []);

  const noteRenamed = template.replace('id="startup-note"', 'id="boot-note"');
  assert.ok(auditBootContract(noteRenamed, {kind: 'web'}).some(problem => problem.includes('startup-note')), '未拒绝缺少静态说明的模板');

  const noteOutsideApp = template.replace('<div id="app">', '<div id="app"></div>');
  assert.ok(auditBootContract(noteOutsideApp, {kind: 'web'}).some(problem => problem.includes('静态启动说明必须在 #app 内')), '未拒绝把说明移出 #app 的模板');

  const guardDropped = template.replace(' data-hela-startup-guard', '');
  assert.ok(auditBootContract(guardDropped, {kind: 'web'}).some(problem => problem.includes('启动 guard')), '未拒绝缺少启动 guard 的模板');

  const noscriptDropped = template.replace(/<noscript>/g, '<section>').replace(/<\/noscript>/g, '</section>');
  assert.ok(auditBootContract(noscriptDropped, {kind: 'web'}).some(problem => problem.includes('noscript')), '未拒绝缺少 noscript 的模板');

  const noServerHint = template.replace(/静态服务器/g, '浏览器').replace(/静的サーバー/g, 'ブラウザ').replace(/static server/g, 'browser');
  assert.ok(auditBootContract(noServerHint, {kind: 'web'}).some(problem => problem.includes('静态服务器')), '未拒绝缺少静态服务器说明的模板');
});

test('inlineScripts returns every script block in document order', async () => {
  const html = '<p>x</p><script>first()</script><script data-flag>second()</script>';
  assert.deepEqual(inlineScripts(html).map(script => script.code), ['first()', 'second()']);
  assert.equal(inlineScripts(html)[1].attributes, 'data-flag');
  // An escaped end tag inside a script body must not split the block.
  const escaped = '<script>a("<\\/script>")</script>';
  assert.deepEqual(inlineScripts(escaped).map(script => script.code), ['a("<\\/script>")']);
});
