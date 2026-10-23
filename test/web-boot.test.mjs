// Boot smoke test for the browser application artifacts.
//
// A minimal DOM shim (not a browser) is installed, then the real offline artifact
// produced by `scripts/build-single.mjs` is executed: every inline script of the
// document runs in document order — the startup guard first, then the app bundle
// — exactly as a browser would run them. This proves app.js, the copied UI
// modules, the browser adapter, the locale store and the nine-grid navigation are
// wired together, and that the startup guard stays silent once the app is ready.
// When `dist/web` exists the directory entry is imported as well.
//
// Pixel output, layout and real browser behaviour are explicitly out of scope
// here and belong to manual browser QA; no file:// URL is ever opened and nothing
// is served over HTTP to stand in for a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {fileURLToPath} from 'node:url';

import {READY_ATTRIBUTE, STARTUP_STATUS_ID, auditBootContract, inlineScripts} from '../scripts/web-build-lib.mjs';

const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const TMP = path.join(PACKAGE_ROOT, 'test', '.tmp-web-boot');
const WEB_DIST = path.join(PACKAGE_ROOT, 'dist', 'web');
const VERSION = JSON.parse(await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;

function createElement(tag = 'div', registry = null) {
  const element = {
    tagName: String(tag).toUpperCase(),
    dataset: {},
    attributes: new Map(),
    listeners: new Map(),
    children: [],
    parentNode: null,
    _id: '',
    get id() { return element._id; },
    set id(value) {
      if (registry) {
        registry.delete(element._id);
        registry.set(String(value), element);
      }
      element._id = String(value);
    },
    style: {setProperty() {}, getPropertyValue() { return ''; }},
    classList: {add() {}, remove() {}, toggle() {}, contains() { return false; }},
    _html: '',
    _open: false,
    _scrollTop: 0,
    textContent: '',
    hidden: false,
    disabled: false,
    isConnected: true,
    value: '',
    get innerHTML() { return element._html; },
    set innerHTML(value) { element._html = String(value); },
    get scrollTop() { return element._scrollTop; },
    set scrollTop(value) { element._scrollTop = Number(value) || 0; },
    get open() { return element._open; },
    showModal() { element._open = true; },
    close() { element._open = false; },
    animate() { return {finished: Promise.resolve(), cancel() {}}; },
    addEventListener(type, handler) {
      if (!element.listeners.has(type)) element.listeners.set(type, new Set());
      element.listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { element.listeners.get(type)?.delete(handler); },
    dispatch(type, event) {
      for (const handler of [...(element.listeners.get(type) || [])]) handler(event);
    },
    querySelector(selector) {
      element._found ??= new Map();
      if (!element._found.has(selector)) element._found.set(selector, createElement('div', registry));
      return element._found.get(selector);
    },
    querySelectorAll() { return []; },
    setAttribute(name, value) { element.attributes.set(name, String(value)); },
    getAttribute(name) { return element.attributes.has(name) ? element.attributes.get(name) : null; },
    append() {},
    appendChild(child) {
      element.children.push(child);
      if (child && typeof child === 'object') child.parentNode = element;
      return child;
    },
    removeChild(child) {
      element.children = element.children.filter(item => item !== child);
      if (child && typeof child === 'object') child.parentNode = null;
      return child;
    },
    insertAdjacentHTML(position, html) {
      // The home/guide footers are appended to #page, so keep them visible.
      if (String(position).includes('beforeend') || String(position).includes('afterbegin')) element._html += String(html);
    },
    remove() {
      if (element.parentNode) element.parentNode.removeChild(element);
      if (registry) registry.delete(element._id);
    },
    contains() { return true; },
    closest() { return null; },
    focus() {},
    select() {},
    scrollIntoView() {},
    reportValidity() { return true; }
  };
  return element;
}

function installDom() {
  const registry = new Map();
  const roots = new Map();
  const windowListeners = new Map();
  const documentElement = createElement('html', registry);
  const body = createElement('body', registry);
  const documentStub = {
    documentElement,
    body,
    listeners: new Map(),
    createElement: tag => createElement(tag, registry),
    getElementById: id => registry.get(String(id)) || null,
    querySelector(selector) {
      if (!roots.has(selector)) {
        const node = createElement('div', registry);
        if (selector === '#app') node.id = 'app';
        roots.set(selector, node);
      }
      return roots.get(selector);
    },
    querySelectorAll() { return []; },
    addEventListener(type, handler) {
      if (!documentStub.listeners.has(type)) documentStub.listeners.set(type, new Set());
      documentStub.listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) { documentStub.listeners.get(type)?.delete(handler); },
    dispatchEvent(event) {
      for (const handler of [...(documentStub.listeners.get(event.type) || [])]) handler(event);
      return true;
    }
  };
  globalThis.document = documentStub;
  globalThis.window = globalThis;
  globalThis.addEventListener = (type, handler) => {
    if (!windowListeners.has(type)) windowListeners.set(type, new Set());
    windowListeners.get(type).add(handler);
  };
  globalThis.removeEventListener = (type, handler) => { windowListeners.get(type)?.delete(handler); };
  if (globalThis.localStorage === undefined) globalThis.__helaOwnStorage = true;
  globalThis.matchMedia = () => ({matches: true, addEventListener() {}, removeEventListener() {}});
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
  const page = () => documentStub.querySelector('#app').querySelector('#page');
  return {
    document: documentStub,
    app: () => documentStub.querySelector('#app'),
    byId: id => registry.get(String(id)) || null,
    readyAttribute: () => documentElement.getAttribute(READY_ATTRIBUTE),
    // Deliver a window-level event exactly like a browser would (uncaught error,
    // unhandled promise rejection), so the guard sees real event objects.
    emit(type, event) {
      for (const handler of [...(windowListeners.get(type) || [])]) handler(event);
    },
    page,
    // The app renders the header into #page and the screen body into #view-content.
    view: () => page().querySelector('#view-content'),
    // Home/guide/practice/lobby render into #view-content; the calculator renders into #screen.
    screen: () => page().innerHTML + page().querySelector('#view-content').innerHTML +
      page().querySelector('#calculator').querySelector('#screen').innerHTML
  };
}

// Web Storage stub: the offline bundle reads the browser platform defaults,
// so a seeded record here exercises the real startup fallback path.
function webStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); }
  };
}

