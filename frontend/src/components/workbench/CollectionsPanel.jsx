/**
 * Web Workbench (W3) — the Collections sidebar: collections → folders → saved
 * requests. Click a request to open it; double-click a name (or F2) to rename;
 * drag rows to reorder them or move them into another folder or collection.
 * Same rules as the HitAPI extension (@hitapi/shared/collections.js).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FolderClosed, Library, MoreHorizontal, Plus, Upload, Zap, X, Search } from 'lucide-react';
import { newCollection, newFolder, find, remove, duplicate, move, canMove, countRequests } from '@hitapi/shared/collections.js';

const OPEN_KEY = 'hitapi:web:openNodes';
const readOpen = () => { try { return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]')); } catch { return new Set(); } };
const writeOpen = (s) => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...s].slice(-500))); } catch { /* storage blocked */ } };

/** A small popup menu at (x, y): items = [{ label, run, danger }] | null (divider) */
export function Menu({ menu, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const out = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', out, true);
    document.addEventListener('keydown', esc, true);
    ref.current?.querySelector('button')?.focus();
    // keep it on screen
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.right > window.innerWidth - 8) el.style.left = `${Math.max(8, window.innerWidth - r.width - 8)}px`;
      if (r.bottom > window.innerHeight - 8) el.style.top = `${Math.max(8, menu.y - r.height - menu.h - 8)}px`;
    }
    return () => { document.removeEventListener('mousedown', out, true); document.removeEventListener('keydown', esc, true); };
  }, [menu, onClose]);
  return (
    <div ref={ref} className="wbw-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
      {menu.items.map((it, i) => (it ? (
        <button key={it.label} type="button" role="menuitem" className={`wbw-menu-item${it.danger ? ' danger' : ''}`} onClick={() => { onClose(); it.run(); }}>{it.label}</button>
      ) : <div key={`sep${i}`} className="wbw-menu-sep" />))}
    </div>
  );
}

function RenameInput({ value, onDone }) {
  const [v, setV] = useState(value);
  const done = useRef(false);
  const finish = (save) => { if (done.current) return; done.current = true; onDone(save ? v : null); };
  return (
    <input className="input wbw-cl-rename" aria-label="New name" maxLength={120} value={v} autoFocus onFocus={(e) => e.target.select()}
      onChange={(e) => setV(e.target.value)} onClick={(e) => e.stopPropagation()} onBlur={() => finish(true)}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } }} />
  );
}

/**
 * @param {object} p
 * @param {{ items: Array }} p.tree
 * @param {string|null} p.activeId          the saved request open in the editor
 * @param {(fn: (tree) => any) => any} p.edit  change the tree (handles storage errors)
 * @param {boolean} p.signedIn
 */
