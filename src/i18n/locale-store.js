// Locale persistence: an adapter-backed store that owns exactly one storage
// key, never clears unknown data, and only switches language after a successful
// write.
//
// The adapter contract is async: `read(key)` and `write(key, value)`. Reads may
// resolve `undefined`/`null` (missing), a plain object, or a JSON string; the
// stored value is `{version: 1, locale}`.

import {DEFAULT_LOCALE, isLocale, normalizeLocale} from './runtime.js';

export const LOCALE_KEY = 'hela-locale-v1';
export const LOCALE_VERSION = 1;
export const INVALID_LOCALE = 'INVALID_LOCALE';
export const READ_FAILED = 'LOCALE_READ_FAILED';
export const WRITE_FAILED = 'LOCALE_WRITE_FAILED';

export function createLocaleStore(adapter) {
  if (!adapter || typeof adapter.read !== 'function' || typeof adapter.write !== 'function') {
    throw new TypeError('createLocaleStore(adapter) requires async read(key) and write(key, value)');
  }

  let locale = DEFAULT_LOCALE;
  let pending = Promise.resolve();
  let initializing = null;
  const listeners = new Set();

  // Serialize every adapter operation so rapid switches cannot land out of
  // order: each task runs only after the previous one settled, and a rejected
  // task never blocks the queue.
  function enqueue(task) {
    const run = pending.then(task, task);
    pending = run.then(() => {}, () => {});
    return run;
  }

  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener(locale);
      } catch {
        // A faulty subscriber must not stop the store or other subscribers.
      }
    }
  }

  // Only a real change is announced, and only the caller decides whether the
  // change is announceable (setLocale publishes after a successful write).
  function commit(next, announce) {
    const changed = next !== locale;
    locale = next;
    if (changed && announce) notify();
  }

  function decode(raw) {
    let value = raw;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        return {locale: DEFAULT_LOCALE, persisted: false};
      }
    }
    if (!value || typeof value !== 'object' || value.version !== LOCALE_VERSION) {
      return {locale: DEFAULT_LOCALE, persisted: false};
    }
    if (!isLocale(value.locale)) return {locale: DEFAULT_LOCALE, persisted: false};
    return {locale: normalizeLocale(value.locale), persisted: true};
  }

  function initialize() {
    if (initializing) return initializing;
    const run = enqueue(async () => {
      let raw;
      try {
        raw = await adapter.read(LOCALE_KEY);
      } catch {
        // Keep the current (default) language and leave storage untouched.
        return {locale, error: READ_FAILED, persisted: false};
      }
      const stored = decode(raw);
      commit(stored.locale, true);
      return {locale: stored.locale, error: null, persisted: stored.persisted};
    }).then(
      result => {
        // A failed read may be retried by calling initialize() again.
        if (result.error) initializing = null;
        return result;
      },
      error => {
        initializing = null;
        throw error;
      },
    );
    initializing = run;
    return run;
  }

  function setLocale(value) {
    if (!isLocale(value)) {
      return Promise.resolve({ok: false, code: INVALID_LOCALE, locale});
    }
    const target = normalizeLocale(value);
    return enqueue(async () => {
      // Re-read at execution time so a queued switch that became redundant
      // (another switch already landed on the same locale) writes nothing.
      if (target === locale) return {ok: true, locale, written: false};
      try {
        await adapter.write(LOCALE_KEY, {version: LOCALE_VERSION, locale: target});
      } catch {
        // Memory and subscribers keep the previous language.
        return {ok: false, code: WRITE_FAILED, locale};
      }
      commit(target, true);
      return {ok: true, locale: target, written: true};
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('subscribe(fn) requires a function');
    }
    listeners.add(listener);
    let active = true;
    return function unsubscribe() {
      if (!active) return;
      active = false;
      listeners.delete(listener);
    };
  }

  return {
    current: () => locale,
    initialize,
    setLocale,
    subscribe,
  };
}

export {DEFAULT_LOCALE};