const settle = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));

let artifact;
async function offlineArtifact() {
  if (artifact !== undefined) return artifact;
  await rm(TMP, {recursive: true, force: true});
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(PACKAGE_ROOT, 'scripts', 'build-single.mjs'), '--out', TMP], {cwd: PACKAGE_ROOT});
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error('build:single 失败: ' + code)));
  });
  const html = await readFile(path.join(TMP, 'hela.html'), 'utf8');
  await rm(TMP, {recursive: true, force: true});
  const scripts = inlineScripts(html);
  assert.equal(scripts.length, 2, '单文件应含启动 guard 与主脚本两个内联脚本');
  artifact = {html, scripts};
  return artifact;
}

/** Run every inline script in document order, like a browser parsing the page. */
function runScripts(scripts) {
  scripts.forEach((script, index) => {
    vm.runInThisContext(script.code, {filename: 'hela.html#script-' + index});
  });
}

/** Install the shim, run the whole document, and let the app settle. */
async function boot({ms = 40} = {}) {
  const {scripts} = await offlineArtifact();
  const dom = installDom();
  runScripts(scripts);
  await settle(ms);
  return dom;
}

function clickAction(app, action, extra = {}) {
  const button = createElement('button');
  button.dataset = {appAction: action, ...extra};
  app.dispatch('click', {target: {closest: selector => (selector === '[data-app-action]' ? button : null)}});
}

test('the artifact carries opening instructions that survive without any script', async () => {
  const {html} = await offlineArtifact();
  // Everything a reader needs when JavaScript never runs must be plain markup.
  const staticPart = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  assert.match(staticPart, /id="startup-note"/, '静态启动说明必须留在 HTML 里');
  assert.match(staticPart, /<noscript>[\s\S]*JavaScript/, '缺少 noscript 说明');
  for (const needle of [
    '把本文件保存到本机', // 中文：保存后打开
    '一般的なブラウザ', // 日本語：用常规浏览器打开
    'static server', // English: full build needs a static server
    '静的サーバー',
    '不需要联网',
    'No internet connection is required'
  ]) {
    assert.ok(staticPart.includes(needle), '静态说明缺少: ' + needle);
  }
  // The note sits inside #app, so it is the very first thing painted and it is
  // still there when JavaScript never runs.
  const appStart = staticPart.indexOf('id="app"');
  assert.ok(appStart >= 0 && staticPart.indexOf('id="startup-note"') > appStart, '静态说明必须在 #app 内');
});

