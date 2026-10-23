// Non-DOM tests for the copied browser UI helpers and the local four-player
// table service. They prove the web copies really compute (not stubs): tile
// artwork goes through the swappable asset module, copy text is translated in
// all three locales, and a full table cycle runs on the browser platform
// adapter with its own storage namespace.
import test from 'node:test';
import assert from 'node:assert/strict';

import {defaultState, parseNotation, calculate} from '../src/engine.js';
import {teachingState} from '../src/teaching-model.js';
import {setLocale, current} from '../src/i18n/index.js';
import {catalogs, CATALOG_LOCALES as LOCALES} from '../src/i18n/catalogs.js';
import {copyResult, esc, face, handView} from '../web/src/ui.js';
import {tileSrc} from '../web/src/assets.js';
import {createWebPlatform, createMemoryStorage} from '../web/src/platform.js';
import {createRepository, STORAGE_KEY} from '../web/src/repository.js';
import {createTableService} from '../web/src/local-table.js';

const LOCALE_BY_INDEX = LOCALES;

function emptyEventTarget() {
  return {
    addEventListener() {},
    removeEventListener() {}
  };
}

async function tableFixture() {
  const storage = createMemoryStorage();
  const platform = createWebPlatform({
    storage,
    events: emptyEventTarget(),
    document: emptyEventTarget(),
    clipboard: {writeText: async () => {}}
  });
  await platform.ready();
  const repository = createRepository(platform);
  await repository.initialize();
  return {storage, platform, repository, table: createTableService(repository)};
}

// A hand that is guaranteed to score: the first teaching example (riichi +
// tanyao + pinfu), so this test does not invent its own scoring case.
const winningHand = () => ({...teachingState(0), sticks: 0});

