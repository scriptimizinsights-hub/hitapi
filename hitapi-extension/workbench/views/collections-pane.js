/**
 * workbench/views/collections-pane.js — the Collections tab of the sidebar
 * (roadmap feature 6): collections → folders → saved requests.
 *
 * Click a request to open it. Double-click a name (or ⋯ → Rename) to rename.
 * Drag rows to reorder them or move them into another folder or collection.
 * Changes are written straight to storage; the page redraws from storage.
 */

import { h, mount, toast } from '../../ui/core/dom.js';
import { updateTree } from '../collections-store.js';
import { newCollection, newFolder, find, remove, duplicate, move, canMove, countRequests } from '../../shared/collections.js';

const OPEN_KEY = 'hitapi:wbOpenNodes';
const readOpen = () => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]')); } catch { return new Set(); } };
const writeOpen = (s) => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...s].slice(-500))); } catch { /* storage blocked */ } };

let menuEl = null;
function closeMenu() { menuEl?.remove(); menuEl = null; document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', escMenu, true); }
function outside(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
function escMenu(e) { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); } }

/** A small popup menu under `anchor`: items = [[label, fn, { danger }] | null (divider)] */
export function openMenu(anchor, items) {
  closeMenu();
  const r = anchor.getBoundingClientRect();
  menuEl = h('div', { class: 'cl-menu', role: 'menu' }, items.map(it => (it ? h('button', {
    type: 'button', role: 'menuitem', class: `cl-menu-item${it[2]?.danger ? ' danger' : ''}`,
    onclick: () => { closeMenu(); it[1](); },
  }, it[0]) : h('div', { class: 'cl-menu-sep' }))));
  document.body.append(menuEl);
  const w = menuEl.offsetWidth; const hgt = menuEl.offsetHeight;
  menuEl.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  menuEl.style.top = `${r.bottom + hgt + 4 > innerHeight ? Math.max(8, r.top - hgt - 4) : r.bottom + 4}px`;
  document.addEventListener('mousedown', outside, true);
  document.addEventListener('keydown', escMenu, true);
  menuEl.querySelector('button')?.focus();
}

/**
 * @param {object} o
 * @param {(id: string) => void} o.onOpen          open a saved request
 * @param {(id: string) => void} o.onNewRequest    new request inside this collection/folder
 * @param {(id: string) => void} o.onSettings
 * @param {(id: string) => void} o.onRun
 * @param {(id: string) => void} o.onExport
 * @param {(id: string) => void} o.onPush
 * @param {() => void} o.onImport                  import a collection file
 * @param {() => void} o.onPull                    import from a HitAPI project
 * @param {() => void} o.onSaveCurrent
 */
