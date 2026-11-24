import { useState } from 'react';
import { Wand2, KeyRound, RefreshCw, Trash2, Plus } from 'lucide-react';
import { isValidVarName } from '@hitapi/shared/vars.js';
import { TARGETS, OPS, JSON_TYPES, newTest, needsPath, needsExpected } from '@hitapi/shared/assert.js';
import { KvTable } from './KvTable.jsx';
import { COMMON_HEADERS, COMMON_VALUES, hasNoBody, buildUrl, splitUrl, paramsFromUrl } from '@hitapi/shared/http.js';
import { BODY_TYPES, checkJson, formatJson, formatXml, rowId } from '@hitapi/shared/body.js';
import { AUTH_TYPES, INHERIT_TYPE } from '@hitapi/shared/auth.js';
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
function HeadersTab({ draft, update, inherit }) {
  const own = new Set(draft.headers.filter(r => r.enabled !== false && String(r.key || '').trim()).map(r => String(r.key).trim().toLowerCase()));
  const added = inherit?.headers || [];
  return (
    <>
      <KvTable label="Headers" rows={draft.headers} suggestions={COMMON_HEADERS}
        valueSuggestions={(k) => COMMON_VALUES[String(k || '').trim().toLowerCase()] || []}
        hint={draft.auth.type !== 'none' ? 'The Auth tab adds its own header when you send.' : 'Content-Type is added for you from the Body tab.'}
        onChange={(headers) => update({ headers })} />
      {added.length > 0 && (
        <div className="wbw-inherited" aria-label="Headers from the collection">
          <div className="text-xs text-tertiary">Added from the collection and folders:</div>
          {added.map(h => {
            const over = own.has(h.key.toLowerCase());
            return (
              <div key={h.key} className={`wbw-inh-row${over ? ' over' : ''}`} title={over ? 'Your own header with this name is sent instead' : `From "${h.from}"`}>
                <span className="font-mono">{h.key}</span><span className="font-mono truncate">{h.value}</span><span className="text-xs text-tertiary">{over ? 'replaced by yours' : h.from}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
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

export function AuthTab({ draft, update, mode, inherit = null, note = 'Kept in this browser only.' }) {
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
        {(inherit || a.type === 'inherit' ? [{ ...INHERIT_TYPE, label: inherit?.label || INHERIT_TYPE.label }, ...AUTH_TYPES] : AUTH_TYPES).map(t => <button key={t.id} type="button" role="radio" aria-checked={a.type === t.id} className={`wbw-seg-btn${a.type === t.id ? ' on' : ''}`} onClick={() => update({ auth: { ...a, type: t.id } })}>{t.label}</button>)}
      </div>
      {a.type === 'inherit' && <p className="text-sm text-tertiary wbw-inh-auth" role="status">{inherit ? inherit.describe : 'This request is not in a collection, so there is nothing to inherit: no auth is added.'}</p>}
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
      {a.type !== 'none' && a.type !== 'inherit' && note && <p className="text-xs text-tertiary">{note}</p>}
    </div>
  );
}

// ── Set vars (W4): after each response, save values from it into variables ──
const FROM = [['json', 'JSON body'], ['header', 'Header'], ['status', 'Status code']];
const FROM_PLACEHOLDER = { json: '$.data.token', header: 'Location', status: '' };

function ExtractTab({ draft, update, target, results }) {
  const rules = draft.extract || [];
  const set = (i, patch) => update({ extract: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  return (
    <div className="wbw-xt">
      <p className="text-xs text-tertiary">After each response, save values from it into variables in <strong>{target}</strong>. Example: after a login request, save <code>$.token</code> into <code>token</code>, then use <code>{'{{token}}'}</code> in other requests.</p>
      {rules.map((r, i) => {
        const bad = r.name && !isValidVarName(String(r.name).trim());
        return (
          <div key={i} className={`wbw-xt-row${r.enabled === false ? ' off' : ''}`}>
            <input type="checkbox" checked={r.enabled !== false} aria-label="Use this rule" onChange={(e) => set(i, { enabled: e.target.checked })} />
            <input className={`input font-mono${bad ? ' invalid' : ''}`} placeholder="variable" spellCheck={false} aria-label="Variable to set" value={r.name || ''}
              title={bad ? 'Use letters, digits, _ . or -, starting with a letter or _' : ''} onChange={(e) => set(i, { name: e.target.value })} />
            <span className="text-tertiary" aria-hidden="true">←</span>
            <select className="input" aria-label="Take it from" value={r.from || 'json'} onChange={(e) => set(i, { from: e.target.value })}>
              {FROM.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <input className="input font-mono" placeholder={FROM_PLACEHOLDER[r.from || 'json']} spellCheck={false} aria-label="JSON path or header name" value={r.path || ''}
              style={{ visibility: r.from === 'status' ? 'hidden' : 'visible' }} onChange={(e) => set(i, { path: e.target.value })} />
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Delete rule" onClick={() => update({ extract: rules.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
          </div>
        );
      })}
      <div><button type="button" className="btn btn-ghost btn-sm wbw-xt-add" onClick={() => update({ extract: [...rules, { name: '', from: 'json', path: '', enabled: true }] })}><Plus size={12} /> Add rule</button></div>
      {results?.length > 0 && (
        <div className="wbw-xt-results text-sm" role="status" aria-label="Last response">
          {results.map((x, i) => <div key={i} className={x.ok ? 'text-green' : 'text-red'}>{x.ok ? `✓ ${x.name} set` : `✗ ${x.name} not set: ${x.reason}`}</div>)}
        </div>
      )}
    </div>
  );
}

// ── Tests (W5): checks that run on every response ──
const TEST_PATH_PLACEHOLDER = { header: 'Content-Type', json: '$.data.id', xml: '/user/name' };
const testKey = (t) => `${t.target}|${t.path}|${t.op}`;

function TestRow({ t, onChange, onDelete }) {
  const set = (patch) => {
    const next = { ...t, ...patch };
    if (!OPS[next.target].some(o => o[0] === next.op)) next.op = OPS[next.target][0][0];
    if (next.target === 'json' && next.op === 'type_is' && !JSON_TYPES.includes(next.expected)) next.expected = 'string';
    onChange(next);
  };
  const changeTarget = (target) => {
    const fresh = newTest(target);
    onChange({ ...t, target, op: fresh.op, path: needsPath(fresh) ? (t.target === target ? t.path : fresh.path) : '', expected: fresh.expected });
  };
  const schema = t.target === 'body' && t.op === 'schema';
  return (
    <div className={`wbw-ts-row${t.enabled === false ? ' off' : ''}${needsPath(t) ? '' : ' nopath'}`} data-id={t.id}>
      <input type="checkbox" checked={t.enabled !== false} aria-label="Run this check" onChange={(e) => set({ enabled: e.target.checked })} />
      <select className="input" aria-label="What to check" value={t.target} onChange={(e) => changeTarget(e.target.value)}>
        {TARGETS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
      </select>
      {needsPath(t) && <input className="input font-mono wbw-ts-path" aria-label="Path or header name" spellCheck={false} placeholder={TEST_PATH_PLACEHOLDER[t.target] || ''} value={t.path || ''}
        onChange={(e) => set({ path: e.target.value })} />}
      <div className={`wbw-ts-cond${schema ? ' schema' : ''}`}>
      <select className="input" aria-label="Check" value={t.op} onChange={(e) => set({ op: e.target.value })}>
        {OPS[t.target].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <span className="wbw-ts-exp">
        {!needsExpected(t) ? null
          : t.target === 'json' && t.op === 'type_is'
            ? <select className="input" aria-label="Expected type" value={JSON_TYPES.includes(t.expected) ? t.expected : 'string'} onChange={(e) => set({ expected: e.target.value })}>{JSON_TYPES.map(x => <option key={x} value={x}>{x}</option>)}</select>
            : schema
              ? <textarea className="input font-mono wbw-ts-schema" rows={4} spellCheck={false} aria-label="JSON Schema" placeholder={'{ "type": "object", "required": ["id"] }'} value={t.expected ?? ''} onChange={(e) => set({ expected: e.target.value })} />
              : <input className="input font-mono" aria-label="Expected value" spellCheck={false} placeholder={{ status: '200', time: '1000', header: 'json' }[t.target] || 'value'} value={t.expected ?? ''} onChange={(e) => set({ expected: e.target.value })} />}
      </span>
      </div>
      <button type="button" className="btn btn-ghost btn-icon" aria-label="Delete check" onClick={onDelete}><Trash2 size={13} /></button>
    </div>
  );
}

function TestsTab({ draft, update, onSuggest }) {
  const tests = draft.tests || [];
  const [note, setNote] = useState('');
  const setAll = (list) => update({ tests: list });
  return (
    <div className="wbw-ts">
      <p className="text-xs text-tertiary">Checks run on every response, and decide pass/fail in collection runs. You can use {'{{variables}}'} in paths and expected values.</p>
      {tests.length ? tests.map((t, i) => (
        <TestRow key={t.id || i} t={t} onChange={(n) => setAll(tests.map((x, j) => (j === i ? n : x)))} onDelete={() => setAll(tests.filter((_, j) => j !== i))} />
      )) : <p className="text-sm text-tertiary wbw-ts-empty">No checks yet. Add one, or press "Suggest checks" after a response. You can also hover a value in the JSON response and press "test".</p>}
      <div className="wbw-row">
        <button type="button" className="btn btn-ghost btn-sm wbw-ts-add" onClick={() => { setAll([...tests, newTest('status')]); setNote(''); }}><Plus size={12} /> Add check</button>
        <button type="button" className="btn btn-ghost btn-sm wbw-ts-suggest" title="Add checks for the status, time, content type and top-level JSON fields of the last response" onClick={() => {
          const list = onSuggest?.();
          if (!list) { setNote('Send the request first, then suggest checks from its response.'); return; }
          const have = new Set(tests.map(testKey));
          const fresh = list.filter(x => !have.has(testKey(x)));
          setAll([...tests, ...fresh]);
          setNote(fresh.length ? `Added ${fresh.length} check${fresh.length === 1 ? '' : 's'} from the last response. Edit or delete any you don't need.` : 'These checks are already there.');
        }}><Wand2 size={12} /> Suggest checks</button>
      </div>
      {note && <p className="text-xs text-tertiary" role="status">{note}</p>}
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

export function RequestTabs({ draft, update, files, setFiles, mode, tab, setTab, inherit = null, extract = null, onSuggestTests = null }) {
  const tabs = [
    { id: 'params', label: 'Params', count: enabledCount(draft.params) },
    { id: 'auth', label: 'Auth', dot: draft.auth.type !== 'none' && draft.auth.type !== 'inherit' },
    { id: 'headers', label: 'Headers', count: enabledCount(draft.headers) },
    { id: 'body', label: 'Body', dot: !hasNoBody(draft.method) && draft.bodyType !== 'none' && (['json', 'xml', 'text'].includes(draft.bodyType) ? !!draft.bodies[draft.bodyType].trim() : true) },
    { id: 'tests', label: 'Tests', count: (draft.tests || []).filter(t => t.enabled !== false).length },
    { id: 'extract', label: 'Set vars', count: (draft.extract || []).filter(r => r.enabled !== false && String(r.name || '').trim()).length },
    { id: 'settings', label: 'Settings' },
  ];
  return (
    <div className="wbw-reqtabs">
      <Tabs tabs={tabs} active={tab} onChange={setTab} label="Request" />
      <div className="wbw-tabpane" role="tabpanel">
        {tab === 'params' && <ParamsTab draft={draft} update={update} />}
        {tab === 'headers' && <HeadersTab draft={draft} update={update} inherit={inherit} />}
        {tab === 'body' && <BodyTab draft={draft} update={update} files={files} setFiles={setFiles} />}
        {tab === 'auth' && <AuthTab draft={draft} update={update} mode={mode} inherit={inherit?.auth || null} />}
        {tab === 'tests' && <TestsTab draft={draft} update={update} onSuggest={onSuggestTests} />}
        {tab === 'extract' && <ExtractTab draft={draft} update={update} target={extract?.target || 'Globals'} results={extract?.results} />}
        {tab === 'settings' && <SettingsTab draft={draft} update={update} mode={mode} />}
      </div>
    </div>
  );
}

export { paramsFromUrl };
