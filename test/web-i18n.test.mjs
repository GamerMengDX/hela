// Web UI copy and teaching consistency tests.
//
// The browser build reuses the copied mini-program UI, so every literal
// translation key it references must exist in all three catalogs, the web-only
// strings must be complete, and the 30 teaching examples must keep identical
// numbers in every language (labels are translated, scores never are).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {catalogs, CATALOG_LOCALES as LOCALES} from '../src/i18n/catalogs.js';
import {TEACHING_EXAMPLES} from '../src/teaching-examples.js';
import {createTeachingBrowser} from '../src/teaching.js';
import {teachingExample, teachingExamples} from '../src/teaching-model.js';
import {teachingSnapshot} from '../src/i18n/presenters.js';
import {THEMES, themeDisplay} from '../web/src/themes.js';
import {WEB_STRINGS, webText} from '../web/src/web-strings.js';

const WEB_SRC = path.resolve(fileURLToPath(new URL('../web/src', import.meta.url)));

async function sourceFiles(dir = WEB_SRC) {
  const files = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(full));
    else if (entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

test('every literal translation key used by the browser UI exists in all three locales', async () => {
  const files = await sourceFiles();
  const missing = [];
  let count = 0;
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    // Only literal, complete keys: dynamically composed keys are covered below.
    for (const match of text.matchAll(/(?:^|[^\w.])(?:t|tr)\(\s*'([a-zA-Z][\w.]*)'\s*[,)]/g)) {
      const key = match[1];
      if (!key.includes('.')) continue;
      count += 1;
      for (const locale of LOCALES) {
        const value = catalogs[locale][key];
        if (typeof value !== 'string' || !value.trim()) missing.push(key + ' @ ' + locale + ' (' + path.relative(WEB_SRC, file) + ')');
      }
    }
  }
  assert.ok(count > 300, '扫描到的界面文案键太少: ' + count);
  assert.deepEqual(missing, []);
});

test('web-only strings are complete in the three locales', () => {
  const keys = Object.keys(WEB_STRINGS);
  assert.ok(keys.length >= 8);
  for (const key of keys) {
    const values = WEB_STRINGS[key];
    assert.equal(values.length, 3, key + ' 缺少语种');
    for (const value of values) assert.ok(typeof value === 'string' && value.trim().length >= 3, key + ' 文案过短');
    assert.equal(webText(key, 'zh-CN'), values[0]);
    assert.equal(webText(key, 'ja'), values[1]);
    assert.equal(webText(key, 'en'), values[2]);
    // No leftover mini-program install / test-build wording in the web copy.
    for (const value of values) assert.ok(!/扫码|小程序.*安装|测试版/.test(value), key + ' 仍含平台安装/测试版文案');
  }
});

test('the three themes are labelled in every locale', () => {
  assert.equal(THEMES.length, 3);
  for (const theme of THEMES) {
    for (const locale of LOCALES) {
      const view = themeDisplay({...theme, name: catalogs[locale]['heybox.theme.' + theme.id] ?? theme.name, description: catalogs[locale]['heybox.theme.' + theme.id + 'Description'] ?? theme.description});
      assert.ok(view.name && view.name.trim(), theme.id + ' 缺少本地化名称');
      assert.ok(view.description && view.description.trim(), theme.id + ' 缺少本地化说明');
    }
    for (const locale of LOCALES) {
      assert.ok(catalogs[locale]['heybox.theme.' + theme.id], theme.id + ' 缺少目录键 @ ' + locale);
      assert.ok(catalogs[locale]['heybox.theme.' + theme.id + 'Description'], theme.id + ' 缺少描述键 @ ' + locale);
    }
  }
});

