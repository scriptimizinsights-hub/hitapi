/**
 * workbench/views/response/json-tree.js — collapsible JSON tree.
 *
 *  - children are built only when a node is first opened (fast on big bodies)
 *  - arrays and objects show 200 children at a time ("Show more")
 *  - hover a row: copy its JSONPath ($.data[0].id) or its value, or add a test for it (right-click too)
 *  - URLs in string values are links that open as a new request
 *  - search: highlights matching keys and values, opens their parents, Enter = next
 */

import { h, mount, copyText, toast } from '../../../ui/core/dom.js';
import { jsonPath, linkFromValue } from '../../../shared/response.js';

const PAGE = 200;
const AUTO_OPEN_DEPTH = 3;      // e.g. { data: [ { …record… } ] } opens to the records
const AUTO_OPEN_MAX_CHILDREN = 50;

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function preview(v) {
  if (Array.isArray(v)) return `[ ${v.length} item${v.length === 1 ? '' : 's'} ]`;
  const n = Object.keys(v).length;
  return `{ ${n} key${n === 1 ? '' : 's'} }`;
}

/**
 * @param {*} data
 * @param {{ baseUrl: string, onOpenUrl: (url: string) => void, onAssert?: (path: string, value: *) => void }} opts
 */
export function createJsonTree(data, { baseUrl, onOpenUrl, onAssert = null }) {
  const nodes = new Map();            // path string → node controller (once rendered)
  const root = h('div', { class: 'jt', role: 'tree' });
  const searchInput = h('input', { type: 'search', class: 'jt-search', placeholder: 'Search keys and values', 'aria-label': 'Search the response' });
  const searchInfo = h('span', { class: 'muted small jt-count' });
  const prevBtn = h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Previous match (Shift+Enter)', disabled: true }, '↑');
  const nextBtn = h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Next match (Enter)', disabled: true }, '↓');
  const expandAll = h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Open every level (up to 5,000 rows)' }, 'Expand all');
  const collapseAll = h('button', { type: 'button', class: 'btn-ghost btn-sm' }, 'Collapse all');
  const toolbar = h('div', { class: 'jt-bar' }, searchInput, searchInfo, prevBtn, nextBtn, h('span', { class: 'grow' }), expandAll, collapseAll);
  const el = h('div', { class: 'jt-wrap' }, toolbar, h('div', { class: 'jt-scroll' }, root));

  function valueEl(v, key) {
    const t = typeOf(v);
    if (t === 'string') {
      const url = linkFromValue(v, key, baseUrl);
      const text = JSON.stringify(v);
      return url
        ? h('a', { href: url, class: 'jt-str jt-link', title: `Open ${url} as a new GET request`,
          onclick: (e) => { e.preventDefault(); onOpenUrl(url); } }, text)
        : h('span', { class: 'jt-str' }, text);
    }
    if (t === 'number') return h('span', { class: 'jt-num' }, String(v));
    if (t === 'boolean' || t === 'null') return h('span', { class: 'jt-lit' }, String(v));
    return h('span', { class: 'jt-preview' }, preview(v));
  }

  function rowActions(keys, v) {
    return h('span', { class: 'jt-actions' },
      h('button', { type: 'button', class: 'jt-act', title: 'Copy path', onclick: async (e) => {
        e.stopPropagation(); await copyText(jsonPath(keys)); toast(`Copied ${jsonPath(keys)}`, 'info');
      } }, 'path'),
      h('button', { type: 'button', class: 'jt-act', title: 'Copy value', onclick: async (e) => {
        e.stopPropagation(); await copyText(typeof v === 'string' ? v : JSON.stringify(v, null, 2)); toast('Copied value', 'info');
      } }, 'value'),
      onAssert ? h('button', { type: 'button', class: 'jt-act', title: 'Add a test for this value (Tests tab)', onclick: (e) => { e.stopPropagation(); onAssert(jsonPath(keys), v); } }, 'test') : null);
  }

  /** One node (and, when open, its children). */
  function node(v, keys, depth, label) {
    const isBranch = v !== null && typeof v === 'object';
    const count = isBranch ? (Array.isArray(v) ? v.length : Object.keys(v).length) : 0;
    const keyEl = label === undefined ? null
      : h('span', { class: typeof label === 'number' ? 'jt-idx' : 'jt-key' }, typeof label === 'number' ? String(label) : JSON.stringify(label));
    const toggle = h('span', { class: 'jt-toggle', 'aria-hidden': 'true' }, isBranch && count ? '▸' : '');
    const valEl = valueEl(v, label);
    const row = h('div', { class: 'jt-row', role: 'treeitem', style: { paddingLeft: `${depth * 16 + 4}px` } },
      toggle, keyEl, keyEl ? h('span', { class: 'jt-colon' }, ': ') : null, valEl, rowActions(keys, v));
    const kids = h('div', { class: 'jt-kids', hidden: true });
    const wrap = h('div', { class: 'jt-node' }, row, kids);
    let open = false;
    let built = 0;
    const entries = isBranch ? (Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v)) : [];

    function buildMore() {
      const frag = document.createDocumentFragment();
      const end = Math.min(built + PAGE, entries.length);
      for (let i = built; i < end; i++) {
        const [k, child] = entries[i];
        frag.append(node(child, [...keys, k], depth + 1, k).el);
      }
      built = end;
      kids.querySelector(':scope > .jt-more')?.remove();
      kids.append(frag);
      if (built < entries.length) {
        kids.append(h('button', { type: 'button', class: 'btn-ghost btn-sm jt-more', style: { marginLeft: `${(depth + 1) * 16 + 4}px` },
          onclick: () => buildMore() }, `Show ${Math.min(PAGE, entries.length - built)} more of ${entries.length - built}`));
      }
    }
    const ctl = {
      el: wrap, row, keys, isBranch, entries,
      setOpen(next) {
        if (!isBranch || !count) return;
        open = next;
        if (open && !built) buildMore();
        kids.hidden = !open;
        toggle.textContent = open ? '▾' : '▸';
        valEl.hidden = open && keys.length > 0;   // the root keeps its { n keys } summary
        row.setAttribute('aria-expanded', String(open));
      },
      get open() { return open; },
      /** Make sure the child at entry index i is rendered. */
      ensureChild(i) { while (built <= i && built < entries.length) buildMore(); },
    };
    if (onAssert) row.addEventListener('contextmenu', (e) => { if (e.target.closest('a')) return; e.preventDefault(); e.stopPropagation(); onAssert(jsonPath(keys), v); });
    if (isBranch && count) row.addEventListener('click', (e) => { if (!e.target.closest('a, .jt-act')) ctl.setOpen(!open); });
    nodes.set(JSON.stringify(keys), ctl);
    if (isBranch && depth < AUTO_OPEN_DEPTH && count <= AUTO_OPEN_MAX_CHILDREN) ctl.setOpen(true);
    return ctl;
  }

  const top = node(data, [], 0);
  root.append(top.el);
  if (top.isBranch) top.setOpen(true);

  /** Open every parent of a path, rendering as needed; returns the node. */
  function reveal(keys) {
    let ctl = nodes.get('[]');
    for (let i = 0; i < keys.length; i++) {
      ctl.setOpen(true);
      const idx = ctl.entries.findIndex(([k]) => k === keys[i]);
      ctl.ensureChild(idx);
      ctl = nodes.get(JSON.stringify(keys.slice(0, i + 1)));
      if (!ctl) return null;
    }
    return ctl;
  }

  // ── search ──
  let matches = [];
  let at = -1;
  function findMatches(term) {
    const out = [];
    const t = term.toLowerCase();
    const walk = (v, keys) => {
      if (out.length >= 1000) return;
      const last = keys[keys.length - 1];
      const keyHit = typeof last === 'string' && last.toLowerCase().includes(t);
      const valHit = v !== null && typeof v !== 'object' && String(v).toLowerCase().includes(t);
      if (keys.length && (keyHit || valHit)) out.push(keys);
      if (v && typeof v === 'object') for (const [k, c] of (Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v))) walk(c, [...keys, k]);
    };
    walk(data, []);
    return out;
  }
  function paintMatch() {
    root.querySelectorAll('.jt-hit, .jt-hit-now').forEach(r => r.classList.remove('jt-hit', 'jt-hit-now'));
    if (!matches.length) { searchInfo.textContent = searchInput.value ? 'No matches' : ''; prevBtn.disabled = nextBtn.disabled = true; return; }
    prevBtn.disabled = nextBtn.disabled = false;
    searchInfo.textContent = `${at + 1} of ${matches.length}${matches.length >= 1000 ? '+' : ''}`;
    const ctl = reveal(matches[at]);
    if (ctl) { ctl.row.classList.add('jt-hit-now'); ctl.row.scrollIntoView({ block: 'center' }); }
    for (const m of matches.slice(Math.max(0, at - 50), at + 50)) nodes.get(JSON.stringify(m))?.row.classList.add('jt-hit');
  }
  let timer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { matches = searchInput.value.trim() ? findMatches(searchInput.value.trim()) : []; at = matches.length ? 0 : -1; paintMatch(); }, 200);
  });
  const step = (d) => { if (!matches.length) return; at = (at + d + matches.length) % matches.length; paintMatch(); };
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } });
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));

  expandAll.addEventListener('click', () => {
    let opened = 0;
    const openAll = (ctl) => {
      if (opened > 5000 || !ctl?.isBranch) return;
      ctl.setOpen(true);
      for (let i = 0; i < ctl.entries.length && opened <= 5000; i++) {
        ctl.ensureChild(i);
        opened++;
        openAll(nodes.get(JSON.stringify([...ctl.keys, ctl.entries[i][0]])));
      }
    };
    openAll(top);
    if (opened > 5000) toast('Opened the first 5,000 rows', 'info');
  });
  collapseAll.addEventListener('click', () => { for (const ctl of nodes.values()) if (ctl !== top) ctl.setOpen(false); });

  return { el, focusSearch: () => searchInput.focus() };
}
