// Practice tests: question generation is driven by an injectable rng, so the
// generator can be exercised deterministically without fixtures or snapshots.
import test from 'node:test';
import assert from 'node:assert/strict';

import {checkPractice, generatePractice, practiceFields} from '../src/practice.js';
import {calculate, defaultState, inventory, normalize, validTile, validateInventory} from '../src/engine.js';

// Small deterministic PRNG (Park–Miller); the generator only needs [0, 1).
const seeded = (seed) => {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => (state = state * 16807 % 2147483647) / 2147483647;
};

const answersFrom = (fields) => Object.fromEntries(fields.map(field => [field.key, String(field.expected)]));

test('a generated question is a legal hand that the engine accepts', () => {
  const question = generatePractice('basic', seeded(20261022));
  assert.equal(typeof question, 'object');
  assert.equal(question.level, 'basic');
  assert.ok(Array.isArray(question.state.hand));
  assert.equal(question.state.hand.length + question.state.melds.reduce(
    (sum, meld) => sum + String(meld).replace(/[^0-9]/g, '').length, 0
  ), 14);

  for (const tile of question.state.hand) assert.equal(validTile(tile), true, 'invalid tile ' + tile);
  assert.doesNotThrow(() => validateInventory(inventory(question.state)));

  assert.equal(question.result.ok, true);
  assert.ok(question.result.fenpei.some(amount => amount < 0), 'someone must pay');
  // A basic question stays inside a readable range.
  assert.ok(!question.result.damanguan);
  assert.ok(question.result.fanshu <= 4);
});

test('the same seed produces the same question, different seeds do not', () => {
  const first = generatePractice('normal', seeded(777));
  const repeat = generatePractice('normal', seeded(777));
  const other = generatePractice('normal', seeded(778));

  assert.deepEqual(repeat.state, first.state);
  assert.equal(repeat.result.total, first.result.total);
  assert.notDeepEqual(other.state, first.state);
});

test('basic questions are built from sequences, normal questions may add melds', () => {
  const basic = generatePractice('basic', seeded(4242));
  assert.deepEqual(basic.state.melds, [], 'basic questions never open the hand');
  assert.ok(basic.state.hand.every(tile => normalize(tile) === tile), 'basic questions use no red fives');

  let sawMeld = false;
  let sawRed = false;
  for (let seed = 1; seed <= 40 && !(sawMeld && sawRed); seed++) {
    const question = generatePractice('advanced', seeded(seed));
    if (question.state.melds.length) sawMeld = true;
    if (question.state.hand.some(tile => tile.endsWith('0'))) sawRed = true;
  }
  assert.equal(sawRed, true, 'advanced questions introduce red fives');
});

test('the expected answers are the engine values and checking accepts them', () => {
  const question = generatePractice('normal', seeded(99));
  const fields = practiceFields(question);
  assert.ok(fields.length >= 3, 'han/fu, payments and a total are asked');

  const keys = fields.map(field => field.key);
  assert.deepEqual(keys, [...new Set(keys)], 'field keys are unique');
  for (const field of fields) {
    assert.equal(typeof field.expected, 'number');
    assert.ok(field.expected > 0, field.key);
    assert.ok(field.labelRef && field.labelRef.key, field.key + ' carries an i18n key');
  }

  if (!question.result.damanguan) {
    assert.equal(fields.find(field => field.key === 'han').expected, question.result.fanshu);
    assert.equal(fields.find(field => field.key === 'fu').expected, question.result.fu);
  }
  assert.equal(fields.find(field => field.key === 'total').expected, question.result.total);

  const checked = checkPractice(question, answersFrom(fields));
  assert.equal(checked.length, fields.length);
  assert.ok(checked.every(field => field.correct === true), 'all expected answers must be accepted');
});

test('a wrong or malformed answer is marked incorrect, not thrown on', () => {
  const question = generatePractice('basic', seeded(31337));
  const fields = practiceFields(question);
  const wrong = Object.fromEntries(fields.map(field => [field.key, String(field.expected + 1)]));
  const checked = checkPractice(question, wrong);
  assert.ok(checked.every(field => field.correct === false));

  const empty = checkPractice(question, {});
  assert.ok(empty.every(field => field.correct === false), 'blank input is not a free pass');

  const malformed = checkPractice(question, Object.fromEntries(fields.map(field => [field.key, '1e3'])));
  assert.ok(malformed.every(field => field.correct === false), 'non-integer input is rejected');
});

test('an unknown level falls back to the basic set instead of failing', () => {
  const question = generatePractice('nonsense-level', seeded(5));
  assert.equal(question.level, 'basic');
  assert.equal(calculate(question.state).ok, true);
});

test('defaultState is a plain, reusable template', () => {
  const template = defaultState();
  assert.equal(template.hand.length, 14);
  assert.ok(template.rules && typeof template.rules.openTanyao === 'boolean');
  const copy = {...template};
  copy.hand = template.hand.slice();
  assert.notEqual(copy.hand, template.hand);
});
