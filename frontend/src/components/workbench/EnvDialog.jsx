/**
 * Web Workbench (W4) — "Environments and variables": Globals and environments
 * (Development, Staging, Production…). Edits a copy; Save writes it.
 */

import { useState } from 'react';
import { Plus, Copy, Download, Trash2 } from 'lucide-react';
import { DYNAMIC } from '@hitapi/shared/vars.js';
import { Dialog } from './Dialogs.jsx';
import { VarsTable } from './VarsTable.jsx';
import { downloadText } from './CollectionDialogs.jsx';
import { newEnvId, postmanEnv } from './env-store.js';

const fileSafe = (s) => String(s || 'environment').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'environment';

/**
 * @param {{ state: { globals, envs, active }, select?: 'globals'|'new'|string, addName?: string, onSave: (work, active) => string|null }} p
 *   addName: a variable to add (clicked on a missing {{name}}): a row for it is ready to fill in.
 */
/** The dialog's starting state: which list item is shown, the active one, and a row for addName if given. */
function initial(state, select, addName) {
  const work = structuredClone({ globals: state.globals, envs: state.envs });
  let active = state.active;
  if (select === 'new' || (!work.envs.length && select !== 'globals')) {
    work.envs.push({ id: newEnvId(), name: 'Development', vars: [] });
    if (!active) active = work.envs[work.envs.length - 1].id;
  }
  let current = 'globals';
  if (select && select !== 'new' && select !== 'globals' && work.envs.some(e => e.id === select)) current = select;
  else if (select !== 'globals') current = active || work.envs[work.envs.length - 1]?.id || 'globals';
  if (addName) {
    const rows = current === 'globals' ? work.globals : work.envs.find(e => e.id === current).vars;
    if (!rows.some(r => r.key === addName)) rows.push({ key: addName, value: '', secret: /token|secret|password|key/i.test(addName), enabled: true });
  }
  return { work, active, current };
}