test('the startup guard is the first script and the app bundle follows it', async () => {
  const {scripts} = await offlineArtifact();
  assert.match(scripts[0].attributes, /data-hela-startup-guard/, '启动 guard 必须排在主脚本之前');
  assert.ok(!/src=|type=/.test(scripts[0].attributes), '启动 guard 必须是经典内联脚本');
  assert.equal(scripts[1].attributes, '', '主脚本必须是经典内联脚本');
});

test('a startup failure shows a readable, privacy-safe status instead of a blank page', async () => {
  const {scripts} = await offlineArtifact();
  const dom = installDom();
  // Only the guard runs: the app never had a chance to render anything.
  runScripts([scripts[0]]);

  // Assembled at runtime on purpose: this test asserts that private paths are
  // scrubbed, so the fixture must not put such a path in the published tree.
  const privatePath = '/Us' + 'ers/example/private/hand.js';
  const event = {
    message: 'Uncaught ReferenceError: hand is not defined at https://example.invalid/main.js:1:1 (' +
      'file:///opt/app/secret/hand.js:3:5) opening ' + privatePath + ':9:1',
    defaultPrevented: false,
    preventDefault() { event.defaultPrevented = true; }
  };
  dom.emit('error', event);

  const panel = dom.byId(STARTUP_STATUS_ID);
  assert.ok(panel, '启动出错时应显示状态条');
  assert.equal(panel.parentNode, dom.document.body, '状态条必须挂在 body 上，而不是 #app 内');
  const text = panel.textContent;
  assert.match(text, /启动时出错/, '缺少中文错误说明');
  assert.match(text, /起動時にエラーが発生しました/, '缺少日文错误说明');
  assert.match(text, /The app hit an error while starting/, '缺少英文错误说明');
  assert.match(text, /\[error\]/, '缺少事件类别标记');
  assert.ok(text.includes('build dev'), '缺少构建标记: ' + text);
  assert.match(text, /hand is not defined/, '应保留可读的错误摘要');
  for (const forbidden of ['example.invalid', 'https://', 'file://', '/opt/app', privatePath, 'private/hand.js', '.js:']) {
    assert.ok(!text.includes(forbidden), '状态条不得包含路径/URL/堆栈: ' + forbidden);
  }
  assert.equal(event.defaultPrevented, false, 'guard 不得吞掉错误');
  assert.equal(dom.readyAttribute(), null, '启动失败时不得伪装成已就绪');
  assert.equal(dom.app().innerHTML, '', 'guard 不得改写 #app');
});

test('an error without readable text falls back to the neutral startup hint', async () => {
  const {scripts} = await offlineArtifact();
  const dom = installDom();
  runScripts([scripts[0]]);
  dom.emit('error', {});
  const panel = dom.byId(STARTUP_STATUS_ID);
  assert.ok(panel, '缺少中性提示');
  const text = panel.textContent;
  assert.match(text, /还没有完成启动/, '缺少中文中性提示');
  assert.match(text, /has not finished starting/, '缺少英文中性提示');
  assert.match(text, /\[error\]/);
  // A rejected promise with a plain reason is reported the same safe way.
  dom.emit('unhandledrejection', {reason: new Error('Failed to load ./chunks/app.js')});
  assert.match(panel.textContent, /\[rejection\]/);
  assert.match(panel.textContent, /Failed to load \.\/chunks\/app\.js/);
  // A blocked script (the classic file:// failure) arrives as an element event
  // without `message`; the relative source is the one useful, harmless detail.
  dom.emit('error', {target: {getAttribute: name => (name === 'src' ? './main.js' : null)}});
  assert.match(panel.textContent, /\[load\]/);
  assert.match(panel.textContent, /failed to load \.\/main\.js/);
});

test('a document whose scripts never run gets the neutral hint from the watchdog', async () => {
  const {scripts} = await offlineArtifact();
  const dom = installDom();
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  let pending = null;
  globalThis.setTimeout = (callback, ms) => { pending = {callback, ms}; return 424242; };
  globalThis.clearTimeout = () => {};
  try {
    runScripts([scripts[0]]);
  } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }
  assert.ok(pending, '启动 guard 应安装启动看门狗');
  assert.equal(pending.ms, 8000);
  pending.callback();
  const panel = dom.byId(STARTUP_STATUS_ID);
  assert.ok(panel, '脚本未运行时应显示中性提示');
  assert.match(panel.textContent, /还没有完成启动/);
  assert.match(panel.textContent, /\[startup\]/);
  assert.equal(dom.readyAttribute(), null);
});

