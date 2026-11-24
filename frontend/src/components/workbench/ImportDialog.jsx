/**
 * Web Workbench (W7) — "Import": a file (drop or choose), pasted text or a URL →
 * collections, environments, a scenario or one request. The format is detected:
 * Postman collection / environment, OpenAPI / Swagger (JSON or YAML), HAR,
 * Insomnia, HitAPI collection or scenario, cURL.
 * A URL is fetched through HitAPI cloud (no CORS problems); localhost from this browser.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Zap } from 'lucide-react';
import { Dialog } from './Dialogs.jsx';
import { detectFormat, convert, harSummary, FORMAT_LABELS } from './import-convert.js';
import { send } from './send.js';
import { isLocalUrl, base64ToBytes } from './core.js';

/** Download a spec or collection: through HitAPI cloud (no CORS), or from this browser for localhost. */
async function fetchText(url) {
  const mode = isLocalUrl(url) ? 'browser' : 'cloud';
  const draft = { method: 'GET', url, params: [], headers: [{ key: 'Accept', value: 'application/json, application/yaml, text/yaml, */*', enabled: true }], bodyType: 'none', bodies: {}, auth: { type: 'none' }, settings: { timeoutSec: 15, followRedirects: true } };
  const c = new AbortController(); const t = setTimeout(() => c.abort('timeout'), 20000);
  try {
    const r = await send(draft, { mode, signal: c.signal, id: `import${Date.now()}` });
    if (r.error) throw new Error(r.error);
    if (r.status >= 400) throw new Error(`the server answered HTTP ${r.status}`);
    if (r.truncated) throw new Error('it is larger than 2 MB, the most HitAPI cloud downloads. Download it yourself and drop the file here.');
    return r.base64 ? new TextDecoder().decode(base64ToBytes(r.base64)) : r.text;
  } finally { clearTimeout(t); }
}

/**
 * @param {object} p
 * @param {{ items: Array }} p.tree
 * @param {(result, { into }) => string|null} p.onImport  returns an error message, or null when done
 * @param {() => void} p.onFromProject   "From a HitAPI project" (W3)
 */