export function EnvDialog({ state, select, addName, onSave, onClose }) {
  const [init] = useState(() => initial(state, select, addName));
  const [work, setWork] = useState(init.work);
  const [active, setActive] = useState(init.active);
  const [current, setCurrent] = useState(init.current);
  const [error, setError] = useState('');
  const added = addName || null;

  const env = work.envs.find(e => e.id === current);
  const patchEnv = (id, patch) => setWork((w) => ({ ...w, envs: w.envs.map(e => (e.id === id ? { ...e, ...patch } : e)) }));
  const addEnv = (name = 'New environment', vars = null) => {
    // a new environment gets the same variable names as the one shown, values empty
    const e = { id: newEnvId(), name, vars: vars || (env?.vars || []).map(r => ({ ...r, value: '' })) };
    setWork((w) => ({ ...w, envs: [...w.envs, e] }));
    setCurrent(e.id);
  };
  const del = (e) => {
    if (!confirm(`Delete the environment "${e.name}"?`)) return;
    const rest = work.envs.filter(x => x.id !== e.id);
    setWork((w) => ({ ...w, envs: rest }));
    if (active === e.id) setActive('');
    setCurrent(rest[0]?.id || 'globals');
  };
  const save = () => {
    const names = work.envs.map(e => e.name.trim().toLowerCase());
    if (work.envs.some(e => !e.name.trim())) { setError('Every environment needs a name.'); return; }
    if (new Set(names).size !== names.length) { setError('Two environments have the same name.'); return; }
    const out = { globals: work.globals, envs: work.envs.map(e => ({ ...e, name: e.name.trim().slice(0, 60) })) };
    const err = onSave(out, active);
    if (err) setError(err);
  };

  return (
    <Dialog wide title="Environments and variables" onClose={onClose} footer={<>
      <span className="text-xs text-tertiary">Kept in this browser. Secret values are hidden on screen and left out of exports.</span>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button type="button" className="btn btn-primary btn-sm wbw-env-ok" onClick={save}>Save</button>
    </>}>
      <div className="wbw-ev">
        <div className="wbw-ev-list" role="listbox" aria-label="Environments">
          <button type="button" role="option" aria-selected={current === 'globals'} className={`wbw-ev-item${current === 'globals' ? ' on' : ''}`} onClick={() => setCurrent('globals')}>
            <span>Globals</span><span className="text-xs text-tertiary">{work.globals.filter(r => r.key).length}</span>
          </button>
          <div className="wbw-ev-sep text-xs text-tertiary">Environments</div>
          {work.envs.map(e => (
            <button key={e.id} type="button" role="option" aria-selected={current === e.id} className={`wbw-ev-item${current === e.id ? ' on' : ''}`} onClick={() => setCurrent(e.id)}>
              <span className="truncate">{e.name || '(no name)'}</span>{active === e.id && <span className="wbw-ev-active text-xs">● in use</span>}
            </button>
          ))}
          <button type="button" className="btn btn-ghost btn-sm wbw-ev-add" onClick={() => addEnv()}><Plus size={12} /> New environment</button>
        </div>
        <div className="wbw-ev-editor">
          {current === 'globals' || !env ? (
            <>
              <div className="wbw-ev-title"><strong>Globals</strong><span className="wbw-grow" />
                <button type="button" className="btn btn-ghost btn-sm" title="Download as a Postman globals file (secret values left out)" onClick={() => downloadText('globals.postman_globals.json', JSON.stringify(postmanEnv('Globals', work.globals, 'globals'), null, 2))}><Download size={12} /> Export</button>
              </div>
              <p className="text-xs text-tertiary">Used by every request in every environment. An environment, folder or collection variable with the same name wins.</p>
              <VarsTable label="Global variables" rows={work.globals} onChange={(globals) => setWork((w) => ({ ...w, globals }))} />
            </>
          ) : (
            <>
              <div className="wbw-ev-title">
                <input className="input" aria-label="Environment name" maxLength={60} value={env.name} onChange={(e) => patchEnv(env.id, { name: e.target.value })} />
                {active === env.id
                  ? <button type="button" className="btn btn-ghost btn-sm wbw-ev-stop" onClick={() => setActive('')}>Stop using</button>
                  : <button type="button" className="btn btn-primary btn-sm wbw-ev-use" onClick={() => setActive(env.id)}>Use this one</button>}
                <button type="button" className="btn btn-ghost btn-sm" title="Copy this environment (secret values are not copied)" onClick={() => addEnv(`${env.name} copy`, env.vars.map(r => ({ ...r, value: r.secret ? '' : r.value })))}><Copy size={12} /> Duplicate</button>
                <button type="button" className="btn btn-ghost btn-sm wbw-ev-export" title="Download as a Postman environment (secret values left out)" onClick={() => downloadText(`${fileSafe(env.name)}.postman_environment.json`, JSON.stringify(postmanEnv(env.name, env.vars), null, 2))}><Download size={12} /> Export</button>
                <button type="button" className="btn btn-ghost btn-sm text-red wbw-ev-del" onClick={() => del(env)}><Trash2 size={12} /> Delete</button>
              </div>
              <p className="text-xs text-tertiary">Use them as {'{{name}}'} in the URL, params, headers, body and auth. Give every environment the same names (baseUrl, token…) with its own values.</p>
              <VarsTable key={env.id} label="Environment variables" rows={env.vars} onChange={(vars) => patchEnv(env.id, { vars })} />
            </>
          )}
          {added && <p className="text-xs text-amber">Fill in a value for {`{{${added}}}`}, then Save.</p>}
          {error && <div className="wbw-err" role="alert">{error}</div>}
        </div>
      </div>
      <details className="wbw-ev-dyn">
        <summary className="text-sm">Dynamic variables (a new value every time)</summary>
        <div className="wbw-ev-dyngrid">
          {Object.entries(DYNAMIC).map(([k, v]) => <div key={k} className="wbw-ev-dynrow"><code>{`{{${k}}}`}</code><span className="text-xs text-tertiary">{v.about}</span></div>)}
        </div>
      </details>
    </Dialog>
  );
}
