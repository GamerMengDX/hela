// Shared-core tests: scoring engine, inventory guards, catalogs and the
// mini-program facade.
//
// Everything here imports the public ES modules in src/ and builds its own hands
// through the public API -- no fixtures, no photos, no absolute paths.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculate,
  defaultState,
  doraFrom,
  inventory,
  makeMeld,
  meldTiles,
  normalize,
  parseNotation,
  notation,
  tileName,
  validTile,
  validateInventory
} from '../src/engine.js';
import * as miniprogramCore from '../src/miniprogram-core.js';
import * as engine from '../src/engine.js';
import {catalogs, validateCatalogs, CATALOG_LOCALES as LOCALES} from '../src/i18n/catalogs.js';
import {t, current, setLocale} from '../src/i18n/index.js';
import {tileName as presentedTileName, errorMessage} from '../src/i18n/presenters.js';

const stateFrom = (fields) => Object.assign(defaultState(), fields);

test('catalogs cover exactly the three supported locales and validate', () => {
  assert.deepEqual([...LOCALES], ['zh-CN', 'ja', 'en']);
  const report = validateCatalogs();
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.ok(report.count > 1000, 'expected the full catalog, got ' + report.count);
  for (const locale of LOCALES) assert.equal(typeof catalogs[locale], 'object');
});

test('every locale exposes the same keys and no empty translation', () => {
  const [zh, ja, en] = LOCALES.map(locale => Object.keys(catalogs[locale]).sort());
  assert.deepEqual(ja, zh);
  assert.deepEqual(en, zh);
  for (const locale of LOCALES) {
    for (const [key, value] of Object.entries(catalogs[locale])) {
      assert.equal(typeof value, 'string', locale + ' ' + key);
      assert.ok(value.trim().length > 0, 'empty translation: ' + locale + ' ' + key);
    }
  }
});

test('translations actually differ per locale and switch with setLocale', async () => {
  const zh = t('shared.yaku.pinfu.name', {}, 'zh-CN');
  const ja = t('shared.yaku.pinfu.name', {}, 'ja');
  const en = t('shared.yaku.pinfu.name', {}, 'en');
  assert.equal(zh, '平和');
  assert.equal(ja, '平和');
  assert.match(en, /Pinfu/i);
  assert.equal(new Set([zh, en]).size, 2);

  assert.equal(current(), 'zh-CN');
  await setLocale('en');
  assert.equal(current(), 'en');
  assert.match(t('shared.yaku.pinfu.name'), /Pinfu/i);
  await setLocale('ja');
  assert.equal(current(), 'ja');
  await setLocale('zh-CN');
  assert.equal(current(), 'zh-CN');
});

test('presenters localise tile names and errors in all three locales', () => {
  assert.equal(presentedTileName('m3', 'zh-CN'), '三万');
  assert.equal(presentedTileName('m3', 'en'), '3 man');
  assert.equal(presentedTileName('z5', 'ja'), '白');
  assert.equal(presentedTileName('z7', 'zh-CN'), '中');
  assert.equal(presentedTileName('p0', 'zh-CN'), '赤五筒');
  for (const locale of LOCALES) {
    const message = errorMessage('手牌需要 14 张（包含和牌），当前 13 张。副露请单独录入。', locale);
    assert.equal(typeof message, 'string');
    assert.ok(message.trim().length > 0, 'empty error text for ' + locale);
  }
});

test('notation round-trips and rejects invalid tiles', () => {
  const hand = ['m1', 'm2', 'm3', 'p4', 'p5', 'p6', 's7', 's8', 's9', 'z1', 'z1', 'z5', 'z5', 'z5'];
  assert.equal(notation(hand), '123m456p789s11555z');
  assert.deepEqual(parseNotation('123m456p789s11555z'), hand);
  assert.equal(validTile('m3'), true);
  assert.equal(validTile('z9'), false);
  assert.equal(validTile('x3'), false);
  assert.equal(normalize('m0'), 'm5');
  assert.equal(tileName('z5'), '白');
});

test('doraFrom maps the indicator to the next tile of its suit', () => {
  assert.equal(doraFrom('m1'), 'm2');
  assert.equal(doraFrom('m9'), 'm1');
  assert.equal(doraFrom('p5'), 'p6');
  assert.equal(doraFrom('s9'), 's1');
  assert.equal(doraFrom('z1'), 'z2');
  assert.equal(doraFrom('z4'), 'z1');
  assert.equal(doraFrom('z7'), 'z5');
});

// 23m 456p 789s 234p + 66m pair, winning on 1m: four sequences, a non-value
// pair and a two-sided wait, i.e. pinfu. No dora and no riichi so the score is a
// pure pinfu number.
const PINFU_HAND = ['m2', 'm3', 'p4', 'p5', 'p6', 's7', 's8', 's9', 'p2', 'p3', 'p4', 'm6', 'm6', 'm1'];
const pinfu = (fields) => stateFrom({dora: [], ura: [], hand: PINFU_HAND.slice(), winIndex: 13, round: 1, seat: 1, riichi: 0, ...fields});