export function createCollectionsPane(o) {
  let tree = { items: [] };
  let activeId = null;
  let q = '';
  const open = readOpen();
  let dragId = null;

  const el = h('div', { class: 'cl-pane', role: 'tabpanel', 'aria-label': 'Collections' });
  const listEl = h('div', { class: 'cl-list', role: 'tree', 'aria-label': 'Collections' });
  const search = h('input', { type: 'search', class: 'hs-search', placeholder: 'Filter saved requests', 'aria-label': 'Filter saved requests',
    oninput: (e) => { q = e.target.value.trim().toLowerCase(); paint(); } });

  const toggle = (id, force) => {
    const want = force ?? !open.has(id);
    if (want) open.add(id); else open.delete(id);
    writeOpen(open);
    paint();
  };

  async function addCollection() {
    const c = newCollection(uniqueName('New collection'));
    await updateTree(t => { t.items.push(c); });
    open.add(c.id); writeOpen(open);
    startRename(c.id);
  }
  const uniqueName = (base) => {
    const names = new Set(tree.items.map(c => c.name));
    if (!names.has(base)) return base;
    for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
  };

  async function addFolder(parentId) {
    const f = newFolder();
    await updateTree(t => { const p = find(t, parentId); if (!p) return false; p.node.children.push(f); });
    open.add(parentId); open.add(f.id); writeOpen(open);
    startRename(f.id);
  }

  async function rename(id, name) {
    name = name.trim();
    if (!name) return;
    await updateTree(t => { const f = find(t, id); if (!f || f.node.name === name) return false; f.node.name = name.slice(0, 120); });
  }

  async function del(id) {
    const f = find(tree, id);
    if (!f) return;
    const n = countRequests(f.node);
    const what = f.node.type === 'request' ? `the request "${f.node.name}"` : `${f.node.type === 'collection' ? 'the collection' : 'the folder'} "${f.node.name}"${n ? ` and its ${n} saved request${n === 1 ? '' : 's'}` : ''}`;
    if (!confirm(`Delete ${what}? This can't be undone.`)) return;
    await updateTree(t => { remove(t, id); });
    toast('Deleted', 'info');
  }

  async function dup(id) {
    let copy = null;
    await updateTree(t => { copy = duplicate(t, id); return copy ? undefined : false; });
    if (copy) toast(`Duplicated as "${copy.name}"`, 'info');
  }

  let renaming = null;
  function startRename(id) { renaming = id; paint(); }

  function nameEl(n) {
    if (renaming === n.id) {
      const input = h('input', { type: 'text', class: 'cl-rename', value: n.name, 'aria-label': 'New name', maxlength: '120' });
      let done = false;
      const finish = async (save) => { if (done) return; done = true; renaming = null; if (save) await rename(n.id, input.value); paint(); };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
      input.addEventListener('click', (e) => e.stopPropagation());
      setTimeout(() => { input.focus(); input.select(); }, 0);
      return input;
    }
    return h('span', { class: 'cl-name', ondblclick: (e) => { e.stopPropagation(); startRename(n.id); } }, n.name);
  }

  function menuFor(n) {
    if (n.type === 'request') return [
      ['Open', () => o.onOpen(n.id)],
      ['Rename', () => startRename(n.id)],
      ['Duplicate', () => dup(n.id)],
      null,
      ['Delete', () => del(n.id), { danger: true }],
    ];
    const isCol = n.type === 'collection';
    return [
      ['New request here', () => o.onNewRequest(n.id)],
      ['New folder', () => addFolder(n.id)],
      [`Run ${isCol ? 'collection' : 'folder'}`, () => o.onRun(n.id)],
      ['Schedule runs…', () => o.onSchedule(n.id)],
      null,
      [isCol ? 'Collection settings (base URL, headers, auth)' : 'Folder settings (headers, auth)', () => o.onSettings(n.id)],
      ['Rename', () => startRename(n.id)],
      ['Duplicate', () => dup(n.id)],
      ...(isCol ? [['Export to a file', () => o.onExport(n.id)], ['Publish to GitHub…', () => o.onPublish(n.id)], ['Send to a HitAPI project…', () => o.onPush(n.id)]] : []),
      null,
      ['Delete', () => del(n.id), { danger: true }],
    ];
  }

  // ── drag and drop ──
  function whereFor(e, row, n) {
    const r = row.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (n.type === 'request') return y < 0.5 ? 'before' : 'after';
    if (y < 0.25) return 'before';
    if (y > 0.75 && !(n.children.length && open.has(n.id))) return 'after';
    return 'inside';
  }
  function dnd(row, n) {
    row.draggable = renaming !== n.id;
    row.addEventListener('dragstart', (e) => { dragId = n.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.name); row.classList.add('dragging'); });
    row.addEventListener('dragend', () => { dragId = null; row.classList.remove('dragging'); clearDrop(); });
    row.addEventListener('dragover', (e) => {
      if (!dragId) return;
      let where = whereFor(e, row, n);
      if (!canMove(tree, dragId, n.id, where)) {
        // a request dropped on a collection's top/bottom edge: put it inside instead
        if (where !== 'inside' && canMove(tree, dragId, n.id, 'inside')) where = 'inside'; else { clearDrop(); return; }
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDrop();
      row.classList.add(`drop-${where}`);
      row.dataset.drop = where;
    });
    row.addEventListener('dragleave', () => { row.classList.remove('drop-before', 'drop-after', 'drop-inside'); });
    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      const where = row.dataset.drop; const id = dragId;
      clearDrop();
      if (!id || !where) return;
      const ok = await updateTree(t => (move(t, id, n.id, where) ? undefined : false));
      if (ok !== false && where === 'inside') { open.add(n.id); writeOpen(open); }
    });
  }
  const clearDrop = () => { for (const r of listEl.querySelectorAll('[data-drop]')) { r.classList.remove('drop-before', 'drop-after', 'drop-inside'); delete r.dataset.drop; } };

  // ── drawing ──
  const matches = (n) => !q || n.name.toLowerCase().includes(q) || (n.type === 'request' && String(n.draft?.url || '').toLowerCase().includes(q));
  const hasMatch = (n) => matches(n) || (n.children || []).some(hasMatch);

  function row(n, depth) {
    const container = n.type !== 'request';
    const isOpen = q ? true : open.has(n.id);
    const more = h('button', { type: 'button', class: 'cl-more', title: 'More actions', 'aria-label': `More actions for ${n.name}`,
      onclick: (e) => { e.stopPropagation(); openMenu(e.currentTarget, menuFor(n)); } }, '⋯');
    const r = h('div', {
      class: `cl-row cl-${n.type}${n.id === activeId ? ' active' : ''}`, role: 'treeitem', tabindex: '0',
      'aria-expanded': container ? String(isOpen) : null, dataset: { id: n.id }, style: { paddingLeft: `${6 + depth * 14}px` },
      onclick: () => (container ? toggle(n.id) : o.onOpen(n.id)),
      onkeydown: (e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') { e.preventDefault(); container ? toggle(n.id) : o.onOpen(n.id); }
        else if (e.key === 'F2') { e.preventDefault(); startRename(n.id); }
        else if (e.key === 'Delete') { e.preventDefault(); del(n.id); }
        else if (container && e.key === 'ArrowRight') toggle(n.id, true);
        else if (container && e.key === 'ArrowLeft') toggle(n.id, false);
      },
    },
    container ? h('span', { class: 'cl-caret', 'aria-hidden': 'true' }, isOpen ? '▾' : '▸') : h('span', { class: 'hs-method cl-method', dataset: { method: n.draft?.method || 'GET' } }, String(n.draft?.method || 'GET').slice(0, 6)),
    container ? h('span', { class: 'cl-icon', 'aria-hidden': 'true' }, n.type === 'collection' ? '▣' : '▤') : null,
    nameEl(n),
    container ? h('span', { class: 'cl-count' }, String(countRequests(n))) : null,
    n.hitapiProjectId ? h('span', { class: 'cl-linked', title: 'Linked to a HitAPI project' }, '⚡') : null,
    more);
    dnd(r, n);
    const out = [r];
    if (container && isOpen) {
      const kids = n.children.filter(hasMatch);
      if (kids.length) out.push(...kids.flatMap(c => row(c, depth + 1)));
      else if (!q) out.push(h('div', { class: 'cl-empty-child muted small', style: { paddingLeft: `${26 + depth * 14}px` } }, 'Empty. ',
        h('button', { type: 'button', class: 'link-btn', onclick: () => o.onNewRequest(n.id) }, 'Add a request'), ' or drag one here.'));
    }
    return out;
  }

  function paint() {
    if (!tree.items.length) {
      mount(listEl, h('div', { class: 'hs-empty muted small' },
        h('p', {}, 'Save requests to use them again, and group them in collections and folders.'),
        h('p', {}, h('button', { type: 'button', class: 'btn-primary btn-sm', onclick: o.onSaveCurrent }, 'Save the current request'), ' ', h('span', {}, '(Ctrl/⌘ + S)')),
        h('p', {}, 'A collection can set a base URL, headers and auth that all its requests use.')));
      return;
    }
    const shown = tree.items.filter(hasMatch);
    mount(listEl, shown.length ? shown.flatMap(c => row(c, 0)) : h('div', { class: 'hs-empty muted small' }, 'No saved request matches.'));
  }

  mount(el,
    h('div', { class: 'cl-head' },
      h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: addCollection, title: 'Create a collection' }, '+ Collection'),
      h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Import a Postman collection or environment, OpenAPI / Swagger, HAR, Insomnia or HitAPI file, or a cURL command', onclick: o.onImport }, 'Import'),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Make a collection from a HitAPI project\'s endpoints (sign-in needed)', onclick: o.onPull }, '⚡ From HitAPI')),
    search,
    listEl);
  paint();

  return {
    el,
    setTree(t) { tree = t; paint(); },
    setActive(id) {
      activeId = id;
      // show the active request: open its folders
      const f = id && find(tree, id);
      if (f) { let changed = false; for (const a of f.ancestors) if (!open.has(a.id)) { open.add(a.id); changed = true; } if (changed) writeOpen(open); }
      paint();
    },
    expand(id) { open.add(id); writeOpen(open); paint(); },
    rename: (id) => startRename(id),
  };
}
