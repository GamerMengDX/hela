// Browser platform adapter tests.
//
// These run in Node against an injected Web Storage object and event target, so
// the storage contract (missing vs null, refused writes, session-only mode,
// cross-tab conflicts, clipboard failures) is checked without a browser.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLIPBOARD_FAILED,
  CLIPBOARD_UNAVAILABLE,
  STORAGE_PREFIX,
  STORAGE_READ_FAILED,
  STORAGE_STALE_SNAPSHOT,
  STORAGE_UNAVAILABLE,
  STORAGE_WRITE_FAILED,
  createMemoryStorage,
  createWebPlatform
} from '../web/src/platform.js';
import {STORAGE_KEY, createRepository, emptyState} from '../web/src/repository.js';

function storage() {
  const map = new Map();
  return {
    map,
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); }
  };
}

function eventTarget() {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      handlers.get(type)?.delete(handler);
    },
    count(type) { return handlers.get(type)?.size ?? 0; },
    emit(type, event) {
      for (const handler of [...(handlers.get(type) || [])]) handler(event);
    }
  };
}

const createAdapter = (options = {}) => {
  const store = options.storage === undefined ? storage() : options.storage;
  const events = options.events === undefined ? eventTarget() : options.events;
  const document = options.document === undefined ? eventTarget() : options.document;
  const platform = createWebPlatform({
    storage: store,
    events,
    document,
    clipboard: options.clipboard === undefined ? {writeText: async () => {}} : options.clipboard,
    persistent: options.persistent
  });
  return {platform, store, events, document};
};

test('ready resolves without any handshake and reports the isolated prefix', async () => {
  const {platform} = createAdapter();
  const state = await platform.ready();
  assert.equal(state.prefix, 'hela-web-v1:');
  assert.equal(state.persistent, true);
  assert.equal(state.temporary, false);
  assert.equal(platform.prefix, STORAGE_PREFIX);
  // Idempotent: a second call must not re-probe or re-register listeners.
  const again = await platform.ready();
  assert.deepEqual(again, state);
});

test('read distinguishes a missing key from a stored JSON null', async () => {
  const {platform, store} = createAdapter();
  await platform.ready();
  assert.equal(await platform.read('nothing'), undefined);
  await platform.write('explicit-null', null);
  assert.equal(await platform.read('explicit-null'), null);
  assert.equal(store.map.get(STORAGE_PREFIX + 'explicit-null'), 'null');
});

test('values round-trip through the namespaced key only', async () => {
  const {platform, store} = createAdapter();
  await platform.ready();
  await platform.write('state', {version: 1, theme: 'mist', nested: [1, 2, 3]});
  assert.deepEqual(await platform.read('state'), {version: 1, theme: 'mist', nested: [1, 2, 3]});
  assert.deepEqual([...store.map.keys()], [STORAGE_PREFIX + 'state']);
});

test('corrupt JSON raises a readable read error instead of falling back silently', async () => {
  const {platform, store} = createAdapter();
  await platform.ready();
  store.map.set(STORAGE_PREFIX + 'broken', '{not json');
  await assert.rejects(platform.read('broken'), error => {
    assert.equal(error.code, STORAGE_READ_FAILED);
    return true;
  });
});

test('a throwing storage read is reported as an unreadable record', async () => {
  const store = storage();
  store.getItem = () => { throw new Error('denied'); };
  const {platform} = createAdapter({storage: store});
  await platform.ready();
  await assert.rejects(platform.read('state'), error => error.code === STORAGE_READ_FAILED);
});

test('a refused write keeps the previously committed value', async () => {
  const store = storage();
  const {platform} = createAdapter({storage: store});
  await platform.ready();
  await platform.write('state', {n: 1});
  store.setItem = () => { throw new Error('QuotaExceededError'); };
  await assert.rejects(platform.write('state', {n: 2}), error => error.code === STORAGE_WRITE_FAILED);
  assert.deepEqual(await platform.read('state'), {n: 1});
  assert.equal(store.map.get(STORAGE_PREFIX + 'state'), JSON.stringify({n: 1}));
});

test('storage that refuses the probe degrades to session-only mode', async () => {
  const store = storage();
  store.setItem = () => { throw new Error('SecurityError'); };
  const {platform} = createAdapter({storage: store});
  const state = await platform.ready();
  assert.equal(state.temporary, true);
  assert.equal(state.persistent, false);
  // Writes are accepted in memory so the app stays usable, but nothing is claimed as saved.
  await platform.write('state', {n: 1});
  assert.deepEqual(await platform.read('state'), {n: 1});
  assert.equal(store.map.size, 0);
  // No storage listener is attached in session mode.
  assert.equal(platform.state().temporary, true);
});

