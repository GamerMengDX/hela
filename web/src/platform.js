// Browser platform adapter for the standalone web application.
//
// The browser build is a first-class application: it never performs a Heybox
// handshake, never reads a preview flag and never mounts the mini-program gate.
// Storage lives in its own `hela-web-v1:` namespace, every write is committed
// only after the underlying storage accepted it, and a cross-tab change stops
// this tab from overwriting a newer snapshot.
//
// Error codes are stable strings so the UI can tell missing data, corrupt data,
// a refused write, a stale tab and an unavailable clipboard apart.

export const STORAGE_PREFIX = 'hela-web-v1:';
export const PROBE_KEY = STORAGE_PREFIX + '__probe__';

export const STORAGE_UNAVAILABLE = 'STORAGE_UNAVAILABLE';
export const STORAGE_READ_FAILED = 'STORAGE_READ_FAILED';
export const STORAGE_WRITE_FAILED = 'STORAGE_WRITE_FAILED';
export const STORAGE_STALE_SNAPSHOT = 'STORAGE_STALE_SNAPSHOT';
export const CLIPBOARD_UNAVAILABLE = 'CLIPBOARD_UNAVAILABLE';
export const CLIPBOARD_FAILED = 'CLIPBOARD_FAILED';

export function platformError(code, message, cause) {
  const error = new Error(message, cause === undefined ? undefined : {cause});
  error.code = code;
  return error;
}

/** In-memory storage with the Web Storage surface, for tests and temporary sessions. */
export function createMemoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); }
  };
}

function defaultStorage() {
  try {
    const storage = globalThis.localStorage;
    return storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function' ? storage : null;
  } catch {
    // Safari private mode and hardened contexts throw on property access.
    return null;
  }
}

function defaultEvents() {
  try {
    return typeof globalThis.addEventListener === 'function' ? globalThis : null;
  } catch {
    return null;
  }
}

function defaultDocument() {
  try {
    return typeof globalThis.document !== 'undefined' ? globalThis.document : null;
  } catch {
    return null;
  }
}

