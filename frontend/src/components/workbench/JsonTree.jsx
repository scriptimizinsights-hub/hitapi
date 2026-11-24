import { useMemo, useState, useCallback, useEffect } from 'react';
import { jsonPath, linkFromValue } from '@hitapi/shared/response.js';

const PAGE = 100;   // array items / object keys shown before "Show more"

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const keyOf = (path) => JSON.stringify(path);

/** Paths (as key arrays) whose key or value contains the query, up to 500. */
function search(value, q) {
  const out = [];
  if (!q) return out;
  const needle = q.toLowerCase();
  const walk = (v, path) => {
    if (out.length >= 500) return;
    const k = path[path.length - 1];
    if (k !== undefined && String(k).toLowerCase().includes(needle)) { out.push(path); }
    else if (v === null || typeof v !== 'object') { if (String(v).toLowerCase().includes(needle)) out.push(path); return; }
    if (v && typeof v === 'object') {
      const entries = Array.isArray(v) ? v.map((x, i) => [i, x]) : Object.entries(v);
      for (const [ck, cv] of entries) walk(cv, [...path, ck]);
    }
  };
  walk(value, []);
  return out;
}

function Node({ name, value, path, depth, open, toggle, matchSet, current, onCopy, onAddTest, baseUrl, isLastKey }) {
  const t = typeOf(value);
  const k = keyOf(path);
  const isMatch = matchSet.has(k);
  const isCurrent = current === k;
  const [limit, setLimit] = useState(PAGE);
  const label = name === undefined ? null : (
    <span className="jt-key">{typeof name === 'number' ? name : JSON.stringify(name)}<span className="jt-p">: </span></span>
  );
  const actions = (
    <span className="jt-actions">
      <button type="button" onClick={() => onCopy(jsonPath(path), 'path')} title="Copy the JSONPath">path</button>
      <button type="button" onClick={() => onCopy(typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'value')} title="Copy the value">copy</button>
      {onAddTest && <button type="button" className="jt-test" onClick={() => onAddTest(jsonPath(path), value)} title="Add a check for this value to the request's Tests">test</button>}
    </span>
  );
  if (t !== 'object' && t !== 'array') {
    const link = linkFromValue(value, name, baseUrl);
    const text = t === 'string' ? JSON.stringify(value) : String(value);
    return (
      <div className={`jt-row${isMatch ? ' jt-match' : ''}${isCurrent ? ' jt-current' : ''}`} style={{ paddingLeft: depth * 16 }} data-path={k}>
        <span className="jt-tw" />{label}
        {link ? <a className={`jt-${t}`} href={link} target="_blank" rel="noopener noreferrer nofollow">{text}</a> : <span className={`jt-${t}`}>{text}</span>}
        {actions}
      </div>
    );
  }
  const entries = t === 'array' ? value.map((v, i) => [i, v]) : Object.entries(value);
  const isOpen = open.has(k);
  const summary = t === 'array' ? `[ ${entries.length} item${entries.length === 1 ? '' : 's'} ]` : `{ ${entries.length} key${entries.length === 1 ? '' : 's'} }`;
  return (
    <>
      <div className={`jt-row${isMatch ? ' jt-match' : ''}${isCurrent ? ' jt-current' : ''}`} style={{ paddingLeft: depth * 16 }} data-path={k}>
        <button type="button" className="jt-tw" aria-expanded={isOpen} aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={() => toggle(k)}>{isOpen ? '▾' : '▸'}</button>
        {label}<span className="jt-sum" onClick={() => toggle(k)}>{summary}</span>{actions}
      </div>
      {isOpen && entries.slice(0, limit).map(([ck, cv]) => (
        <Node key={ck} name={ck} value={cv} path={[...path, ck]} depth={depth + 1} open={open} toggle={toggle} matchSet={matchSet} current={current} onCopy={onCopy} onAddTest={onAddTest} baseUrl={baseUrl} />
      ))}
      {isOpen && entries.length > limit && (
        <div className="jt-row" style={{ paddingLeft: (depth + 1) * 16 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLimit(limit + PAGE * 5)}>Show {Math.min(PAGE * 5, entries.length - limit)} more of {entries.length - limit}</button>
        </div>
      )}
    </>
  );
}

/** Collapsible JSON with search, expand/collapse all, copy value / JSONPath, clickable links. */
export function JsonTree({ value, baseUrl, onCopy, onAddTest = null }) {
  const initial = useMemo(() => {
    const s = new Set([keyOf([])]);
    const walk = (v, path, d) => {
      if (d >= 2 || !v || typeof v !== 'object') return;
      const entries = Array.isArray(v) ? v.slice(0, 20).map((x, i) => [i, x]) : Object.entries(v).slice(0, 50);
      for (const [k, x] of entries) { if (x && typeof x === 'object') { s.add(keyOf([...path, k])); walk(x, [...path, k], d + 1); } }
    };
    walk(value, [], 0);
    return s;
  }, [value]);
  const [open, setOpen] = useState(initial);
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  useEffect(() => { setOpen(initial); }, [initial]);
  const toggle = useCallback((k) => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; }), []);
  const matches = useMemo(() => search(value, q.trim()), [value, q]);
  const matchSet = useMemo(() => new Set(matches.map(keyOf)), [matches]);
  const current = matches.length ? keyOf(matches[Math.min(at, matches.length - 1)]) : null;
  // open the parents of every match so they can be seen
  useEffect(() => {
    if (!matches.length) return;
    setOpen((o) => { const n = new Set(o); for (const m of matches.slice(0, 200)) for (let i = 0; i < m.length; i++) n.add(keyOf(m.slice(0, i))); return n; });
  }, [matches]);
  useEffect(() => {
    if (!current) return;
    const el = document.querySelector(`.jt [data-path="${CSS.escape(current)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [current, open]);
  const expandAll = () => {
    const s = new Set(); let n = 0;
    const walk = (v, path) => { if (!v || typeof v !== 'object' || n > 5000) return; s.add(keyOf(path)); n++; (Array.isArray(v) ? v.slice(0, PAGE).map((x, i) => [i, x]) : Object.entries(v)).forEach(([k, x]) => walk(x, [...path, k])); };
    walk(value, []); setOpen(s);
  };
  return (
    <div className="jt-wrap">
      <div className="wbw-row">
        <input className="input wbw-search" type="search" placeholder="Search keys and values" aria-label="Search the JSON" value={q} onChange={(e) => { setQ(e.target.value); setAt(0); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && matches.length) setAt((at + (e.shiftKey ? matches.length - 1 : 1)) % matches.length); }} />
        {q && <span className="text-xs text-tertiary" role="status">{matches.length ? `${Math.min(at, matches.length - 1) + 1} of ${matches.length}${matches.length >= 500 ? '+' : ''}` : 'No matches'}</span>}
        {q && matches.length > 1 && <>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Previous match" onClick={() => setAt((at + matches.length - 1) % matches.length)}>↑</button>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Next match" onClick={() => setAt((at + 1) % matches.length)}>↓</button>
        </>}
        <span className="wbw-grow" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={expandAll}>Expand all</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(new Set([keyOf([])]))}>Collapse all</button>
      </div>
      <div className="jt font-mono" role="tree" aria-label="JSON response">
        <Node value={value} path={[]} depth={0} open={open} toggle={toggle} matchSet={matchSet} current={current} onCopy={onCopy} onAddTest={onAddTest} baseUrl={baseUrl} />
      </div>
    </div>
  );
}