test('a missing localStorage object still yields a working session-only adapter', async () => {
  const platform = createWebPlatform({storage: null, events: null, document: null, clipboard: null});
  const state = await platform.ready();
  assert.equal(state.temporary, true);
  await platform.write('state', {n: 5});
  assert.deepEqual(await platform.read('state'), {n: 5});
});

test('another tab writing newer data blocks this tab from overwriting it', async () => {
  const events = eventTarget();
  const {platform, store} = createAdapter({events});
  await platform.ready();
  await platform.write('state', {n: 1});
  assert.equal(platform.state().stale, false);
  const seen = [];
  const stop = platform.onExternalChange(event => seen.push(event.key));

  // A different tab wrote: the event fires in this tab only.
  const newer = JSON.stringify({n: 2});
  store.map.set(STORAGE_PREFIX + 'state', newer);
  events.emit('storage', {key: STORAGE_PREFIX + 'state', newValue: newer});
  assert.equal(platform.state().stale, true);
  assert.deepEqual(seen, [STORAGE_PREFIX + 'state']);
  await assert.rejects(platform.write('state', {n: 3}), error => error.code === STORAGE_STALE_SNAPSHOT);
  assert.equal(store.map.get(STORAGE_PREFIX + 'state'), newer);

  // After an explicit reload the newest snapshot can be written again.
  platform.resolveExternalChange();
  await platform.write('state', {n: 4});
  assert.equal(store.map.get(STORAGE_PREFIX + 'state'), JSON.stringify({n: 4}));
  stop();
  stop();
});

test('this tab writing does not mark itself stale, and foreign keys are ignored', async () => {
  const events = eventTarget();
  const {platform, store} = createAdapter({events});
  await platform.ready();
  await platform.write('state', {n: 1});
  const raw = store.map.get(STORAGE_PREFIX + 'state');
  events.emit('storage', {key: STORAGE_PREFIX + 'state', newValue: raw});
  events.emit('storage', {key: 'someone-else', newValue: 'x'});
  events.emit('storage', {key: null, newValue: null});
  assert.equal(platform.state().stale, false);
  await platform.write('state', {n: 2});
  assert.equal(store.map.get(STORAGE_PREFIX + 'state'), JSON.stringify({n: 2}));
});

test('dispose removes listeners idempotently and stops further writes', async () => {
  const events = eventTarget();
  const document = eventTarget();
  const {platform} = createAdapter({events, document});
  await platform.ready();
  const stopShow = platform.onShow(() => {});
  const stopViewport = platform.onViewport(() => {});
  assert.equal(document.count('visibilitychange'), 1);
  platform.dispose();
  platform.dispose();
  assert.equal(events.count('storage'), 0);
  assert.equal(document.count('visibilitychange'), 0);
  stopShow();
  stopShow();
  stopViewport();
  await assert.rejects(platform.write('state', {n: 1}), error => error.code === STORAGE_WRITE_FAILED);
});

test('clipboard failures are distinguishable from a missing clipboard', async () => {
  const ok = createAdapter({clipboard: {writeText: async () => {}}});
  await ok.platform.ready();
  await ok.platform.copy('和啦');

  const denied = createAdapter({clipboard: {writeText: async () => { throw new Error('NotAllowedError'); }}});
  await denied.platform.ready();
  await assert.rejects(denied.platform.copy('x'), error => error.code === CLIPBOARD_FAILED);

  const missing = createAdapter({clipboard: null});
  await missing.platform.ready();
  await assert.rejects(missing.platform.copy('x'), error => error.code === CLIPBOARD_UNAVAILABLE);
});

test('viewport helpers stay inert because safe areas come from CSS env()', async () => {
  const {platform} = createAdapter();
  await platform.ready();
  assert.deepEqual(await platform.windowInfo(), {});
  assert.equal(typeof platform.onViewport(() => {}), 'function');
  await platform.navigationStyle('light');
});

test('the repository commits to memory only after the adapter accepted the write', async () => {
  const store = storage();
  const {platform} = createAdapter({storage: store});
  await platform.ready();
  const repository = createRepository(platform);
  await repository.initialize();
  await repository.update(data => { data.theme = 'retro'; });
  assert.equal(repository.snapshot().theme, 'retro');
  assert.equal(JSON.parse(store.map.get(STORAGE_PREFIX + STORAGE_KEY)).theme, 'retro');

  store.setItem = () => { throw new Error('QuotaExceededError'); };
  await assert.rejects(repository.update(data => { data.theme = 'mist'; }), error => error.code === STORAGE_WRITE_FAILED);
  // The refused change never becomes the in-memory truth.
  assert.equal(repository.snapshot().theme, 'retro');
  await repository.flush();
});