test('the catalogue has 30 teaching examples with unique ids and 14+ tiles in one row', () => {
  assert.equal(TEACHING_EXAMPLES.length, 30);
  assert.equal(teachingExamples().length, 30);
  const ids = new Set(TEACHING_EXAMPLES.map(example => example.id));
  assert.equal(ids.size, 30);
  for (let index = 0; index < 30; index += 1) {
    const detail = teachingExample(index);
    const meldTiles = (detail.melds || []).reduce((sum, group) => sum + group.tiles.length, 0);
    assert.ok(detail.hand.length + meldTiles >= 14, '第 ' + (index + 1) + ' 题不足 14 张');
    assert.equal(detail.rowTiles.length, detail.hand.length + meldTiles, '第 ' + (index + 1) + ' 题单排行数不一致');
    assert.equal(detail.hand.length, 14 - detail.melds.length * 3, '第 ' + (index + 1) + ' 题手牌与副露不匹配');
    assert.ok(detail.rowTiles.every(tile => typeof tile.name === 'string' && tile.name.trim()), '第 ' + (index + 1) + ' 题牌名未本地化');
  }
});

test('the 30 teaching examples keep identical numbers in all three locales', () => {
  const perLocale = new Map();
  for (const locale of LOCALES) {
    const rows = [];
    // Drive the same snapshot the teaching page renders, then localize it.
    const browser = createTeachingBrowser();
    browser.open();
    for (let index = 0; index < 30; index += 1) {
      const localized = teachingSnapshot(browser.select(index), locale).detail;
      assert.ok(localized.name && localized.name.trim(), locale + ' 第 ' + (index + 1) + ' 题名称缺失');
      assert.ok(localized.description && localized.description.trim(), locale + ' 第 ' + (index + 1) + ' 题说明缺失');
      assert.ok(localized.score && localized.score.summary, locale + ' 第 ' + (index + 1) + ' 题点数说明缺失');
      assert.ok(localized.targets.every(target => target.name && target.name.trim()), locale + ' 第 ' + (index + 1) + ' 题目标役未本地化');
      rows.push({
        id: localized.id,
        han: localized.score.han,
        fu: localized.score.fu,
        points: localized.score.points,
        total: localized.score.total,
        yakuman: localized.score.yakuman,
        yaku: localized.score.yaku.map(row => row.name.length > 0).length,
        tiles: localized.rowTiles.map(tile => tile.tile).join(',')
      });
    }
    perLocale.set(locale, rows);
  }
  const zhSnapshots = [];
  const zhBrowser = createTeachingBrowser();
  zhBrowser.open();
  for (let index = 0; index < 30; index += 1) zhSnapshots.push(zhBrowser.select(index));
  const zh = perLocale.get('zh-CN');
  for (const locale of LOCALES) {
    assert.deepEqual(perLocale.get(locale), zh, locale + ' 的教学数值/牌面与中文不一致');
  }
  // Labels really are translated: the Japanese and English names must differ.
  for (const locale of ['ja', 'en']) {
    let differing = 0;
    for (let index = 0; index < 30; index += 1) {
      const zhName = teachingSnapshot(zhSnapshots[index], 'zh-CN').detail.name;
      const otherName = teachingSnapshot(zhSnapshots[index], locale).detail.name;
      if (zhName !== otherName) differing += 1;
    }
    // Some Japanese yaku titles are legitimately identical to the Chinese ones.
    const floor = locale === 'en' ? 29 : 15;
    assert.ok(differing >= floor, locale + ' 的教学名称几乎没有翻译: ' + differing + '/30');
  }
});

test('the browser copy carries no mini-program platform or preview wording', async () => {
  const files = await sourceFiles();
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const relative = path.relative(WEB_SRC, file);
    assert.ok(!/import\.meta\.env/.test(text), relative + ' 仍引用 import.meta.env');
    assert.ok(!/@heybox\/hb-sdk/.test(text), relative + ' 仍引用小黑盒 SDK');
    assert.ok(!/createPreviewAdapter|previewStorageKey|hela-heybox-preview/.test(text), relative + ' 仍保留预览存储适配器');
    assert.ok(!/from '\.\/dev\//.test(text), relative + ' 仍引用开发调试入口');
  }
});
