/**
 * Web Workbench (W10) — Flow settings, kept in this browser.
 *
 *   open         where a flow opens: 'page' (its own page, default) | 'tab' (a new browser tab) | 'inline' (inside the Workbench)
 *   snap         snap cards to the grid
 *   labels       show what each line passes on
 *   minimap      show the mini-map
 *   perRow       cards per row when arranging (0 = as many as fit)
 *   defaultView  how a flow opens when it has no view saved yet: 'canvas' | 'list'
 */

export const FLOW_PREFS_KEY = 'hitapi:web:flowPrefs';
export const GRID = 22;
export const DEFAULT_FLOW_PREFS = Object.freeze({ open: 'page', snap: true, labels: true, minimap: false, perRow: 0, defaultView: 'canvas' });
const listeners = new Set();

export function normalizeFlowPrefs(v) {
  const p = { ...DEFAULT_FLOW_PREFS, ...(v && typeof v === 'object' ? v : {}) };
  return {
    open: ['page', 'tab', 'inline'].includes(p.open) ? p.open : 'page',
    snap: p.snap !== false,
    labels: p.labels !== false,
    minimap: p.minimap === true,
    perRow: Math.max(0, Math.min(8, Math.floor(Number(p.perRow) || 0))),
    defaultView: p.defaultView === 'list' ? 'list' : 'canvas',
  };
}
export function loadFlowPrefs() {
  try { return normalizeFlowPrefs(JSON.parse(localStorage.getItem(FLOW_PREFS_KEY) || 'null')); } catch { return { ...DEFAULT_FLOW_PREFS }; }
}
export function saveFlowPrefs(next) {
  const p = normalizeFlowPrefs(next);
  try { localStorage.setItem(FLOW_PREFS_KEY, JSON.stringify(p)); } catch { /* storage full or blocked */ }
  for (const f of listeners) f(p);
  return p;
}
/** Changes here or in another tab. Returns an unsubscribe function. */
export function onFlowPrefs(fn) {
  listeners.add(fn);
  const onStorage = (e) => { if (e.key === FLOW_PREFS_KEY) fn(loadFlowPrefs()); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(fn); window.removeEventListener('storage', onStorage); };
}
export const snapTo = (v, on) => (on ? Math.round(v / GRID) * GRID : Math.round(v));
