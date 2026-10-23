// Teaching tests: the 30 lessons must each build a real hand, score it through the
// shared engine, expose every target yaku in all three locales, and accept their
// own solution through the exercise judge.
//
// The expected table below was read off this engine (not copied from any internal
// fixture) and now pins the 30 lesson scores: if a lesson's hand, dora or context
// silently changes, this test fails instead of the UI quietly showing a new number.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TEACHING_CATEGORIES,
  createTeachingExercise,
  judgeTeachingExercise,
  teachingExample,
  teachingExamples,
  teachingGoal,
  teachingState,
  validTeachingIndex
} from '../src/teaching.js';
import {calculate} from '../src/engine.js';
import {TEACHING_EXAMPLES} from '../src/teaching-examples.js';
import {catalogs, CATALOG_LOCALES as LOCALES} from '../src/i18n/catalogs.js';
import {t} from '../src/i18n/index.js';
import {yakuInfo} from '../src/i18n/presenters.js';

// id, han, fu, total (yakuman lessons report han/fu 0 and only the payment total)
const EXPECTED = [
  ['riichi-tanyao-pinfu', 4, 30, '7,700'],
  ['seven-pairs', 2, 25, '1,600'],
  ['open-white', 1, 30, '1,000'],
  ['thirteen-orphans', 0, 0, '64,000'],
  ['closed-tsumo-pinfu', 3, 20, '2,700'],
  ['pinfu', 2, 30, '2,000'],
  ['tanyao', 1, 40, '1,300'],
  ['identical-sequences', 1, 40, '1,300'],
  ['three-suit-sequences', 4, 40, '8,000'],
  ['straight', 2, 40, '2,600'],
  ['all-triplets', 5, 40, '8,000'],
  ['three-concealed-triplets', 2, 50, '3,200'],
  ['three-suit-triplets', 4, 50, '8,000'],
  ['mixed-outside', 2, 50, '3,200'],
  ['pure-outside', 3, 50, '6,400'],
  ['terminals-honors', 7, 60, '12,000'],
  ['small-three-dragons', 6, 50, '12,000'],
  ['half-flush', 4, 50, '8,000'],
  ['full-flush', 6, 40, '12,000'],
  ['two-identical-sequence-pairs', 3, 40, '5,200'],
  ['big-three-dragons', 0, 0, '32,000'],
  ['four-concealed-triplets', 0, 0, '32,000'],
  ['small-four-winds', 0, 0, '32,000'],
  ['big-four-winds', 0, 0, '64,000'],
  ['all-honors', 0, 0, '32,000'],
  ['all-green', 0, 0, '32,000'],
  ['all-terminals', 0, 0, '32,000'],
  ['nine-gates', 0, 0, '32,000'],
  ['replacement-tile', 3, 60, '7,900'],
  ['last-draw', 4, 20, '5,200']
];

const YAKUMAN = new Set([
  'thirteen-orphans',
  'big-three-dragons',
  'four-concealed-triplets',
  'small-four-winds',
  'big-four-winds',
  'all-honors',
  'all-green',
  'all-terminals',
  'nine-gates'
]);

test('there are exactly 30 teaching lessons with unique ids', () => {
  assert.equal(TEACHING_EXAMPLES.length, 30);
  assert.equal(teachingExamples().length, 30);
  const ids = TEACHING_EXAMPLES.map(example => example.id);
  assert.equal(new Set(ids).size, 30);
  assert.deepEqual(ids, EXPECTED.map(([id]) => id));
});

test('every lesson builds a full 14-tile hand plus its melds', () => {
  for (let index = 0; index < 30; index++) {
    const example = teachingExample(index);
    assert.ok(example, 'lesson ' + index + ' must exist');
    const state = teachingState(index);
    // A kan adds one physical tile, so a lesson with a quad legitimately shows 15.
    const melded = state.melds.reduce((sum, meld) => sum + String(meld).replace(/[^0-9]/g, '').length, 0);
    const quads = state.melds.filter(meld => /^[mpsz]\d{4}$/.test(String(meld))).length;
    assert.equal(state.hand.length + melded, 14 + quads, 'lesson ' + example.id + ' must describe a complete hand');
    assert.ok(example.rowTiles.length >= 14, 'lesson ' + example.id + ' must render its tiles');
    assert.equal(example.winTile, state.hand[state.winIndex]);
  }
});

