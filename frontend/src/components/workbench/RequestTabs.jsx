import { useState } from 'react';
import { Wand2, KeyRound, RefreshCw } from 'lucide-react';
import { KvTable } from './KvTable.jsx';
import { COMMON_HEADERS, COMMON_VALUES, hasNoBody, buildUrl, splitUrl, paramsFromUrl } from '@hitapi/shared/http.js';
import { BODY_TYPES, checkJson, formatJson, formatXml, rowId } from '@hitapi/shared/body.js';
import { AUTH_TYPES } from '@hitapi/shared/auth.js';
import { cachedToken, fetchToken, forgetToken } from './send.js';

export function Tabs({ tabs, active, onChange, label }) {
  return (
    <div className="wbw-tabs" role="tablist" aria-label={label}>
      {tabs.map(t => (
        <button key={t.id} type="button" role="tab" aria-selected={active === t.id} className={`wbw-tab${active === t.id ? ' on' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}{t.count ? <span className="wbw-count">{t.count}</span> : null}{t.dot ? <span className="wbw-dot" aria-label="set" /> : null}
        </button>
      ))}
    </div>
  );
}

const enabledCount = (rows) => rows.filter(r => r.enabled !== false && String(r.key || '').trim()).length;

// ── Params ──
function ParamsTab({ draft, update }) {
  return (
    <KvTable label="Query parameters" rows={draft.params} bulkSep="="
      hint="Query parameters stay in sync with the URL."
      onChange={(params) => { const { base, hash } = splitUrl(draft.url); update({ params, url: buildUrl(base, params, hash) }); }} />
  );
}

// ── Headers ──
function HeadersTab({ draft, update }) {
  return (
    <KvTable label="Headers" rows={draft.headers} suggestions={COMMON_HEADERS}
      valueSuggestions={(k) => COMMON_VALUES[String(k || '').trim().toLowerCase()] || []}
      hint={draft.auth.type !== 'none' ? 'The Auth tab adds its own header when you send.' : 'Content-Type is added for you from the Body tab.'}
      onChange={(headers) => update({ headers })} />
  );
}

// ── Body ──
function CodeArea({ value, onChange, label, kind, placeholder }) {
  const check = kind === 'json' && value.trim() ? checkJson(value) : null;
  return (
    <div className="wbw-code">
      <textarea className="input font-mono" spellCheck={false} aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); const t = e.target; const s = t.selectionStart; onChange(`${value.slice(0, s)}  ${value.slice(t.selectionEnd)}`); requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 2; }); } }} />
      {check && !check.ok && <div className="wbw-err" role="alert">Invalid JSON (line {check.line}, column {check.col}): {check.message}</div>}
    </div>
  );
}

function BodyTab({ draft, update, files, setFiles }) {
  const b = draft.bodies;
  const setBodies = (patch) => update({ bodies: { ...b, ...patch } });
  const type = draft.bodyType;
  const noBody = hasNoBody(draft.method);
  return (
    <div className="wbw-body">
      <div className="wbw-seg" role="radiogroup" aria-label="Body type">
        {BODY_TYPES.map(t => (
          <button key={t.id} type="button" role="radio" aria-checked={type === t.id} className={`wbw-seg-btn${type === t.id ? ' on' : ''}`} onClick={() => update({ bodyType: t.id })}>{t.label}</button>
        ))}
      </div>
      {noBody && type !== 'none' && <div className="wbw-note">{draft.method.toUpperCase()} requests don't send a body. Switch to POST, PUT or PATCH to send it.</div>}
      {(type === 'json' || type === 'xml' || type === 'text') && (
        <>
          {type !== 'text' && (
            <div className="wbw-row-end">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                try { setBodies({ [type]: type === 'json' ? formatJson(b.json) : formatXml(b.xml) }); } catch { /* invalid: leave it */ }
              }}><Wand2 size={12} /> Format</button>
            </div>
          )}
          <CodeArea kind={type} label={`${type.toUpperCase()} body`} value={b[type]} onChange={(v) => setBodies({ [type]: v })}
            placeholder={type === 'json' ? '{\n  "name": "Asha"\n}' : type === 'xml' ? '<user>\n  <name>Asha</name>\n</user>' : 'Plain text'} />
        </>
      )}
      {type === 'urlencoded' && <KvTable label="Form fields" rows={b.urlencoded} bulkSep="=" onChange={(urlencoded) => setBodies({ urlencoded })} />}
      {type === 'form' && (
        <KvTable label="Form data" rows={b.form} files newRow={() => ({ id: rowId(), key: '', value: '', kind: 'text', enabled: true })}
          fileNameOf={(r) => files.form.get(r.id)?.name || (r.fileName ? `${r.fileName} (choose again)` : '')}
          onPickFile={(r, f) => { const form = new Map(files.form); form.set(r.id, f); setFiles({ ...files, form }); setBodies({ form: b.form.map(x => (x.id === r.id ? { ...x, fileName: f.name } : x)) }); }}
          hint="Files stay in this browser tab; they are not saved."
          onChange={(form) => setBodies({ form: form.map(r => ({ id: r.id || rowId(), kind: 'text', ...r })) })} />
      )}
      {type === 'binary' && (
        <label className="wbw-drop">
          <input type="file" hidden aria-label="Binary file" onChange={(e) => { const f = e.target.files[0]; if (!f) return; setFiles({ ...files, binary: f }); setBodies({ binary: { fileName: f.name, size: f.size, type: f.type } }); }} />
          {files.binary ? <span><strong>{files.binary.name}</strong> · {files.binary.size.toLocaleString()} bytes · {files.binary.type || 'application/octet-stream'}</span>
            : b.binary.fileName ? <span>Choose <strong>{b.binary.fileName}</strong> again (files are not saved)</span> : <span>Choose a file to send as the body</span>}
        </label>
      )}
      {type === 'graphql' && (
        <div className="wbw-gql">
          <CodeArea label="GraphQL query" value={b.graphql.query} onChange={(query) => setBodies({ graphql: { ...b.graphql, query } })} placeholder={'query GetUser($id: ID!) {\n  user(id: $id) { name }\n}'} />
          <div className="text-xs text-tertiary">Variables (JSON)</div>
          <CodeArea kind="json" label="GraphQL variables" value={b.graphql.variables} onChange={(variables) => setBodies({ graphql: { ...b.graphql, variables } })} placeholder={'{ "id": "42" }'} />
        </div>
      )}
      {type === 'none' && <p className="text-sm text-tertiary">No body will be sent.</p>}
    </div>
  );
}

// ── Auth ──
function Field({ label, children }) {
  return <label className="wbw-field"><span>{label}</span>{children}</label>;
}

function AuthTab({ draft, update, mode }) {
  const a = draft.auth;
  const set = (section, patch) => update({ auth: { ...a, [section]: { ...a[section], ...patch } } });
  const [tokenState, setTokenState] = useState({ busy: false, msg: '' });
  const secret = (section, key, label, placeholder = '') => (
    <Field label={label}><input className="input font-mono" type="password" autoComplete="off" placeholder={placeholder} value={a[section][key]} onChange={(e) => set(section, { [key]: e.target.value })} /></Field>
  );
  const text = (section, key, label, placeholder = '') => (
    <Field label={label}><input className="input font-mono" autoComplete="off" placeholder={placeholder} value={a[section][key]} onChange={(e) => set(section, { [key]: e.target.value })} /></Field>
  );
  const tok = a.type === 'oauth2' ? cachedToken(a.oauth2) : null;
  return (
    <div className="wbw-auth">
      <div className="wbw-seg" role="radiogroup" aria-label="Auth type">
        {AUTH_TYPES.map(t => <button key={t.id} type="button" role="radio" aria-checked={a.type === t.id} className={`wbw-seg-btn${a.type === t.id ? ' on' : ''}`} onClick={() => update({ auth: { ...a, type: t.id } })}>{t.label}</button>)}
      </div>
      {a.type === 'none' && <p className="text-sm text-tertiary">No auth. Add your own Authorization header in Headers if you need one.</p>}
      {a.type === 'bearer' && <div className="wbw-grid">{text('bearer', 'prefix', 'Prefix', 'Bearer')}{secret('bearer', 'token', 'Token', 'eyJhbGciOi…')}</div>}
      {a.type === 'basic' && <div className="wbw-grid">{text('basic', 'username', 'Username')}{secret('basic', 'password', 'Password')}</div>}
      {a.type === 'apikey' && (
        <div className="wbw-grid">
          {text('apikey', 'key', 'Name', 'X-API-Key')}{secret('apikey', 'value', 'Value')}
          <Field label="Send in"><select className="input" value={a.apikey.in} onChange={(e) => set('apikey', { in: e.target.value })}><option value="header">Header</option><option value="query">Query parameter</option></select></Field>
        </div>
      )}
      {a.type === 'custom' && <div className="wbw-grid">{text('custom', 'name', 'Header name', 'X-Auth-Token')}{secret('custom', 'value', 'Header value')}</div>}
      {a.type === 'oauth2' && (
        <>
          <p className="text-xs text-tertiary">Client credentials grant: HitAPI gets an access token from the token URL before the request and keeps it in this tab until it expires.</p>
          <div className="wbw-grid">
            {text('oauth2', 'tokenUrl', 'Token URL', 'https://auth.example.com/oauth/token')}
            {text('oauth2', 'clientId', 'Client ID')}
            {secret('oauth2', 'clientSecret', 'Client secret')}
            {text('oauth2', 'scope', 'Scope (optional)')}
            {text('oauth2', 'audience', 'Audience (optional)')}
            <Field label="Send client credentials"><select className="input" value={a.oauth2.clientAuth} onChange={(e) => set('oauth2', { clientAuth: e.target.value })}><option value="body">In the body</option><option value="basic">As Basic auth header</option></select></Field>
          </div>
          <div className="wbw-row">
            <button type="button" className="btn btn-ghost btn-sm" disabled={tokenState.busy || mode === 'extension'} onClick={async () => {
              setTokenState({ busy: true, msg: '' });
              forgetToken(a.oauth2);
              try { const t = await fetchToken(a.oauth2, mode); setTokenState({ busy: false, msg: `Got a token${t.expires_at ? `, valid until ${new Date(t.expires_at).toLocaleTimeString()}` : ''}.` }); }
              catch (e) { setTokenState({ busy: false, msg: e.message }); }
            }}>{tok ? <RefreshCw size={12} /> : <KeyRound size={12} />} {tok ? 'Get a new token' : 'Get token'}</button>
            <span className="text-xs text-tertiary" role="status">{mode === 'extension' ? 'The extension gets the token itself.' : tokenState.msg || (tok ? 'A token is ready.' : 'Fetched automatically when you send.')}</span>
          </div>
        </>
      )}
      {a.type !== 'none' && <p className="text-xs text-tertiary">Kept in this browser only.</p>}
    </div>
  );
}

// ── Settings ──
function SettingsTab({ draft, update, mode }) {
  const s = draft.settings;
  const set = (patch) => update({ settings: { ...s, ...patch } });
  return (
    <div className="wbw-settings">
      <Field label="Timeout (seconds)"><input className="input" type="number" min="1" max="300" value={s.timeoutSec} onChange={(e) => set({ timeoutSec: Math.min(300, Math.max(1, Number(e.target.value) || 30)) })} /></Field>
      {mode === 'cloud' && <p className="text-xs text-tertiary">HitAPI cloud stops after 15 seconds.</p>}
      <label className="wbw-check"><input type="checkbox" checked={s.followRedirects} onChange={(e) => set({ followRedirects: e.target.checked })} /> Follow redirects</label>
      <label className="wbw-check"><input type="checkbox" checked={s.withCookies} disabled={mode !== 'extension'} onChange={(e) => set({ withCookies: e.target.checked })} /> Send the browser's cookies for this site {mode !== 'extension' && <span className="text-xs text-tertiary">(HitAPI extension only)</span>}</label>
    </div>
  );
}

export function RequestTabs({ draft, update, files, setFiles, mode, tab, setTab }) {
  const tabs = [
    { id: 'params', label: 'Params', count: enabledCount(draft.params) },
    { id: 'auth', label: 'Auth', dot: draft.auth.type !== 'none' },
    { id: 'headers', label: 'Headers', count: enabledCount(draft.headers) },
    { id: 'body', label: 'Body', dot: !hasNoBody(draft.method) && draft.bodyType !== 'none' && (['json', 'xml', 'text'].includes(draft.bodyType) ? !!draft.bodies[draft.bodyType].trim() : true) },
    { id: 'settings', label: 'Settings' },
  ];
  return (
    <div className="wbw-reqtabs">
      <Tabs tabs={tabs} active={tab} onChange={setTab} label="Request" />
      <div className="wbw-tabpane" role="tabpanel">
        {tab === 'params' && <ParamsTab draft={draft} update={update} />}
        {tab === 'headers' && <HeadersTab draft={draft} update={update} />}
        {tab === 'body' && <BodyTab draft={draft} update={update} files={files} setFiles={setFiles} />}
        {tab === 'auth' && <AuthTab draft={draft} update={update} mode={mode} />}
        {tab === 'settings' && <SettingsTab draft={draft} update={update} mode={mode} />}
      </div>
    </div>
  );
}

export { paramsFromUrl };
