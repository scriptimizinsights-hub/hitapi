import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, AlertTriangle } from 'lucide-react';
import { Tabs } from './RequestTabs.jsx';
import { JsonTree } from './JsonTree.jsx';
import { bodyKind, parseSetCookies, fileNameFor, headersSize, parseLinkHeader } from '@hitapi/shared/response.js';
import { formatBytes } from '@hitapi/shared/http.js';
import { formatXml } from '@hitapi/shared/body.js';
import { base64ToBytes } from './core.js';

const TAB_KEY = 'hitapi:web:responseTab';
const statusClass = (s) => (!s ? 'gray' : s < 300 ? 'green' : s < 400 ? 'blue' : s < 500 ? 'amber' : 'red');

function copy(text, notify) {
  navigator.clipboard?.writeText(text).then(() => notify?.('Copied'), () => notify?.('Copy failed'));
}

function Timing({ r }) {
  const download = Math.max(0, (r.ms || 0) - (r.ttfb || 0));
  const total = Math.max(1, r.ms || 1);
  return (
    <div className="wbw-timing">
      <table className="wbw-table"><tbody>
        <tr><th>Total</th><td>{r.ms} ms</td></tr>
        <tr><th>Waiting for the first byte</th><td>{r.ttfb} ms <span className="wbw-bar"><span style={{ width: `${(r.ttfb / total) * 100}%` }} /></span></td></tr>
        <tr><th>Downloading the body</th><td>{download} ms <span className="wbw-bar"><span style={{ width: `${(download / total) * 100}%`, background: 'var(--green)' }} /></span></td></tr>
        <tr><th>Sent from</th><td>{r.mode === 'cloud' ? 'HitAPI cloud' : r.mode === 'browser' ? 'This browser' : 'HitAPI extension'}</td></tr>
      </tbody></table>
      {r.redirects?.length > 0 && (
        <>
          <h4>Redirects</h4>
          <ol className="wbw-redirects">{r.redirects.map((x, i) => <li key={i}><span className={`wbw-st ${statusClass(x.status)}`}>{x.status}</span> <span className="font-mono">{x.url}</span> → <span className="font-mono">{x.location}</span></li>)}</ol>
        </>
      )}
      {r.mode === 'browser' && <p className="text-xs text-tertiary">Browsers don't show DNS, connection or redirect details to web pages.</p>}
    </div>
  );
}

function Preview({ r, kind, text }) {
  const url = useMemo(() => {
    if (!r.base64 || (kind !== 'image' && kind !== 'pdf')) return null;
    return URL.createObjectURL(new Blob([base64ToBytes(r.base64)], { type: r.contentType.split(';')[0] }));
  }, [r, kind]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (kind === 'image' && url) return <div className="wbw-preview-img"><img src={url} alt="Response" /></div>;
  if (kind === 'pdf' && url) return <iframe className="wbw-preview" title="PDF response" src={url} />;
  if (kind === 'html') return (
    <>
      <p className="text-xs text-tertiary">Shown with scripts switched off.</p>
      <iframe className="wbw-preview" title="HTML response" sandbox="" srcDoc={text} />
    </>
  );
  return <p className="text-sm text-tertiary">Nothing to preview for this content type. See Pretty or Raw.</p>;
}

export function ResponseView({ res, sending, onNotify, onSwitchMode }) {
  const [tab, setTab] = useState('pretty');
  useEffect(() => { try { const t = localStorage.getItem(TAB_KEY); if (t) setTab(t); } catch { /* ignore */ } }, []);
  const pick = (t) => { setTab(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* ignore */ } };
  const kind = res && !res.error ? bodyKind(res.contentType, res.text) : 'text';
  const text = res?.text || '';
  const json = useMemo(() => { if (kind !== 'json') return undefined; try { return JSON.parse(text); } catch { return undefined; } }, [kind, text]);
  const cookies = useMemo(() => (res?.headers ? parseSetCookies(res.headers.filter(([k]) => k.toLowerCase() === 'set-cookie').map(([, v]) => v)) : []), [res]);

  if (sending) return <div className="wbw-res wbw-empty"><div className="spinner" /> <span>Sending…</span></div>;
  if (!res) return (
    <div className="wbw-res wbw-empty">
      <p><strong>Enter a URL and press Send.</strong></p>
      <p className="text-sm text-tertiary">Ctrl/⌘ + Enter sends from anywhere on the page. Paste a cURL command into the URL box to fill in the whole request.</p>
    </div>
  );
  if (res.error) {
    return (
      <div className="wbw-res">
        <div className="wbw-errbox" role="alert">
          <strong>{res.kind === 'invalid' ? 'Can\'t send yet' : res.kind === 'cancel' ? 'Cancelled' : 'No response'}</strong>
          <div className="wbw-pre">{res.error}</div>
          {['cors', 'local', 'not_allowed', 'rate'].includes(res.kind) && onSwitchMode && (
            <div className="wbw-row">
              {res.kind === 'local' && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onSwitchMode('browser')}>Send from this browser</button>}
              {res.kind === 'cors' && <button type="button" className="btn btn-sm btn-ghost" onClick={() => onSwitchMode('cloud')}>Send with HitAPI cloud</button>}
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onSwitchMode('extension')}>Use the HitAPI extension</button>
            </div>
          )}
        </div>
        {res.warnings?.length > 0 && <Warnings list={res.warnings} />}
      </div>
    );
  }
  const headerCount = res.headers?.length || 0;
  const links = (res.headers || []).filter(([k]) => k.toLowerCase() === 'link').flatMap(([, v]) => parseLinkHeader(v, res.finalUrl));
  const tabs = [
    { id: 'pretty', label: 'Pretty' }, { id: 'raw', label: 'Raw' }, { id: 'preview', label: 'Preview' },
    { id: 'headers', label: 'Headers', count: headerCount }, { id: 'cookies', label: 'Cookies', count: cookies.length }, { id: 'timing', label: 'Timing' },
  ];
  const saveBody = () => {
    const blob = res.base64 ? new Blob([base64ToBytes(res.base64)], { type: res.contentType }) : new Blob([text], { type: res.contentType || 'text/plain' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileNameFor(res.finalUrl || '', res.contentType); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <div className="wbw-res">
      <div className="wbw-status">
        <span className={`wbw-st ${statusClass(res.status)}`}>{res.status || '—'} {res.statusText}</span>
        <span title="Total time">{res.ms} ms</span>
        <span title="Body size">{formatBytes(res.size)}{res.truncated ? ' (cut off)' : ''}</span>
        <span className="text-xs text-tertiary">via {res.mode === 'cloud' ? 'HitAPI cloud' : res.mode === 'browser' ? 'this browser' : 'HitAPI extension'}</span>
        <span className="wbw-grow" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(res.base64 ? res.base64 : text, onNotify)} aria-label="Copy the body"><Copy size={12} /> Copy</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={saveBody} aria-label="Save the body to a file"><Download size={12} /> Save</button>
      </div>
      {res.warnings?.length > 0 && <Warnings list={res.warnings} />}
      {res.truncated && <div className="wbw-note">The body was cut off at {res.mode === 'cloud' ? '2 MB (HitAPI cloud limit)' : '10 MB'}.</div>}
      <Tabs tabs={tabs} active={tab} onChange={pick} label="Response" />
      <div className="wbw-tabpane wbw-respane" role="tabpanel">
        {tab === 'pretty' && (json !== undefined ? <JsonTree value={json} baseUrl={res.finalUrl} onCopy={(t, what) => copy(t, () => onNotify?.(what === 'path' ? `Copied ${t}` : 'Copied the value'))} />
          : kind === 'xml' ? <pre className="wbw-pre wbw-body-text">{safe(() => formatXml(text), text)}</pre>
            : res.base64 ? <Preview r={res} kind={kind} text={text} />
              : <pre className="wbw-pre wbw-body-text">{text || <span className="text-tertiary">(empty body)</span>}</pre>)}
        {tab === 'raw' && <pre className="wbw-pre wbw-body-text">{res.base64 ? `(${formatBytes(res.size)} of binary data — Save it to a file, or see Preview)` : text || '(empty body)'}</pre>}
        {tab === 'preview' && <Preview r={res} kind={kind} text={text} />}
        {tab === 'headers' && (
          <>
            {res.headersLimited && <p className="text-xs text-tertiary">Sent from this browser: only the headers the server lets web pages read (CORS) are shown. Use HitAPI cloud or the extension to see all of them.</p>}
            <table className="wbw-table wbw-headers"><tbody>
              {(res.headers || []).map(([k, v], i) => <tr key={i}><th className="font-mono">{k}</th><td className="font-mono">{v}</td></tr>)}
            </tbody></table>
            <p className="text-xs text-tertiary">{headerCount} headers · {formatBytes(headersSize(res.headers || []))}</p>
            {links.length > 0 && <p className="text-xs">Link: {links.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noopener noreferrer nofollow" style={{ marginRight: 8 }}>{l.rel || l.url}</a>)}</p>}
          </>
        )}
        {tab === 'cookies' && (cookies.length ? (
          <table className="wbw-table"><thead><tr><th>Name</th><th>Value</th><th>Domain</th><th>Path</th><th>Expires</th><th>Flags</th></tr></thead><tbody>
            {cookies.map((c, i) => <tr key={i}><td className="font-mono">{c.name}</td><td className="font-mono">{c.value}</td><td>{c.domain || '—'}</td><td>{c.path || '—'}</td><td>{c.maxAge ? `${c.maxAge}s` : c.expires || 'Session'}</td><td>{[c.httpOnly && 'HttpOnly', c.secure && 'Secure', c.sameSite && `SameSite=${c.sameSite}`].filter(Boolean).join(' · ')}</td></tr>)}
          </tbody></table>
        ) : <p className="text-sm text-tertiary">{res.mode === 'browser' ? 'Browsers never show Set-Cookie headers to web pages. Use HitAPI cloud or the extension to see cookies.' : 'The response set no cookies.'}</p>)}
        {tab === 'timing' && <Timing r={res} />}
      </div>
    </div>
  );
}

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };

function Warnings({ list }) {
  return <div className="wbw-warn" role="status"><AlertTriangle size={13} /><div>{list.map((w, i) => <div key={i}>{w}</div>)}</div></div>;
}
