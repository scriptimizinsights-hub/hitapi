/**
 * ui/core/store.js — a minimal observable state object.
 *
 *   const store = createStore({ a: 1 });
 *   store.watch(['a'], () => redrawA());
 *   store.set({ a: 2 });   // runs watchers whose keys changed
 */

export function createStore(initial) {
  const state = { ...initial };
  const watchers = [];

  return {
    state,
    get: (key) => state[key],
    set(patch) {
      const changed = Object.keys(patch).filter(k => state[k] !== patch[k]);
      if (!changed.length) return;
      Object.assign(state, patch);
      for (const w of watchers) {
        if (w.keys.some(k => changed.includes(k))) w.fn(state, changed);
      }
    },
    /** Re-run watchers for these keys even if values are the same object (mutated). */
    touch(...keys) {
      for (const w of watchers) if (w.keys.some(k => keys.includes(k))) w.fn(state, keys);
    },
    watch(keys, fn) {
      watchers.push({ keys, fn });
    },
  };
}
