/**
 * HitAPI Web Workbench (web roadmap W1): build any HTTP request, send it from
 * HitAPI cloud, this browser or the HitAPI extension, and read the response.
 * Used by the public /playground page and the signed-in /workbench page.
 * The request logic is the HitAPI extension's (@hitapi/shared).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Square, Terminal, Code2, Copy, FilePlus2, History, X } from 'lucide-react';
import { METHODS, paramsFromUrl, importHeaders, normalizeUrl } from '@hitapi/shared/http.js';
import { detectBody } from '@hitapi/shared/body.js';
import { emptyAuth } from '@hitapi/shared/auth.js';
import { parseCurl, looksLikeCurl } from '@hitapi/shared/curl.js';
import { emptyDraft, normalizeDraft, loadDraft, saveDraft, loadRecent, addRecent, autoMode, finalRequest, isLocalUrl } from './core.js';
import { send } from './send.js';
import { pingExtension, connectExtension } from './bridge.js';
import { RequestTabs } from './RequestTabs.jsx';
import { ResponseView } from './ResponseView.jsx';
import { ModePicker } from './ModePicker.jsx';
import { CodeDialog, CurlDialog } from './Dialogs.jsx';
import { cachedToken } from './send.js';
import { useStore } from '../../store/index.js';
import './workbench.css';

const MODE_KEY = 'hitapi:web:mode';

export const SAMPLES = [
  { label: 'Get a user', method: 'GET', url: 'https://services.hitapi.dev/mock/demo/users/42' },
  { label: 'List posts', method: 'GET', url: 'https://jsonplaceholder.typicode.com/posts?_limit=5' },
  { label: 'Create a post', method: 'POST', url: 'https://jsonplaceholder.typicode.com/posts', json: '{\n  "title": "Hello",\n  "body": "From HitAPI",\n  "userId": 1\n}' },
  { label: 'Echo headers', method: 'GET', url: 'https://httpbin.org/headers' },
];

const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString(); };

export function Workbench({ variant = 'public' }) {
  const addToast = useStore((s) => s.addToast);
  const notify = useCallback((m, type = 'info') => addToast?.(m, type), [addToast]);
  const [draft, setDraft] = useState(emptyDraft);
  const [files, setFiles] = useState({ binary: null, form: new Map() });
  const [res, setRes] = useState(null);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState('params');
  const [modeChoice, setModeChoice] = useState(null);
  const [ext, setExt] = useState({ installed: false, allowed: false, outdated: false, version: null });
  const [connecting, setConnecting] = useState(false);
  const [recent, setRecent] = useState([]);
  const [showRecent, setShowRecent] = useState(false);
  const [dialog, setDialog] = useState(null);   // 'code' | 'curl'
  const [notes, setNotes] = useState([]);
  const [ready, setReady] = useState(false);
  const ctrl = useRef(null);
  const saveTimer = useRef(null);

  // load the draft, recent list, chosen mode and the extension state (browser only, after the first paint)
  useEffect(() => {
    const d = loadDraft();
    if (d) { setDraft(d); if (d.bodyType !== 'none' && d.method !== 'GET' && d.method !== 'HEAD') setTab('body'); }
    setRecent(loadRecent());
    try { const m = localStorage.getItem(MODE_KEY); if (m) setModeChoice(m); } catch { /* ignore */ }
    const refresh = () => pingExtension().then(setExt);
    refresh();
    window.addEventListener('focus', refresh);
    setReady(true);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const mode = modeChoice || autoMode(draft.url, ext);
  const chooseMode = (m) => { setModeChoice(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } };

  const update = useCallback((patch) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      if ('url' in patch && !('params' in patch)) next.params = paramsFromUrl(patch.url, d.params);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => saveDraft(next), 300);
      return next;
    });
  }, []);

  const loadInto = useCallback((d, message) => {
    const next = normalizeDraft(d);
    clearTimeout(saveTimer.current);   // a pending save of the old draft must not overwrite this one
    setDraft(next); saveDraft(next); setFiles({ binary: null, form: new Map() }); setRes(null);
    setTab(next.method !== 'GET' && next.method !== 'HEAD' && next.bodyType !== 'none' ? 'body' : 'params');
    if (message) notify(message, 'success');
  }, [notify]);

  const importCurl = useCallback((text) => {
    let parsed;
    try { parsed = parseCurl(text); } catch (e) { return `Couldn't read that cURL command: ${e.message}`; }
    const { rows: headers, skipped } = importHeaders(parsed.headers.map(h => [h.key, h.value]));
    const n = [...(parsed.warnings || [])];
    if (skipped.length) n.push(`Skipped ${skipped.length} header${skipped.length === 1 ? '' : 's'} the browser sets itself (${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? ', …' : ''}).`);
    if (headers.some(h => !h.enabled)) n.push('User-Agent, Origin and Referer were imported switched off; switch them on if the API checks them.');
    const auth = emptyAuth();
    if (parsed.auth?.type === 'basic' && !headers.some(h => h.key.toLowerCase() === 'authorization')) { auth.type = 'basic'; auth.basic = { username: parsed.auth.username, password: parsed.auth.password }; n.push('-u user:… was put in the Auth tab as Basic auth.'); }
    const ct = headers.find(h => h.enabled && h.key.toLowerCase() === 'content-type')?.value || '';
    const { bodyType, bodies } = detectBody(parsed.body || '', ct);
    loadInto({ ...emptyDraft(), method: parsed.method, url: parsed.url, params: paramsFromUrl(parsed.url), headers, bodyType, bodies, auth, settings: draft.settings }, 'Imported from cURL. Check it, then Send.');
    setNotes(n); setDialog(null);
    return null;
  }, [draft.settings, loadInto]);

  const doSend = useCallback(async () => {
    if (sending) return;
    if (!draft.url.trim()) { setRes({ error: 'Enter a URL first.', kind: 'invalid', warnings: [] }); return; }
    if (mode === 'extension' && !(ext.installed && ext.allowed && !ext.outdated)) {
      setRes({ error: !ext.installed ? 'The HitAPI extension isn\'t installed in this browser.' : ext.outdated ? 'Your HitAPI extension is too old. Update it to 2.1 or newer.' : 'Connect the HitAPI extension first (button above).', kind: 'not_allowed', warnings: [] });
      return;
    }
    const c = new AbortController(); ctrl.current = c;
    const limit = mode === 'cloud' ? Math.min(15, draft.settings.timeoutSec) + 2 : draft.settings.timeoutSec;
    const t = setTimeout(() => c.abort('timeout'), limit * 1000);
    setSending(true); setRes(null);
    try {
      const r = await send(draft, { mode, files, signal: c.signal, id: `${Date.now()}` });
      setRes(r);
      if (r.kind !== 'invalid' && r.kind !== 'cancel') setRecent((list) => addRecent(list, draft, r));
    } finally { clearTimeout(t); ctrl.current = null; setSending(false); }
  }, [draft, files, mode, ext, sending]);

  const cancel = () => ctrl.current?.abort('cancel');

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !dialog) { e.preventDefault(); doSend(); }
      else if (e.key === 'Escape' && sending) cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doSend, sending, dialog]);

  const onUrlPaste = (e) => {
    const text = e.clipboardData?.getData('text') || '';
    if (looksLikeCurl(text)) { e.preventDefault(); const err = importCurl(text); if (err) notify(err, 'error'); }
  };

  const connect = async () => {
    setConnecting(true);
    const ok = await connectExtension();
    setConnecting(false);
    setExt(await pingExtension());
    notify(ok ? 'The HitAPI extension is connected.' : 'Not connected. You can try again any time.', ok ? 'success' : 'info');
  };

  const final = useMemo(() => (dialog === 'code' ? finalRequest(draft, files, draft.auth.type === 'oauth2' ? cachedToken(draft.auth.oauth2) : null) : null), [dialog, draft, files]);
  const copyCurl = () => {
    const { curl } = finalRequest(draft, files, draft.auth.type === 'oauth2' ? cachedToken(draft.auth.oauth2) : null);
    navigator.clipboard?.writeText(curl).then(() => notify('Copied as cURL', 'success'), () => notify('Copy failed', 'error'));
  };

  const methodClass = `method-${String(draft.method).toUpperCase()}`;
  return (
    <div className={`wbw wbw-${variant}`} data-ready={ready ? '1' : '0'}>
      <div className="wbw-toolbar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog('curl')}><Terminal size={13} /> Import cURL</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copyCurl} disabled={!draft.url.trim()}><Copy size={13} /> Copy as cURL</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDialog('code')} disabled={!draft.url.trim()}><Code2 size={13} /> Code</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (!draft.url || confirm('Start a new request? The current one is cleared.')) { loadInto(emptyDraft()); setNotes([]); } }}><FilePlus2 size={13} /> New request</button>
        <span className="wbw-grow" />
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={showRecent} onClick={() => setShowRecent(s => !s)}><History size={13} /> Recent{recent.length ? ` (${recent.length})` : ''}</button>
      </div>
      {variant === 'public' && (
        <div className="wbw-samples">
          <span className="text-xs text-tertiary">Try:</span>
          {SAMPLES.map(s => (
            <button key={s.label} type="button" className="btn btn-ghost btn-sm" onClick={() => loadInto({ ...emptyDraft(), method: s.method, url: s.url, params: paramsFromUrl(s.url), bodyType: s.json ? 'json' : 'none', bodies: { ...emptyDraft().bodies, json: s.json || '' } })}>
              <span className={`method-badge method-${s.method}`}>{s.method}</span> {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="wbw-bar">
        <input className={`input font-mono wbw-method ${methodClass}`} list="wbw-methods" aria-label="HTTP method" value={draft.method} spellCheck={false}
          onChange={(e) => update({ method: e.target.value.toUpperCase().replace(/\s/g, '') })} onFocus={(e) => e.target.select()} />
        <datalist id="wbw-methods">{METHODS.map(m => <option key={m} value={m} />)}</datalist>
        <input className="input font-mono wbw-url" aria-label="Request URL" placeholder="https://api.example.com/v1/users — or paste a cURL command" spellCheck={false}
          value={draft.url} onChange={(e) => update({ url: e.target.value })} onPaste={onUrlPaste}
          onBlur={() => { if (draft.url.trim() && !/^[a-z][\w+.-]*:\/\//i.test(draft.url.trim())) update({ url: normalizeUrl(draft.url) }); }} />
        {sending ? <button type="button" className="btn btn-danger wbw-send" onClick={cancel}><Square size={13} /> Cancel</button>
          : <button type="button" className="btn btn-primary wbw-send" onClick={doSend} title="Send (Ctrl/⌘ + Enter)"><Send size={14} /> Send</button>}
      </div>
      <ModePicker mode={mode} setMode={chooseMode} ext={ext} onConnect={connect} connecting={connecting} auto={!modeChoice && !!draft.url.trim() && isLocalUrl(draft.url)} />

      {notes.length > 0 && (
        <div className="wbw-note wbw-notes">
          <div>{notes.map((n, i) => <div key={i}>{n}</div>)}</div>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Dismiss" onClick={() => setNotes([])}><X size={12} /></button>
        </div>
      )}

      <div className={`wbw-main${showRecent ? ' with-side' : ''}`}>
        {showRecent && (
          <aside className="wbw-side" aria-label="Recent requests">
            <div className="wbw-side-head"><strong>Recent</strong>
              {recent.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRecent([]); try { localStorage.setItem('hitapi:web:recent', '[]'); } catch { /* ignore */ } }}>Clear</button>}
            </div>
            {recent.length === 0 ? <p className="text-sm text-tertiary">Requests you send are listed here, in this browser only. Tokens and passwords are not kept.</p>
              : recent.map(e => (
                <button key={e.id} type="button" className="wbw-recent" onClick={() => loadInto(e.draft)}>
                  <span className={`method-badge method-${e.draft.method}`}>{e.draft.method}</span>
                  <span className="truncate font-mono">{e.draft.url.replace(/^https?:\/\//, '')}</span>
                  <span className={`wbw-st sm ${!e.status ? 'gray' : e.status < 400 ? 'green' : 'red'}`}>{e.status || 'ERR'}</span>
                  <span className="text-xs text-tertiary">{ago(e.at)}</span>
                </button>
              ))}
          </aside>
        )}
        <section className="card wbw-req" aria-label="Request">
          <RequestTabs draft={draft} update={update} files={files} setFiles={setFiles} mode={mode} tab={tab} setTab={setTab} />
        </section>
        <section className="card wbw-resp" aria-label="Response" aria-live="polite">
          <ResponseView res={res} sending={sending} onNotify={(m) => notify(m, 'success')} onSwitchMode={(m) => { chooseMode(m); setRes(null); }} />
        </section>
      </div>

      {dialog === 'code' && final && <CodeDialog request={final} onClose={() => setDialog(null)} onNotify={(m) => notify(m, 'success')} />}
      {dialog === 'curl' && <CurlDialog onImport={importCurl} onClose={() => setDialog(null)} />}
    </div>
  );
}
