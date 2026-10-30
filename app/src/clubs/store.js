/* EWUdiots Club: a small cache in front of api.js. Pages render synchronously (the app's router calls page() and
   expects HTML), so a page asks for data with use(key, loader): the first call starts loading and returns
   { loading: true }; when the data arrives the page is drawn again. Writes call invalidate() for what they changed. */

/**
 * @template T
 * @typedef {{ loading: boolean, value?: T, error?: string, at?: number }} Entry
 */

/** @param {{ onChange: () => void, isActive: () => boolean }} hooks */
export function createStore({ onChange, isActive }) {
  /** @type {Map<string, Entry<any>>} */
  const cache = new Map();
  const inflight = new Map();
  let redraw = 0;
  // Several loads finishing together redraw once.
  const changed = () => { if (redraw) return; redraw = requestAnimationFrame(() => { redraw = 0; if (isActive()) onChange(); }); };

  /**
   * @template T
   * @param {string} key  @param {() => Promise<T>} loader  @param {{ ttl?: number }} [opts]
   * @returns {Entry<T>}
   */
  function use(key, loader, { ttl = 60e3 } = {}) {
    const hit = cache.get(key);
    const stale = !hit || !hit.at || Date.now() - hit.at > ttl;
    if (stale && !inflight.has(key)) {
      // A background refresh that brings the same data doesn't redraw (it would wipe what someone is typing).
      const same = (v) => hit && !hit.error && JSON.stringify(v) === JSON.stringify(hit.value);
      const p = loader().then(
        (value) => { const quiet = same(value); cache.set(key, { loading: false, value, at: Date.now() }); return quiet; },
        (e) => { cache.set(key, { loading: false, error: e?.message || String(e), value: hit?.value, at: Date.now() }); return !!hit?.value; }
      ).then((quiet) => { inflight.delete(key); if (!quiet) changed(); });
      inflight.set(key, p);
    }
    return hit || { loading: true };
  }
  /** Wait for a value (for actions that need fresh data before acting). */
  async function fetch(key, loader) { use(key, loader, { ttl: 0 }); await inflight.get(key); return cache.get(key)?.value; }
  /** After a write: mark entries whose key starts with any prefix as stale and redraw. The old data stays on screen
      while the fresh data loads, so nothing flashes. */
  function invalidate(...prefixes) {
    for (const [k, v] of cache) if (prefixes.some((p) => k === p || k.startsWith(p))) cache.set(k, { ...v, at: 1 });
    changed();
  }
  /** Reload one entry quietly; the page redraws only if the data changed (for polling, e.g. live attendance). */
  function refresh(key, loader) { const v = cache.get(key); if (v) cache.set(key, { ...v, at: 1 }); use(key, loader); }
  const peek = (key) => cache.get(key)?.value;
  const clear = () => { cache.clear(); changed(); };
  return { use, fetch, invalidate, refresh, peek, clear };
}