test('tile artwork is produced through the swappable asset module', () => {
  assert.equal(tileSrc('m5'), './assets/tiles/m5.svg');
  assert.equal(face('m5'), '<span class="tile-face " role="img" aria-label="五万"><img src="./assets/tiles/m5.svg" alt="" draggable="false"></span>');
  assert.ok(face('z7', 'mini').includes('src="./assets/tiles/z7.svg"'));
  const html = handView({...defaultState(), hand: ['m1', 'p2', 'z3'], winIndex: 2, melds: ['p555-']});
  assert.equal((html.match(/assets\/tiles\//g) || []).length, 3);
  assert.ok(html.includes('static-winning'));
  assert.ok(html.includes('p555-'));
});

test('user text is escaped before it reaches innerHTML', () => {
  assert.equal(esc('<b>"x"&\'y\'</b>'), '&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;');
});

test('the copy summary is translated and keeps the same numbers in three locales', async () => {
  const state = winningHand();
  const texts = new Map();
  for (const locale of LOCALES) {
    await setLocale(locale);
    assert.equal(current(), locale);
    const result = calculate(state);
    assert.equal(result.ok, true, locale + ' 示例手牌无法计算');
    const text = copyResult(state);
    assert.ok(text.length > 40, locale + ' 复制文本过短');
    for (const line of text.split('\n')) assert.ok(line.length > 0);
    texts.set(locale, text);
  }
  await setLocale('zh-CN');
  // The score itself never changes with the language; only the labels do.
  const result = calculate(state);
  for (const locale of LOCALES) {
    const text = texts.get(locale);
    assert.ok(text.includes(result.total.toLocaleString(locale)), locale + ' 复制文本缺少总点数');
    assert.ok(text.includes(String(result.fanshu || '')), locale + ' 复制文本缺少番数');
    assert.ok(text.includes(String(result.fu || '')), locale + ' 复制文本缺少符数');
  }
  assert.notEqual(texts.get('ja'), texts.get('zh-CN'));
  assert.notEqual(texts.get('en'), texts.get('zh-CN'));
});

test('the local table runs a full cycle on the browser platform adapter', async () => {
  const {storage, platform, repository, table} = await tableFixture();
  const created = await table.create(['东原', '南野', '西川', '北見'], 25000);
  assert.equal(created.phase, 'playing');
  assert.equal(created.revision, 0);

  // Riichi deposit moves 1,000 points into the pot.
  const afterDeposit = await table.deposit(1, table.snapshot(table.read()));
  const deposited = table.view(table.read());
  assert.equal(deposited.players[1].points, 24000);
  assert.equal(deposited.potText, '1,000');
  assert.equal(deposited.players[1].riichi, true);
  assert.equal(afterDeposit.revision, 1);

  // The calculator draft for this table is persisted separately.
  const hand = {...winningHand(), sticks: 1, riichi: 1};
  await table.saveHand(table.read(), hand);
  const restored = table.readHand(table.read());
  assert.equal(restored.hand.length, 14);
  assert.deepEqual(restored.hand, hand.hand);

  // Settlement is recomputed from persisted data and cannot double-book.
  const proposal = table.preview(hand, table.snapshot(table.read()));
  assert.equal(proposal.state.seat, 1);
  assert.equal(proposal.changes.reduce((sum, n) => sum + n, 0), 1000);
  await table.settle(proposal);
  const settled = table.view(table.read());
  assert.equal(settled.phase, 'settled');
  assert.equal(settled.players[1].points, 24000 + proposal.changes[1]);
  assert.equal(settled.records.length, 2);
  assert.equal(settled.records[0].type, 'win');
  // A second settlement of the same hand is refused synchronously.
  assert.throws(() => table.settle(proposal), error => Boolean(error.messageRef || error.message));

  // Undo restores the pre-settlement balances, pot included.
  await table.undo(table.snapshot(table.read()));
  const undone = table.view(table.read());
  assert.equal(undone.phase, 'playing');
  assert.equal(undone.players[1].points, 24000);
  assert.equal(table.read().pot, 1000);

  // Second settlement, then the next hand clears the deposit flags.
  const again = table.preview(hand, table.snapshot(table.read()));
  await table.settle(again);
  const next = await table.nextHand(true, table.snapshot(table.read()));
  assert.equal(next.handNo, 2);
  assert.equal(next.honba, 1);
  assert.deepEqual(next.riichi, [false, false, false, false]);
  assert.equal(next.phase, 'playing');

  const exported = table.exportText(table.read());
  for (const name of ['东原', '南野', '西川', '北見']) assert.ok(exported.includes(name), '导出缺少玩家 ' + name);
  assert.ok(exported.includes('和啦'));

  // Everything above really went through the namespaced browser storage.
  const raw = storage.getItem('hela-web-v1:' + STORAGE_KEY);
  assert.ok(raw && JSON.parse(raw).table, '牌桌未写入浏览器存储命名空间');
  await repository.flush();
  platform.dispose();
});

test('table operations reject stale snapshots instead of overwriting newer data', async () => {
  const {table} = await tableFixture();
  await table.create(['A', 'B', 'C', 'D'], 25000);
  const stale = table.snapshot(table.read());
  await table.deposit(0, stale);
  // The same snapshot is now one revision behind.
  assert.throws(() => table.deposit(2, stale), error => error.messageRef?.key === 'heybox.table.balanceChanged');
  const view = table.view(table.read());
  assert.equal(view.players[2].points, 25000);
});

test('table input validation is localized and refusable', async () => {
  const {table} = await tableFixture();
  // Validation runs before any write, so these throw synchronously.
  assert.throws(() => table.create(['A', 'A', 'C', 'D'], 25000), error => error.messageRef?.key === 'heybox.table.uniqueNames');
  assert.throws(() => table.create(['A', 'B', 'C'], 25000), error => error.messageRef?.key === 'heybox.table.fourPlayers');
  assert.throws(() => table.create(['A', 'B', 'C', 'D'], 12345), error => error.messageRef?.key === 'heybox.table.initialInvalid');
  assert.throws(() => table.create(['A', '', 'C', 'D'], 25000), error => error.messageRef?.key === 'heybox.table.namesRequired');
  assert.equal(table.read(), null, '非法输入不应写入牌桌');
});

test('every table and copy key used by the web UI resolves in three locales', () => {
  const keys = [
    'heybox.lobby.label', 'heybox.lobby.balance', 'heybox.lobby.pot', 'heybox.lobby.riichiRecord',
    'heybox.lobby.winRecord', 'heybox.lobby.drawRecord', 'heybox.lobby.undoRecord', 'heybox.lobby.voided',
    'heybox.table.changed', 'heybox.table.balanceChanged', 'heybox.copy.title'
  ];
  for (const key of keys) {
    for (const locale of LOCALE_BY_INDEX) {
      assert.ok(catalogs[locale][key], key + ' 缺少 ' + locale + ' 文案');
    }
  }
});
