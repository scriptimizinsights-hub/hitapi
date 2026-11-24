/**
 * Web Workbench (W4) — a table of variables: on/off, name, value, secret.
 * Used for Globals, environments, and a collection's or folder's variables.
 * Secret values are hidden (shown while you edit them) and left out of exports.
 */

import { useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { isValidVarName, normalizeRows } from '@hitapi/shared/vars.js';

const LOOKS_SECRET = /token|secret|password|passwd|key|auth|credential/i;
const blank = () => ({ key: '', value: '', secret: false, enabled: true });

export function VarsTable({ rows, onChange, hint = null, label = 'Variables' }) {
  const list = [...normalizeRows(rows), blank()];
  const touched = useRef(new Set());   // rows whose Secret box the user set: don't guess for those
  const emit = (next) => onChange(next.filter(r => r.key.length || r.value.length));
  const set = (i, patch) => {
    const next = list.map((r, j) => (j === i ? { ...r, ...patch } : r));
    // a new name like "token" or "apiKey": mark it secret, unless the user chose
    if ('key' in patch && !touched.current.has(i) && LOOKS_SECRET.test(patch.key) && !list[i].secret) next[i].secret = true;
    emit(next);
  };
  return (
    <div className="wbw-vt" role="table" aria-label={label}>
      {hint && <p className="text-xs text-tertiary">{hint}</p>}
      <div className="wbw-vt-row wbw-vt-head text-xs text-tertiary" role="row">
        <span /><span>Variable</span><span>Value</span><span title="Secret: hidden on screen, left out of exports">Secret</span><span />
      </div>
      {list.map((r, i) => {
        const isBlank = i === list.length - 1;
        const bad = r.key && !isValidVarName(r.key.trim());
        return (
          <div key={i} className={`wbw-vt-row${r.enabled ? '' : ' off'}`} role="row">
            <input type="checkbox" checked={r.enabled} disabled={isBlank} aria-label="Use this variable" onChange={(e) => set(i, { enabled: e.target.checked })} />
            <input className={`input font-mono${bad ? ' invalid' : ''}`} placeholder="name" spellCheck={false} aria-label="Variable name" value={r.key}
              title={bad ? 'Use letters, digits, _ . or -, starting with a letter or _' : ''} onChange={(e) => set(i, { key: e.target.value })} />
            <input className="input font-mono" placeholder="value" spellCheck={false} autoComplete="off" aria-label="Variable value" value={r.value}
              type={r.secret ? 'password' : 'text'} onFocus={(e) => { if (r.secret) e.target.type = 'text'; }} onBlur={(e) => { if (r.secret) e.target.type = 'password'; }}
              onChange={(e) => set(i, { value: e.target.value })} />
            <label className="wbw-vt-secret"><input type="checkbox" checked={r.secret} aria-label="Secret" onChange={(e) => { touched.current.add(i); set(i, { secret: e.target.checked }); }} /></label>
            {isBlank ? <span /> : <button type="button" className="btn btn-ghost btn-icon" aria-label="Delete variable" title="Delete" onClick={() => emit(list.filter((_, j) => j !== i))}><Trash2 size={13} /></button>}
          </div>
        );
      })}
    </div>
  );
}
