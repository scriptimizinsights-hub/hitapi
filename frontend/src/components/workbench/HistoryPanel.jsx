import { useEffect, useMemo, useState } from 'react';
import { Settings2, Trash2, X, Search } from 'lucide-react';
import { groupByDay, matchesFilter } from '@hitapi/shared/history.js';
import { formatBytes } from '@hitapi/shared/http.js';
import { listIndex, onHistoryChange, removeEntry, clearAll, clearOlderThan, getSettings, setSettings, available, LIMITS } from './history-db.js';

const PAGE = 150;
const pathOf = (url) => { try { const u = new URL(url); return (u.pathname + u.search) || '/'; } catch { return url; } };
const timeOf = (at) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const tone = (m) => (m.error ? 'red' : !m.status ? 'gray' : m.status < 300 ? 'green' : m.status < 400 ? 'blue' : m.status < 500 ? 'amber' : 'red');
const statusText = (m) => (m.error ? (m.error === 'timeout' ? 'Timeout' : 'Error') : m.status ? String(m.status) : '—');

/** The History sidebar: every request sent, newest first, grouped by day, with search and filters. */
export function HistoryPanel({ activeId, onOpen, onClose, onCount, tabs = null }) {
  const [index, setIndex] = useState([]);
  const [ok, setOk] = useState(true);
  const [f, setF] = useState({ q: '', method: '', status: '', host: '' });
  const [shown, setShown] = useState(PAGE);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setLocal] = useState(getSettings);
  const save = (patch) => { setLocal((x) => ({ ...x, ...patch })); setSettings(patch).catch(() => {}); };   // shown at once, stored after

  useEffect(() => {
    let live = true;
    const load = () => listIndex().then((list) => { if (live) { setIndex(list); onCount?.(list.length); } });
    available().then(setOk);
    load();
    const off = onHistoryChange(load);
    return () => { live = false; off(); };
  }, [onCount]);

  const methods = useMemo(() => [...new Set(index.map(m => m.method))].sort(), [index]);
  const hosts = useMemo(() => [...new Set(index.map(m => m.host).filter(Boolean))].sort(), [index]);
  const filtered = useMemo(() => index.filter(m => matchesFilter(m, f)), [index, f]);
  const groups = useMemo(() => groupByDay(filtered.slice(0, shown)), [filtered, shown]);
  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setShown(PAGE); };
  const filtering = !!(f.q || f.method || f.status || f.host);

  return (
    <aside className="wbw-side wbw-history" aria-label="History">
      <div className="wbw-side-head">
        {tabs || <strong>History</strong>}
        <span className="text-xs text-tertiary" role="status">{filtering ? `${filtered.length} of ${index.length}` : `${index.length} request${index.length === 1 ? '' : 's'}`}</span>
        <span className="wbw-grow" />
        <button type="button" className="btn btn-ghost btn-icon" aria-label="History settings" aria-expanded={showSettings} onClick={() => setShowSettings(s => !s)}><Settings2 size={14} /></button>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Hide history" onClick={onClose}><X size={14} /></button>
      </div>
      {!ok && <div className="wbw-note">History isn't available in this browser mode (private window or storage blocked). Requests still send; they're kept until you leave the page.</div>}
      {showSettings && (
        <div className="wbw-hs-settings">
          <label className="wbw-check"><input type="checkbox" checked={settings.enabled} onChange={(e) => save({ enabled: e.target.checked })} /> Keep a history of requests</label>
          <label className="wbw-field"><span>Keep at most</span>
            <select className="input" value={settings.maxEntries} onChange={(e) => save({ maxEntries: Number(e.target.value) })}>
              {LIMITS.map(n => <option key={n} value={n}>{n} requests</option>)}
            </select>
          </label>
          <label className="wbw-field"><span>Don't keep requests to these hosts</span>
            <input className="input font-mono" placeholder="localhost:3000, *.internal.example.com" defaultValue={settings.skipHosts}
              onBlur={(e) => save({ skipHosts: e.target.value })} aria-label="Hosts to skip" />
          </label>
          <div className="wbw-row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { const n = await clearOlderThan(7); alertish(`${n} older request${n === 1 ? '' : 's'} removed`); }}>Clear older than 7 days</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { const n = await clearOlderThan(30); alertish(`${n} older request${n === 1 ? '' : 's'} removed`); }}>Older than 30 days</button>
            <button type="button" className="btn btn-danger btn-sm wbw-hs-clear" disabled={!index.length} onClick={async () => { if (confirm(`Delete all ${index.length} requests from history?`)) await clearAll(); }}>Clear all</button>
          </div>
          <p className="text-xs text-tertiary">Kept in this browser only (up to 25 MB). Tokens, passwords, API keys and cookies are not kept.</p>
        </div>
      )}
      <div className="wbw-hs-filters">
        <div className="wbw-hs-searchbox"><Search size={13} /><input type="search" className="input" placeholder="Search URL, body, response" aria-label="Search history" value={f.q} onChange={(e) => set({ q: e.target.value })} /></div>
        <div className="wbw-row">
          <select className="input wbw-hs-sel" aria-label="Filter by status" value={f.status} onChange={(e) => set({ status: e.target.value })}>
            {[['', 'Status'], ['2xx', '2xx'], ['3xx', '3xx'], ['4xx', '4xx'], ['5xx', '5xx'], ['error', 'Failed'], ['tests', 'Tests failed']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="input wbw-hs-sel" aria-label="Filter by method" value={f.method} onChange={(e) => set({ method: e.target.value })}>
            <option value="">Method</option>{methods.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="input wbw-hs-sel" aria-label="Filter by host" value={f.host} onChange={(e) => set({ host: e.target.value })}>
            <option value="">Host</option>{hosts.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      </div>
      <div className="wbw-hs-list" role="list">
        {!index.length ? <p className="text-sm text-tertiary">Requests you send are kept here, with their responses, in this browser only. Tokens and passwords are not kept.</p>
          : !filtered.length ? <p className="text-sm text-tertiary">Nothing matches. <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ q: '', method: '', status: '', host: '' })}>Clear filters</button></p>
            : groups.map(g => (
              <div key={g.label} className="wbw-hs-group">
                <div className="wbw-hs-day">{g.label}</div>
                {g.items.map(m => (
                  <div key={m.id} role="listitem" className={`wbw-hs-item${m.id === activeId ? ' on' : ''}`}>
                    <button type="button" className="wbw-hs-open" title={`${m.method} ${m.url}${m.size ? ` · ${formatBytes(m.size)}` : ''}`} onClick={() => onOpen(m)}>
                      <span className={`method-badge method-${m.method}`}>{m.method.length > 6 ? `${m.method.slice(0, 5)}…` : m.method}</span>
                      <span className="wbw-hs-what">
                        <span className="wbw-hs-path font-mono truncate">{pathOf(m.url)}</span>
                        <span className="wbw-hs-meta text-xs text-tertiary"><span className="wbw-hs-host truncate">{m.host}</span><span>{timeOf(m.at)}</span>{!m.error && m.ms ? <span>{m.ms} ms</span> : null}{m.tests ? <span className={`wbw-hs-tests ${m.tests.passed === m.tests.total ? 'ok' : 'bad'}`} title="Tests passed">{m.tests.passed === m.tests.total ? '✓' : '✗'} {m.tests.passed}/{m.tests.total}</span> : null}</span>
                      </span>
                      <span className={`wbw-st sm ${tone(m)}`}>{statusText(m)}</span>
                    </button>
                    <button type="button" className="btn btn-ghost btn-icon wbw-hs-del" aria-label={`Delete ${m.method} ${pathOf(m.url)} from history`} onClick={() => removeEntry(m.id)}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            ))}
        {filtered.length > shown && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShown(shown + PAGE)}>Show more ({filtered.length - shown})</button>}
      </div>
    </aside>
  );
}

let toastFn = null;
export const setHistoryToast = (fn) => { toastFn = fn; };
function alertish(msg) { toastFn?.(msg); }