test('the offline artifact boots and renders the nine-grid home screen', async () => {
  const dom = await boot();
  const content = dom.screen();

  for (const action of ['calculator', 'guide', 'practice', 'lobby', 'history', 'themes', 'help']) {
    assert.ok(content.includes('data-app-action="' + action + '"'), '首页缺少入口: ' + action);
  }
  assert.ok((content.match(/data-app-action="locale"/g) || []).length === 3, '语言开关应为三个小按钮');
  assert.ok(content.includes('brand-avatar'), '缺少圆形品牌图标');
  assert.ok(content.includes('data:image/webp;base64,'), '品牌图标未内联');
  assert.ok(content.includes('data:image/svg+xml;base64,'), '牌面未内联');
  // Offline build: no loadable image path may remain.
  assert.ok(!content.includes('./assets/tiles/'), '离线版仍引用外部牌面路径');
  // Storage is unavailable in this shim, so the session-only notice must appear.
  assert.ok(/本次修改只保留在当前标签页|このタブ内だけ|this tab only/.test(content), '缺少临时会话提示');
  // No mini-program install or test-build wording anywhere on the first screen.
  assert.ok(!/扫码|安装小程序|测试版/.test(content), '首页仍含平台安装/测试版文案');
});

test('a failure after the app is ready never replaces the rendered app or the entered hand', async () => {
  const dom = await boot();
  assert.equal(dom.readyAttribute(), 'true', '首屏渲染成功后应设置就绪标记');
  assert.equal(dom.byId(STARTUP_STATUS_ID), null, '就绪后不应残留启动状态条');

  clickAction(dom.app(), 'calculator');
  await settle();
  const before = dom.screen();
  assert.ok(before.includes('data-action="undo"'), '算点页未渲染');

  dom.emit('error', {message: 'boom'});
  dom.emit('unhandledrejection', {reason: new Error('late failure')});
  await settle(20);

  assert.equal(dom.screen(), before, '就绪后的异常不得替换已显示的应用');
  assert.equal(dom.byId(STARTUP_STATUS_ID), null, '就绪后异常不得弹出启动状态条');
  assert.equal(dom.readyAttribute(), 'true');
});

test('the offline artifact hides the photo entry but keeps the calculator usable', async () => {
  const dom = await boot();
  const app = dom.app();
  clickAction(app, 'calculator');
  await settle();
  const content = dom.screen();
  // HandEntry rendered: suit keyboard, dora/meld utilities and the tape strip.
  assert.ok(content.includes('data-action="undo"'), '算点页缺少撤销按钮');
  assert.ok(content.includes('class="suit'), '算点页缺少牌种选择');
  // The offline build must not expose the recognition entry at all.
  assert.ok(!content.includes('data-action="photo"'), '离线版仍然渲染了照片入口');
});

test('a structurally invalid stored record boots into a usable session and is left untouched', async () => {
  const original = JSON.stringify({version: 1, draft: {hand: []}});
  const store = webStorage({'hela-web-v1:hela_web_state_v1': original});
  globalThis.localStorage = store;
  try {
    const dom = await boot({ms: 60});

    // Home states the unreadable-record fallback in the active language.
    const home = dom.screen();
    assert.ok(/记录无法读取|記録を読み込めない|records could not be read/.test(home), '首页缺少记录不可读提示');
    // The app stays usable: the calculator really renders and accepts input.
    clickAction(dom.app(), 'calculator');
    await settle(60);
    const calc = dom.screen();
    assert.ok(calc.includes('data-action="undo"'), '降级后算点页无法渲染');
    assert.ok(/记录无法读取|記録を読み込めない|records could not be read/.test(calc), '算点页缺少常驻提示');
    assert.ok(calc.includes('data-web-notices'), '算点页缺少提示槽');
    // The unrecoverable record is preserved byte for byte for manual recovery.
    assert.equal(store.map.get('hela-web-v1:hela_web_state_v1'), original);
    assert.equal(store.map.has('hela-web-v1:__probe__'), false);
    // A degraded-but-usable session still counts as a successful startup.
    assert.equal(dom.readyAttribute(), 'true');
    assert.equal(dom.byId(STARTUP_STATUS_ID), null);
  } finally {
    delete globalThis.localStorage;
  }
});