function defaultClipboard() {
  try {
    return globalThis.navigator?.clipboard ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {object} [options]
 * @param {object|null} [options.storage] Web Storage compatible object (defaults to localStorage).
 * @param {object|null} [options.events] Object with add/removeEventListener (defaults to window).
 * @param {object|null} [options.document] Document for page events (defaults to document).
 * @param {object|null} [options.clipboard] Clipboard API object (defaults to navigator.clipboard).
 * @param {boolean} [options.persistent] Force session-only mode when false.
 */
export function createWebPlatform(options = {}) {
  const storage = options.storage !== undefined ? options.storage : defaultStorage();
  const events = options.events !== undefined ? options.events : defaultEvents();
  const document = options.document !== undefined ? options.document : defaultDocument();
  const clipboard = options.clipboard !== undefined ? options.clipboard : defaultClipboard();

  const memory = new Map();
  const lastWrite = new Map();
  const listeners = new Set();
  const teardowns = new Set();
  let persistent = Boolean(storage) && options.persistent !== false;
  let stale = false;
  let probed = false;
  let disposed = false;
  let stopStorage = null;

  const storageKey = name => STORAGE_PREFIX + name;

  function markStale(key, newValue) {
    // A storage event only fires in tabs that did not perform the write, so any
    // event for our namespace means another tab has newer data.
    if (stale) return;
    stale = true;
    for (const listener of [...listeners]) {
      try {
        listener({key, value: newValue});
      } catch {
        // One listener must not stop the others.
      }
    }
  }

  const platform = {
    get prefix() { return STORAGE_PREFIX; },
    state() {
      return {prefix: STORAGE_PREFIX, persistent, temporary: !persistent, stale, disposed};
    },
    /** Browser platform is ready immediately: no SDK handshake, no bridge. */
    async ready() {
      if (probed) return platform.state();
      probed = true;
      if (persistent) {
        try {
          storage.setItem(PROBE_KEY, '1');
          storage.removeItem(PROBE_KEY);
        } catch {
          // Storage exists but refuses writes (quota 0, private mode, policy).
          persistent = false;
        }
      }
      if (!persistent) memory.clear();
      if (persistent && events && typeof events.addEventListener === 'function' && typeof events.removeEventListener === 'function') {
        const handler = event => {
          if (disposed) return;
          const key = event?.key;
          if (typeof key !== 'string' || !key.startsWith(STORAGE_PREFIX) || key === PROBE_KEY) return;
          if (lastWrite.has(key) && lastWrite.get(key) === event.newValue) return;
          markStale(key, event.newValue);
        };
        events.addEventListener('storage', handler);
        stopStorage = () => {
          if (!stopStorage) return;
          stopStorage = null;
          events.removeEventListener('storage', handler);
        };
      }
      return platform.state();
    },
    /** Missing => undefined. A stored JSON null => null (they are different states). */
    async read(name) {
      const key = storageKey(name);
      if (!persistent) return memory.get(key);
      let raw;
      try {
        raw = storage.getItem(key);
      } catch (error) {
        throw platformError(STORAGE_READ_FAILED, '本地记录读取失败', error);
      }
      if (raw === null || raw === undefined) return undefined;
      let value;
      try {
        value = JSON.parse(raw);
      } catch (error) {
        throw platformError(STORAGE_READ_FAILED, '本地记录无法解析', error);
      }
      memory.set(key, value);
      return value;
    },
    async write(name, value) {
      if (disposed) throw platformError(STORAGE_WRITE_FAILED, '页面正在关闭，未写入本地记录');
      if (stale) throw platformError(STORAGE_STALE_SNAPSHOT, '另一个标签页已更新本地记录，请先重新载入');
      const key = storageKey(name);
      if (!persistent) {
        // Session-only mode: accepted in memory, never presented as persistence.
        memory.set(key, value);
        return;
      }
      let raw;
      try {
        raw = JSON.stringify(value);
      } catch (error) {
        throw platformError(STORAGE_WRITE_FAILED, '本地记录无法序列化', error);
      }
      try {
        storage.setItem(key, raw);
      } catch (error) {
        // The committed value in memory stays the previous one: callers keep
        // showing the old state when the write is refused.
        throw platformError(STORAGE_WRITE_FAILED, '本地记录写入失败', error);
      }
      lastWrite.set(key, raw);
      memory.set(key, value);
    },
    /**
     * Drop to session-only storage after an unrecoverable read failure.
     *
     * The session cache may still hold the snapshot that failed to restore, so it
     * is cleared here: the next `read()` reports "missing" and a fresh repository
     * starts from defaults. The stored record itself is never deleted or
     * overwritten while the adapter is in session-only mode.
     */
    degradeToSession() {
      persistent = false;
      stale = false;
      stopStorage?.();
      memory.clear();
      lastWrite.clear();
      return platform.state();
    },
    /** Re-enable writes after the user reloaded the newest snapshot. */
    resolveExternalChange() {
      stale = false;
      lastWrite.clear();
      return platform.state();
    },
    onExternalChange(handler) {
      if (typeof handler !== 'function') return () => {};
      listeners.add(handler);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(handler);
      };
    },
    async copy(text) {
      if (!clipboard || typeof clipboard.writeText !== 'function') {
        throw platformError(CLIPBOARD_UNAVAILABLE, '浏览器未提供剪贴板接口');
      }
      try {
        await clipboard.writeText(String(text));
      } catch (error) {
        throw platformError(CLIPBOARD_FAILED, '复制失败', error);
      }
    },
    // Viewport helpers keep the shared UI code unchanged. Safe areas come from
    // CSS env() in the browser, so there is nothing to measure here.
    async navigationStyle() {},
    async windowInfo() { return {}; },
    onViewport() { return () => {}; },
    onShow(handler) {
      const target = document && typeof document.addEventListener === 'function' ? document : null;
      if (!target || typeof handler !== 'function') return () => {};
      let active = true;
      const listener = () => {
        if (!active || disposed) return;
        try {
          handler();
        } catch {
          // A failing view refresh must not break the page lifecycle.
        }
      };
      const stop = () => {
        if (!active) return;
        active = false;
        teardowns.delete(stop);
        target.removeEventListener('visibilitychange', listener);
      };
      target.addEventListener('visibilitychange', listener);
      teardowns.add(stop);
      return stop;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stale = false;
      stopStorage?.();
      for (const teardown of [...teardowns]) teardown();
      teardowns.clear();
      for (const listener of [...listeners]) listeners.delete(listener);
    }
  };
  return platform;
}

export const platform = createWebPlatform();