test('all 30 lessons score through the shared engine with the pinned values', () => {
  for (const [index, [id, han, fu, total]] of EXPECTED.entries()) {
    const example = teachingExample(index);
    assert.equal(example.id, id);

    const state = teachingState(index);
    const result = calculate(state);
    assert.equal(result.ok, true, id + ': ' + result.message);

    assert.equal(example.score.han, han, id + ' han');
    assert.equal(example.score.fu, fu, id + ' fu');
    assert.equal(example.score.total, total, id + ' total');
    assert.equal(example.score.yakuman, YAKUMAN.has(id), id + ' yakuman flag');
    assert.equal(example.score.points, total, id + ' present points');
    assert.ok(Array.isArray(example.score.yaku) && example.score.yaku.length > 0, id + ' lists yaku');

    if (YAKUMAN.has(id)) {
      assert.ok(example.score.yaku.some(yaku => /役满|役満|yakuman/i.test(yaku.label)), id + ' labels a yakuman');
    } else {
      assert.equal(example.score.summary, han + ' 番 ' + fu + ' 符', id + ' summary');
      assert.equal(example.score.total.replace(/,/g, ''), String(result.total), id + ' total matches calculate()');
    }
  }
});

test('scoring a lesson twice yields the same result', () => {
  for (let index = 0; index < 30; index++) {
    const first = teachingExample(index).score;
    const second = teachingExample(index).score;
    assert.deepEqual(
      [first.han, first.fu, first.total],
      [second.han, second.fu, second.total],
      'lesson ' + index + ' must be deterministic'
    );
  }
});

test('each target yaku resolves through the catalogs in all three locales', () => {
  for (let index = 0; index < 30; index++) {
    const goal = teachingGoal(index);
    assert.ok(goal.targets.length > 0, goal.id + ' declares targets');
    for (const target of goal.targets) {
      // Targets are yaku keys; the presenter is what the UI renders, so resolve
      // them the same way in every locale and require a non-empty label each time.
      const names = LOCALES.map(locale => yakuInfo(target.key, locale)[0]);
      for (const [position, name] of names.entries()) {
        assert.ok(name && name.trim().length > 0, goal.id + ' ' + target.key + ' in ' + LOCALES[position]);
      }
      assert.equal(new Set(names).size >= 2, true, goal.id + ' target ' + target.key + ' must be translated: ' + names.join(' | '));
    }
    const nameKey = 'shared.lesson.' + goal.id + '.name';
    assert.ok(catalogs['zh-CN'][nameKey], 'missing lesson name key: ' + nameKey);
  }
});

test('lesson categories are a subset of the declared teaching categories', () => {
  const declared = new Set(TEACHING_CATEGORIES.map(category => category.id));
  for (const example of TEACHING_EXAMPLES) assert.ok(declared.has(example.category), example.id + ' category');
});

test('the exercise judge accepts the lesson solution for all 30 lessons', () => {
  for (let index = 0; index < 30; index++) {
    const state = teachingState(index);
    const guess = {hand: state.hand.slice(), melds: state.melds.slice(), winIndex: state.winIndex};
    const verdict = judgeTeachingExercise(index, guess);
    assert.equal(verdict.correct, true, teachingExample(index).id + ' should be accepted: ' + verdict.message);
    assert.equal(verdict.code, 'correct');
    assert.ok(verdict.detail, teachingExample(index).id + ' returns the scored detail');
  }
});

test('the exercise judge rejects a malformed hand with a localisable message', () => {
  const verdict = judgeTeachingExercise(0, {hand: ['m1'], melds: [], winIndex: 0});
  assert.equal(verdict.correct, false);
  assert.notEqual(verdict.code, 'correct');
  assert.ok(verdict.title && verdict.message);
  assert.ok(verdict.titleRef && verdict.messageRef, 'feedback carries i18n keys');
  for (const locale of LOCALES) {
    assert.ok(t(verdict.titleRef.key, {}, locale).length > 0);
  }

  const outOfRange = judgeTeachingExercise(30, {hand: [], melds: [], winIndex: 0});
  assert.equal(outOfRange.correct, false);
  assert.equal(outOfRange.code, 'lesson');
  assert.equal(validTeachingIndex(30), false);
  assert.equal(validTeachingIndex(0), true);
});

test('a wrong-but-valid hand is rejected without throwing', () => {
  // A complete, legal hand that does not match lesson 0's targets.
  const verdict = judgeTeachingExercise(0, {
    hand: ['m1', 'm1', 'm1', 'p9', 'p9', 'p9', 's1', 's1', 's1', 'z1', 'z1', 'z1', 'z5', 'z5'],
    melds: [],
    winIndex: 13
  });
  assert.equal(verdict.correct, false);
  assert.notEqual(verdict.code, 'correct');
  assert.ok(['target', 'shape', 'adjust', 'count', 'open'].includes(verdict.code), 'unexpected code ' + verdict.code);
});

test('the exercise state machine exposes a snapshot and actions', () => {
  const exercise = createTeachingExercise(0);
  assert.equal(typeof exercise, 'object');
  assert.ok(exercise.snapshot, 'exercise exposes a snapshot');
  assert.equal(typeof exercise.act, 'function');
  const snapshot = exercise.snapshot();
  assert.ok(Array.isArray(snapshot.rowTiles) && snapshot.rowTiles.length > 0);
  assert.ok(Array.isArray(snapshot.palette) && snapshot.palette.length > 0);
});