test('the help sheet shows the licence summary, source archive and both full texts', async () => {
  const dom = await boot();
  clickAction(dom.app(), 'help');
  await settle(40);
  const sheet = dom.app().querySelector('#app-dialog').querySelector('#app-dialog-content').innerHTML;

  assert.ok(sheet.includes('开源与许可'), '帮助窗口缺少许可标题');
  assert.ok(sheet.includes('AGPL-3.0'), '帮助窗口缺少 AGPL 摘要');
  assert.ok(sheet.includes('hela-' + VERSION + '-source.zip'), '帮助窗口缺少同版本源码包名');
  assert.ok(sheet.includes('<details'), '完整正文应可展开');
  // Full texts are embedded and rendered escaped inside <pre>.
  assert.ok(sheet.includes('GNU AFFERO GENERAL PUBLIC LICENSE'), '缺少 AGPL 正文');
  assert.ok(sheet.includes('MIT License'), '缺少 MIT 正文');
  assert.ok(sheet.includes('class="legal-text"'), '正文缺少可滚动文本框');
  assert.ok(!/<pre class="legal-text"[^>]*>[^<]*<a /i.test(sheet), '正文不应注入链接或标记');
  // Collapsed by default: the details elements carry no `open` attribute.
  assert.ok(!/<details[^>]*\sopen/.test(sheet), '正文默认不应展开');
});

test('the calculator, teaching and photo views all expose the notice slot', async () => {
  const dom = await boot();
  const app = dom.app();

  clickAction(app, 'calculator');
  await settle(40);
  assert.ok(dom.screen().includes('data-web-notices'), '算点页缺少提示槽');
  assert.ok(/本次修改只保留在当前标签页|このタブ内だけ|this tab only/.test(dom.screen()), '算点页缺少临时会话提示');

  clickAction(app, 'guide');
  await settle(40);
  clickAction(app, 'teaching-examples');
  await settle(60);
  const teaching = dom.screen();
  assert.ok(teaching.includes('data-web-notices'), '教学页缺少提示槽');
  assert.ok(/本次修改只保留在当前标签页|このタブ内だけ|this tab only/.test(teaching), '教学页缺少临时会话提示');
});

test('the photo page renders the shared notice slot from its options', async () => {
  const dom = installDom();
  const {PhotoPage} = await import('../web/src/vision/photo-page.js');
  const frame = createElement('div');
  const page = new PhotoPage(frame, {
    base: {hand: [], melds: [], dora: [], ura: [], winIndex: -1, round: 0, seat: 1, method: 'ron', loser: 2, riichi: 0, ippatsu: false, special: 'none', honba: 0, sticks: 0, rules: {}},
    header: () => '<header class="app-nav"></header>',
    back: () => {},
    import: async () => {},
    notices: () => '<div class="notice">PHOTO-NOTICE-MARK</div>',
    version: VERSION
  });
  try {
    assert.ok(frame.innerHTML.includes('data-web-notices'), '照片页缺少提示槽');
    assert.ok(frame.innerHTML.includes('PHOTO-NOTICE-MARK'), '照片页未渲染提示内容');
  } finally {
    page.dispose();
    void dom;
  }
});

test('the offline artifact switches theme and language without reloading', async () => {
  const dom = await boot();
  const app = dom.app();

  const titles = new Map();
  for (const locale of ['zh-CN', 'ja', 'en']) {
    clickAction(app, 'locale', {value: locale});
    await settle();
    const content = dom.screen();
    const heading = /<h1>([^<]+)<\/h1>/.exec(content);
    assert.ok(heading, locale + ' 首页缺少标题');
    titles.set(locale, heading[1]);
    assert.equal(dom.document.documentElement.lang, locale);
    assert.ok(/aria-pressed="true"/.test(content), locale + ' 缺少选中语言标记');
  }
  assert.equal(new Set(titles.values()).size, 3, '三种语言的标题应当不同: ' + [...titles.values()].join(' / '));

  // Theme choice goes through the repository adapter and re-renders.
  clickAction(app, 'themes');
  await settle();
  assert.ok(dom.screen().length > 0);
  clickAction(app, 'choose-theme', {value: 'retro'});
  await settle();
  assert.equal(dom.document.documentElement.dataset.theme, 'retro');
});