export function CollectionsPanel({ tree, activeId, edit, notify, signedIn, tabs, renameId = null, onRenamed = () => {}, expand = null, onSchedule = () => {}, onCi = () => {}, onGitHub = () => {}, onClose, onOpen, onNewRequest, onSettings, onRun, onExport, onPush, onImport, onPull, onSaveCurrent, onMove }) {
  const [open, setOpen] = useState(readOpen);
  const [q, setQ] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [menu, setMenu] = useState(null);
  const [drop, setDrop] = useState(null);     // { id, where }
  const dragId = useRef(null);

  const setOpenIds = (fn) => setOpen((s) => { const n = new Set(s); fn(n); writeOpen(n); return n; });
  const toggle = (id, force) => setOpenIds((s) => { const want = force ?? !s.has(id); if (want) s.add(id); else s.delete(id); });

  // show the open request: expand its collection and folders
  useEffect(() => {
    const f = activeId && find(tree, activeId);
    if (f && f.ancestors.some(a => !open.has(a.id))) setOpenIds((s) => { for (const a of f.ancestors) s.add(a.id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, tree]);

  // just imported: show what came in
  useEffect(() => { if (expand?.ids?.length) setOpenIds((s) => { for (const id of expand.ids) s.add(id); }); }, [expand]);   // eslint-disable-line react-hooks/exhaustive-deps

  // a request just made with "New request here": name it at once
  useEffect(() => { if (renameId) { setRenaming(renameId); onRenamed(); } }, [renameId, onRenamed]);

  const uniqueName = (base) => {
    const names = new Set(tree.items.map(c => c.name));
    if (!names.has(base)) return base;
    for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
  };
  const addCollection = () => {
    const c = newCollection(uniqueName('New collection'));
    if (edit(t => { t.items.push(c); return true; }) !== true) return;
    setOpenIds(s => s.add(c.id)); setRenaming(c.id);
  };
  const addFolder = (parentId) => {
    const f = newFolder();
    if (edit(t => { const p = find(t, parentId); if (!p) return false; p.node.children.push(f); return true; }) !== true) return;
    setOpenIds(s => { s.add(parentId); s.add(f.id); }); setRenaming(f.id);
  };
  const rename = (id, name) => {
    name = String(name || '').trim();
    if (!name) return;
    edit(t => { const f = find(t, id); if (!f || f.node.name === name) return false; f.node.name = name.slice(0, 120); return true; });
  };
  const del = (id) => {
    const f = find(tree, id);
    if (!f) return;
    const n = countRequests(f.node);
    const what = f.node.type === 'request' ? `the request "${f.node.name}"` : `${f.node.type === 'collection' ? 'the collection' : 'the folder'} "${f.node.name}"${n ? ` and its ${n} saved request${n === 1 ? '' : 's'}` : ''}`;
    if (!confirm(`Delete ${what}? This can't be undone.`)) return;
    if (edit(t => { remove(t, id); return true; }) === true) notify('Deleted', 'info');
  };
  const dup = (id) => {
    const copy = edit(t => duplicate(t, id) || false);
    if (copy) notify(`Duplicated as "${copy.name}"`, 'success');
  };

  const menuFor = (n) => {
    if (n.type === 'request') return [
      { label: 'Open', run: () => onOpen(n.id) },
      { label: 'Rename', run: () => setRenaming(n.id) },
      { label: 'Duplicate', run: () => dup(n.id) },
      { label: 'Move to…', run: () => onMove(n.id) },
      null,
      { label: 'Delete', run: () => del(n.id), danger: true },
    ];
    const isCol = n.type === 'collection';
    return [
      { label: 'New request here', run: () => onNewRequest(n.id) },
      { label: 'New folder', run: () => addFolder(n.id) },
      { label: `Run ${isCol ? 'collection' : 'folder'}`, run: () => onRun(n.id) },
      { label: 'Schedule runs in the cloud…', run: () => onSchedule(n.id) },
      null,
      { label: isCol ? 'Collection settings (base URL, headers, auth)' : 'Folder settings (headers, auth)', run: () => onSettings(n.id) },
      { label: 'Rename', run: () => setRenaming(n.id) },
      { label: 'Duplicate', run: () => dup(n.id) },
      ...(isCol ? [{ label: 'Export to a file', run: () => onExport(n.id) }, { label: 'Use in CI (hitapi-cli)…', run: () => onCi(n.id) }, { label: 'Publish to GitHub…', run: () => onGitHub(n.id) }, { label: 'Send to a HitAPI project…', run: () => onPush(n.id) }] : [{ label: 'Move to…', run: () => onMove(n.id) }]),
      null,
      { label: 'Delete', run: () => del(n.id), danger: true },
    ];
  };
  const showMenu = (e, n) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 4, h: r.height, items: menuFor(n) });
  };

  // ── drag and drop ──
  const whereFor = (e, n) => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (n.type === 'request') return y < 0.5 ? 'before' : 'after';
    if (y < 0.25) return 'before';
    if (y > 0.75 && !(n.children.length && open.has(n.id))) return 'after';
    return 'inside';
  };
  const dndProps = (n) => ({
    draggable: renaming !== n.id,
    onDragStart: (e) => { dragId.current = n.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.name); },
    onDragEnd: () => { dragId.current = null; setDrop(null); },
    onDragOver: (e) => {
      const id = dragId.current;
      if (!id) return;
      let where = whereFor(e, n);
      if (!canMove(tree, id, n.id, where)) {
        // a request dropped on a collection's top/bottom edge goes inside it instead
        if (where !== 'inside' && canMove(tree, id, n.id, 'inside')) where = 'inside'; else { if (drop) setDrop(null); return; }
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (drop?.id !== n.id || drop?.where !== where) setDrop({ id: n.id, where });
    },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget) && drop?.id === n.id) setDrop(null); },
    onDrop: (e) => {
      e.preventDefault();
      const id = dragId.current; const where = drop?.id === n.id ? drop.where : null;
      dragId.current = null; setDrop(null);
      if (!id || !where) return;
      if (edit(t => (move(t, id, n.id, where) ? true : false)) === true && where === 'inside') setOpenIds(s => s.add(n.id));
    },
  });

  // ── drawing ──
  const ql = q.trim().toLowerCase();
  const matches = (n) => !ql || n.name.toLowerCase().includes(ql) || (n.type === 'request' && String(n.draft?.url || '').toLowerCase().includes(ql));
  const hasMatch = (n) => matches(n) || (n.children || []).some(hasMatch);
  const total = useMemo(() => tree.items.reduce((s, c) => s + countRequests(c), 0), [tree]);

  const row = (n, depth) => {
    const container = n.type !== 'request';
    const isOpen = ql ? true : open.has(n.id);
    const method = String(n.draft?.method || 'GET').toUpperCase();
    const dropCls = drop?.id === n.id ? ` drop-${drop.where}` : '';
    const out = [(
      <div key={n.id} className={`wbw-cl-row wbw-cl-${n.type}${n.id === activeId ? ' active' : ''}${dropCls}`} role="treeitem" tabIndex={0}
        aria-expanded={container ? isOpen : undefined} aria-selected={n.id === activeId} data-id={n.id} style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => (container ? toggle(n.id) : onOpen(n.id))}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter') { e.preventDefault(); container ? toggle(n.id) : onOpen(n.id); }
          else if (e.key === 'F2') { e.preventDefault(); setRenaming(n.id); }
          else if (e.key === 'Delete') { e.preventDefault(); del(n.id); }
          else if (container && e.key === 'ArrowRight') toggle(n.id, true);
          else if (container && e.key === 'ArrowLeft') toggle(n.id, false);
        }}
        {...dndProps(n)}>
        {container
          ? <span className="wbw-cl-caret" aria-hidden="true">{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
          : <span className={`method-badge method-${method} wbw-cl-method`}>{method.slice(0, 6)}</span>}
        {container && <span className="wbw-cl-icon" aria-hidden="true">{n.type === 'collection' ? <Library size={13} /> : <FolderClosed size={13} />}</span>}
        {renaming === n.id
          ? <RenameInput value={n.name} onDone={(v) => { setRenaming(null); if (v != null) rename(n.id, v); }} />
          : <span className="wbw-cl-name truncate" onDoubleClick={(e) => { e.stopPropagation(); setRenaming(n.id); }}>{n.name}</span>}
        {container && <span className="wbw-cl-count">{countRequests(n)}</span>}
        {n.hitapiProjectId && <span className="wbw-cl-linked" title="Linked to a HitAPI project"><Zap size={11} /></span>}
        <button type="button" className="btn btn-ghost btn-icon wbw-cl-more" aria-label={`More actions for ${n.name}`} onClick={(e) => showMenu(e, n)}><MoreHorizontal size={14} /></button>
      </div>
    )];
    if (container && isOpen) {
      const kids = n.children.filter(hasMatch);
      if (kids.length) for (const c of kids) out.push(...row(c, depth + 1));
      else if (!ql) out.push(
        <div key={`${n.id}-empty`} className="wbw-cl-emptychild text-xs text-tertiary" style={{ paddingLeft: 26 + depth * 14 }}>
          Empty. <button type="button" className="wbw-link" onClick={() => onNewRequest(n.id)}>Add a request</button> or drag one here.
        </div>);
    }
    return out;
  };

  const shown = tree.items.filter(hasMatch);
  return (
    <aside className="wbw-side wbw-collections" aria-label="Collections">
      <div className="wbw-side-head">
        {tabs}
        <span className="wbw-grow" />
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Hide the sidebar" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="wbw-cl-head">
        <button type="button" className="btn btn-ghost btn-sm wbw-cl-add" onClick={addCollection} title="Create a collection"><Plus size={12} /> Collection</button>
        <span className="wbw-grow" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={onImport} title="Import a Postman collection or environment, OpenAPI / Swagger, HAR, Insomnia or HitAPI file, or a cURL command"><Upload size={12} /> Import</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onPull} title={signedIn ? 'Make a collection from a HitAPI project\'s endpoints' : 'Make a collection from a HitAPI project (sign-in needed)'}><Zap size={12} /> From HitAPI</button>
      </div>
      {tree.items.length > 0 && (
        <div className="wbw-hs-searchbox"><Search size={13} aria-hidden="true" />
          <input className="input" type="search" placeholder="Filter saved requests" aria-label="Filter saved requests" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      )}
      <div className="wbw-cl-list" role="tree" aria-label="Saved requests">
        {!tree.items.length ? (
          <div className="wbw-cl-empty text-sm text-tertiary">
            <p>Save requests to use them again, and group them in collections and folders.</p>
            <p><button type="button" className="btn btn-primary btn-sm" onClick={onSaveCurrent}>Save the current request</button> <span className="text-xs">(Ctrl/⌘ + S)</span></p>
            <p>A collection can set a base URL, headers and auth that all its requests use.</p>
          </div>
        ) : shown.length ? shown.flatMap(c => row(c, 0)) : <div className="wbw-cl-empty text-sm text-tertiary">No saved request matches.</div>}
      </div>
      <p className="text-xs text-tertiary wbw-cl-foot">{total ? `${total} saved request${total === 1 ? '' : 's'}. ` : ''}Saved in this browser only{signedIn ? '; syncing to your account is coming soon' : ''}. Export a collection to use it on another computer or in the HitAPI extension.</p>
      {menu && <Menu menu={menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}