export function ImportDialog({ tree, onImport, onFromProject, onClose }) {
  const [content, setContent] = useState(null);       // { text, fileName, sourceUrl }
  const [paste, setPaste] = useState('');
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [over, setOver] = useState(false);
  const [har, setHar] = useState({ onlyApi: true, host: '', unique: true });
  const [into, setInto] = useState(tree.items[0]?.id || '');
  const [error, setError] = useState('');
  const [fetchError, setFetchError] = useState('');
  const fileRef = useRef(null);

  // paste: analysed shortly after typing stops (only when the user typed; a file or URL isn't touched)
  const typed = useRef(false);
  useEffect(() => {
    if (!typed.current) return undefined;
    const t = setTimeout(() => { typed.current = false; setContent(paste.trim() ? { text: paste, fileName: '' } : null); }, 250);
    return () => clearTimeout(t);
  }, [paste]);

  // detect + convert once per content (not on every keystroke elsewhere in the dialog)
  const { detected, preview, problem, harSum } = useMemo(() => {
    const out = { detected: null, preview: null, problem: '', harSum: null };
    if (!content) return out;
    try { out.detected = detectFormat(content.text); } catch (e) { out.problem = e.message; return out; }
    if (out.detected.format === 'har') { try { out.harSum = harSummary(out.detected.data); } catch { /* shown by convert */ } }
    try { out.preview = convert(out.detected, { sourceUrl: content.sourceUrl, fileName: content.fileName, har }); } catch (e) { out.problem = e.message; }
    return out;
  }, [content, har]);

  const loadFile = async (f) => { if (!f) return; setError(''); setPaste(''); setContent({ text: await f.text(), fileName: f.name }); };
  const doFetch = async () => {
    const u = url.trim();
    setFetchError('');
    if (!/^https?:\/\//i.test(u)) { setFetchError('Enter a URL starting with http:// or https://'); return; }
    setFetching(true);
    try { const text = await fetchText(u); setPaste(''); setContent({ text, sourceUrl: u, fileName: u.split('?')[0].split('/').pop() }); }
    catch (e) { setFetchError(`Couldn't download it: ${e.message}`); }
    setFetching(false);
  };
  const go = () => {
    if (!preview) return;
    const e = onImport(preview, { into: detected.format === 'curl' ? into || null : null });
    if (e) setError(e); else onClose();
  };

  return (
    <Dialog wide title="Import" onClose={onClose} footer={<>
      <span className="text-xs text-tertiary">Imported items are added next to your collections; nothing is replaced.</span>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button type="button" className="btn btn-primary btn-sm wbw-import-ok" disabled={!preview} onClick={go}>Import</button>
    </>}>
      <div className="wbw-form">
        <div className={`wbw-im-drop${over ? ' over' : ''}`} role="button" tabIndex={0} aria-label="Choose a file to import"
          onClick={() => fileRef.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); loadFile(e.dataTransfer.files?.[0]); }}>
          <Upload size={18} aria-hidden="true" />
          <strong>Drop a file here or click to choose</strong>
          <span className="text-xs text-tertiary">Postman collection or environment · OpenAPI / Swagger (JSON or YAML) · HAR · Insomnia · HitAPI collection or scenario</span>
        </div>
        <input ref={fileRef} type="file" hidden accept=".json,.yaml,.yml,.har,.txt,application/json" aria-label="Import file" onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ''; }} />
        <textarea className="input font-mono wbw-im-paste" rows={5} spellCheck={false} aria-label="Paste JSON, YAML or a cURL command" placeholder="Or paste JSON / YAML / a cURL command here"
          value={paste} onChange={(e) => { typed.current = true; setPaste(e.target.value); setError(''); }} />
        <div className="wbw-im-url">
          <input className="input font-mono" aria-label="URL of a spec or collection" placeholder="https://petstore3.swagger.io/api/v3/openapi.json" spellCheck={false}
            value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doFetch(); } }} />
          <button type="button" className="btn btn-ghost btn-sm wbw-im-fetch" disabled={fetching} onClick={doFetch}>{fetching ? 'Fetching…' : 'Fetch'}</button>
        </div>
        {fetchError && <div className="wbw-err" role="alert">{fetchError}</div>}
        <div className="wbw-im-result" aria-live="polite">
          {detected && <div className="wbw-im-kind">Detected: {FORMAT_LABELS[detected.format]}{content?.fileName ? <span className="text-xs text-tertiary"> · {content.fileName}</span> : null}</div>}
          {harSum && (
            <div className="wbw-im-har text-sm">
              <div className="text-tertiary">{harSum.total} entries, {harSum.api} look like API calls.</div>
              <label className="wbw-check"><input type="checkbox" checked={har.onlyApi} aria-label="Only API calls" onChange={(e) => setHar({ ...har, onlyApi: e.target.checked })} /> Only API calls (fetch / XHR)</label>
              <label className="wbw-check"><input type="checkbox" checked={har.unique} aria-label="Skip repeats" onChange={(e) => setHar({ ...har, unique: e.target.checked })} /> Skip repeats of the same method and URL</label>
              <label className="wbw-field"><span>Host</span>
                <select className="input" aria-label="Only this host" value={har.host} onChange={(e) => setHar({ ...har, host: e.target.value })}>
                  <option value="">All hosts ({harSum.hosts.length})</option>
                  {harSum.hosts.map(x => <option key={x.host} value={x.host}>{x.host} ({x.count})</option>)}
                </select>
              </label>
            </div>
          )}
          {preview && <div className="wbw-im-summary">{preview.summary}</div>}
          {preview && detected.format === 'curl' && (
            <label className="wbw-field"><span>Add it to</span>
              <select className="input" aria-label="Add the request to" value={into} onChange={(e) => setInto(e.target.value)}>
                {tree.items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="">+ New collection "Imported requests"</option>
              </select>
            </label>
          )}
          {preview?.notes.length > 0 && <ul className="wbw-im-notes text-xs">{preview.notes.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          {problem && <div className="wbw-err" role="alert">{problem}</div>}
          {error && <div className="wbw-err" role="alert">{error}</div>}
        </div>
        <div className="wbw-row text-xs text-tertiary">
          <span>Have a HitAPI project?</span>
          <button type="button" className="btn btn-ghost btn-sm wbw-im-project" onClick={onFromProject}><Zap size={12} /> Import from a HitAPI project…</button>
        </div>
      </div>
    </Dialog>
  );
}