test('pinfu scores 30 fu on a closed ron and 20 fu on a self-draw', () => {
  const ron = calculate(pinfu({method: 'ron'}));
  assert.equal(ron.ok, true, ron.message);
  assert.equal(ron.fanshu, 1);
  assert.equal(ron.fu, 30);
  assert.equal(ron.total, 1000, 'non-dealer 1 han 30 fu ron');
  assert.deepEqual(ron.hupai.map(yaku => yaku.name), ['平和']);

  const tsumo = calculate(pinfu({method: 'tsumo'}));
  assert.equal(tsumo.ok, true, tsumo.message);
  assert.equal(tsumo.fanshu, 2, 'menzen tsumo + pinfu');
  assert.equal(tsumo.fu, 20);
  assert.equal(tsumo.total, 1500);
});

test('the dealer pays and receives more for the same hand', () => {
  const nonDealer = calculate(pinfu({method: 'tsumo', seat: 1, round: 1}));
  const dealer = calculate(pinfu({method: 'tsumo', seat: 0, round: 0}));
  assert.equal(dealer.fanshu, nonDealer.fanshu);
  assert.equal(dealer.fu, nonDealer.fu);
  assert.ok(dealer.total > nonDealer.total);
  assert.equal(dealer.total, 2100);
});

test('riichi alone is one han and seven pairs is a fixed 25 fu', () => {
  const riichi = calculate(stateFrom({
    dora: [],
    ura: [],
    hand: ['m1', 'm2', 'm3', 'p4', 'p5', 'p6', 's7', 's8', 's9', 'p1', 'p2', 'p3', 'z5', 'z5'],
    winIndex: 13,
    round: 1,
    seat: 1,
    method: 'ron',
    riichi: 1
  }));
  assert.equal(riichi.ok, true, riichi.message);
  assert.equal(riichi.fanshu, 1);
  assert.equal(riichi.fu, 40);
  assert.equal(riichi.total, 1300);

  const chiitoitsu = calculate(stateFrom({
    dora: [],
    ura: [],
    hand: ['m1', 'm1', 'm4', 'm4', 'p2', 'p2', 'p7', 'p7', 's3', 's3', 's8', 's8', 'z1', 'z1'],
    winIndex: 13,
    round: 1,
    seat: 1,
    method: 'ron',
    riichi: 0
  }));
  assert.equal(chiitoitsu.ok, true, chiitoitsu.message);
  assert.equal(chiitoitsu.fanshu, 2);
  assert.equal(chiitoitsu.fu, 25);
  assert.equal(chiitoitsu.total, 1600);
  assert.deepEqual(chiitoitsu.hupai.map(yaku => yaku.name), ['七対子']);
});

test('the same hand scores identically for a repeat calculation', () => {
  const state = stateFrom({
    hand: ['m2', 'm3', 'm4', 'p3', 'p4', 'p5', 's6', 's7', 's8', 'z5', 'z5', 'z5', 'm5', 'm5'],
    winIndex: 13,
    round: 0,
    seat: 0,
    method: 'tsumo'
  });
  const first = calculate(state);
  const second = calculate({...state, hand: state.hand.slice()});
  assert.equal(first.ok, true, first.message);
  assert.equal(second.ok, true, second.message);
  assert.equal(first.total, second.total);
  assert.equal(first.fanshu, second.fanshu);
  assert.equal(first.fu, second.fu);
});

test('invalid hands are rejected with a stable code instead of a score', () => {
  const short = calculate(stateFrom({hand: ['m1', 'm2', 'm3'], winIndex: 2, method: 'ron'}));
  assert.equal(short.ok, false);
  assert.equal(typeof short.code, 'string');

  const notWinning = calculate(stateFrom({
    hand: ['m1', 'm2', 'm4', 'p1', 'p3', 'p5', 's2', 's4', 's6', 'z1', 'z3', 'z5', 'z7', 'm9'],
    winIndex: 13,
    method: 'ron'
  }));
  assert.equal(notWinning.ok, false);
  assert.equal(notWinning.code, 'shape');
});

test('five copies of one tile are rejected by the inventory guard', () => {
  const hand = ['m1', 'm1', 'm1', 'm1', 'm1', 'm2', 'm2', 'm2', 'm3', 'm3', 'm3', 'p1', 'p1', 'p1'];
  assert.throws(() => validateInventory(inventory(stateFrom({hand, melds: []}))), /超过 4 张|4 /);
});

test('melds canonicalise to the notation string the engine consumes', () => {
  assert.equal(makeMeld('chi', ['m1', 'm2', 'm3'], '-'), 'm123-');
  assert.equal(makeMeld('pon', ['z5', 'z5', 'z5'], '+'), 'z555+');
  assert.equal(meldTiles('m123-').join(','), 'm1,m2,m3');
});

test('the mini-program facade re-exports the shared core instead of re-implementing it', async () => {
  assert.equal(miniprogramCore.calculate, engine.calculate);
  assert.equal(miniprogramCore.defaultState, engine.defaultState);
  assert.equal(miniprogramCore.makeMeld, engine.makeMeld);
  assert.equal(typeof miniprogramCore.teachingExamples, 'function');
  assert.equal(typeof miniprogramCore.generatePractice, 'function');
  assert.equal(miniprogramCore.generatePractice, (await import('../src/practice.js')).generatePractice);
});