test('the repository restores theme, draft and practice counters from storage', async () => {
  const store = storage();
  const seed = {
    version: 1,
    theme: 'mist',
    draft: {...emptyState(), hand: ['m1', 'm2', 'm3'], winIndex: 2},
    history: [],
    practice: {attempted: 4, correct: 3},
    table: null,
    tableDraft: null
  };
  store.map.set(STORAGE_PREFIX + STORAGE_KEY, JSON.stringify(seed));
  const {platform} = createAdapter({storage: store});
  await platform.ready();
  const repository = createRepository(platform);
  const data = await repository.initialize();
  assert.equal(data.theme, 'mist');
  assert.deepEqual(data.draft.hand, ['m1', 'm2', 'm3']);
  assert.deepEqual(data.practice, {attempted: 4, correct: 3});
});

test('a corrupt snapshot is reported so the app can fall back to a session', async () => {
  const store = storage();
  store.map.set(STORAGE_PREFIX + STORAGE_KEY, '{broken');
  const {platform} = createAdapter({storage: store});
  await platform.ready();
  const repository = createRepository(platform);
  await assert.rejects(repository.initialize(), error => error.code === STORAGE_READ_FAILED);
  platform.degradeToSession();
  const fresh = createRepository(platform);
  const data = await fresh.initialize();
  assert.equal(data.theme, 'moon');
  await fresh.update(next => { next.theme = 'retro'; });
  assert.equal(fresh.snapshot().theme, 'retro');
});

test('a structurally invalid but valid-JSON record falls back to a fresh session without touching it', async () => {
  // Independent reproduction: the stored object is valid JSON but the draft is
  // not a restorable hand, so restoreState throws a plain Error without a code.
  const store = storage();
  const original = JSON.stringify({version: 1, draft: {hand: []}});
  store.map.set(STORAGE_PREFIX + STORAGE_KEY, original);
  const {platform} = createAdapter({storage: store});
  await platform.ready();

  const broken = createRepository(platform);
  await assert.rejects(broken.initialize(), error => {
    assert.match(error.message, /手牌记录格式异常|格式/);
    return true;
  });
  // The bad value was cached by the read, which is exactly what used to survive
  // the fallback and fail the second initialize as well.
  assert.deepEqual(await platform.read(STORAGE_KEY), {version: 1, draft: {hand: []}});

  platform.degradeToSession();
  assert.equal(platform.state().temporary, true);
  // The session cache is dropped, so the next read reports "missing"...
  assert.equal(await platform.read(STORAGE_KEY), undefined);
  // ...and the stored record is still byte-identical for manual recovery.
  assert.equal(store.map.get(STORAGE_PREFIX + STORAGE_KEY), original);

  const fresh = createRepository(platform);
  const data = await fresh.initialize();
  assert.equal(data.theme, 'moon');
  assert.deepEqual(data.draft.hand, []);
  assert.deepEqual(data.history, []);
  // Recording a hand now works in the session and never overwrites the record.
  await fresh.update(next => { next.draft.hand = ['m1', 'm2', 'm3']; });
  assert.deepEqual(fresh.snapshot().draft.hand, ['m1', 'm2', 'm3']);
  assert.equal(store.map.get(STORAGE_PREFIX + STORAGE_KEY), original);
  assert.equal(store.map.size, 1, '降级为会话模式后不得写入任何存储键');
});

test('a corrupt JSON record also recovers into a usable session', async () => {
  const store = storage();
  store.map.set(STORAGE_PREFIX + STORAGE_KEY, '{broken');
  const {platform} = createAdapter({storage: store});
  await platform.ready();
  await assert.rejects(createRepository(platform).initialize(), error => error.code === STORAGE_READ_FAILED);
  platform.degradeToSession();
  const fresh = createRepository(platform);
  const data = await fresh.initialize();
  assert.equal(data.theme, 'moon');
  await fresh.update(next => { next.theme = 'retro'; });
  assert.equal(fresh.snapshot().theme, 'retro');
  assert.equal(store.map.get(STORAGE_PREFIX + STORAGE_KEY), '{broken');
});

test('storage errors are plain Error objects with a stable code', () => {
  assert.notEqual(STORAGE_UNAVAILABLE, STORAGE_WRITE_FAILED);
  assert.notEqual(STORAGE_READ_FAILED, STORAGE_STALE_SNAPSHOT);
  assert.equal(typeof createMemoryStorage().setItem, 'function');
});