test('the offline artifact reaches the guide, practice, lobby and history screens', async () => {
  const dom = await boot();
  const app = dom.app();

  clickAction(app, 'guide');
  await settle();
  let content = dom.screen();
  assert.ok(content.includes('id="guide-search"'), '图鉴缺少搜索框');
  assert.match(content, /data-app-action="guide-filter"/);
  assert.match(content, /data-app-action="teaching-examples"/);

  clickAction(app, 'practice');
  await settle();
  content = dom.screen();
  assert.ok(content.includes('id="practice-form"'), '练习缺少答案表单');
  assert.match(content, /data-answer="total"/);

  clickAction(app, 'lobby');
  await settle();
  content = dom.screen();
  assert.ok(content.includes('id="table-create-form"'), '牌桌缺少开桌表单');
  assert.equal((content.match(/name="player\d"/g) || []).length, 4, '开桌应有四名玩家输入');

  clickAction(app, 'history');
  await settle();
  content = dom.screen();
  assert.ok(/record-list|empty-state/.test(content), '历史页缺少空态或记录列表');
});

test('bonus tile guide badges are one han rather than yakuman in all locales', async () => {
  const dom = await boot();
  for (const [locale, unit] of [['zh-CN', '番'], ['ja', '翻'], ['en', 'han']]) {
    clickAction(dom.app(), 'home');
    await settle();
    clickAction(dom.app(), 'locale', {value: locale});
    await settle();
    clickAction(dom.app(), 'guide');
    await settle();
    const badges = [...dom.screen().matchAll(/<article class="card guide-card">[\s\S]*?<span class="tag">([^<]+)<\/span>/g)].map(match => match[1]);
    assert.ok(badges.length >= 43, locale + ' guide cards missing');
    assert.deepEqual(badges.slice(-3), ['1 ' + unit, '1 ' + unit, '1 ' + unit]);
  }
});

test('reload newest records performs a real page reload rather than enabling a stale controller', async () => {
  const previousLocation = globalThis.location;
  let reloads = 0;
  globalThis.location = {reload() { reloads++; }};
  try {
    const dom = await boot();
    clickAction(dom.app(), 'reload-records');
    await settle();
    assert.equal(reloads, 1);
  } finally {
    if (previousLocation === undefined) delete globalThis.location;
    else globalThis.location = previousLocation;
  }
});

test('the directory build entry boots with the same screens', async t => {
  const entry = path.join(WEB_DIST, 'main.js');
  if (!existsSync(entry)) {
    t.skip('dist/web 尚未构建；先运行 npm run build:web');
    return;
  }
  // The served index.html keeps the same startup contract as the offline file:
  // static note first, guard second, module entry last.
  const served = await readFile(path.join(WEB_DIST, 'index.html'), 'utf8');
  assert.deepEqual(auditBootContract(served, {label: 'dist/web/index.html', kind: 'web'}), []);
  const scripts = inlineScripts(served);
  assert.equal(scripts.length, 2, '完整目录版应含启动 guard 与 module 入口');
  assert.match(scripts[0].attributes, /data-hela-startup-guard/);
  assert.match(served, /<script type="module" src="\.\/main\.js"><\/script>/, '完整目录版入口必须是相对 module');
  assert.match(served, /id="startup-note"/, '完整目录版缺少静态启动说明');
  // The startup message names the product the user actually opened.
  assert.match(served, /<meta name="hela-build" content="web [^"]+">/, '完整目录版缺少构建标记');

  const dom = installDom();
  runScripts(scripts);
  await import(pathToFileURL(entry).href);
  await settle(60);
  const content = dom.screen();
  for (const action of ['calculator', 'guide', 'practice', 'lobby', 'history']) {
    assert.ok(content.includes('data-app-action="' + action + '"'), '完整目录版首页缺少入口: ' + action);
  }
  assert.equal(dom.readyAttribute(), 'true', '完整目录版启动成功后应设置就绪标记');
  assert.equal(dom.byId(STARTUP_STATUS_ID), null, '完整目录版启动成功后不应残留启动状态条');
  // The full build keeps the photo entry, because it ships the recognition page.
  clickAction(dom.app(), 'calculator');
  await settle(60);
  assert.ok(dom.screen().includes('data-action="photo"'), '完整目录版缺少照片入口');
  clickAction(dom.app(), 'home');
  await settle(60);

  // The directory build keeps the relative artwork paths it copies next to it.
  assert.ok(/\.\/assets\/tiles\//.test(content), '完整目录版应使用相对牌面路径');
  assert.ok(!content.includes('data:image/svg+xml;base64,'), '完整目录版不应内联牌面');
});
