import { useState } from 'react';
import { Trash2, Paperclip } from 'lucide-react';

const blank = () => ({ key: '', value: '', enabled: true });

/** Rows to "Name: value" lines and back (Bulk edit). */
const toLines = (rows, sep) => rows.filter(r => r.key || r.value).map(r => `${r.enabled === false ? '# ' : ''}${r.key}${sep}${r.value ?? ''}`).join('\n');
function fromLines(text, sep) {
  return text.split('\n').map(l => l.trimEnd()).filter(l => l.trim()).map((l) => {
    const off = l.startsWith('#');
    const line = off ? l.replace(/^#\s?/, '') : l;
    const i = line.indexOf(sep);
    return { key: (i >= 0 ? line.slice(0, i) : line).trim(), value: i >= 0 ? line.slice(i + sep.length).trimStart() : '', enabled: !off };
  });
}

/**
 * Key / value rows with enable checkboxes, an always-empty last row and Bulk edit.
 * files: rows can be "file" rows (multipart form): onPickFile(row, file).
 */
export function KvTable({ rows, onChange, label, keyPlaceholder = 'Key', valuePlaceholder = 'Value', suggestions = [], valueSuggestions = () => [], bulkSep = ': ', files = false, fileNameOf = () => '', onPickFile, newRow = blank, hint }) {
  const [bulk, setBulk] = useState(null);
  const list = [...rows, newRow()];
  const set = (i, patch) => {
    const next = list.map((r, j) => (j === i ? { ...r, ...patch } : r));
    onChange(next.filter((r, j) => j < next.length - 1 || r.key || r.value || r.kind === 'file'));
  };
  const remove = (i) => onChange(rows.filter((_, j) => j !== i));
  const id = label.replace(/\W+/g, '-').toLowerCase();
  return (
    <div className="wbw-kv">
      <div className="wbw-kv-bar">
        {hint ? <span className="text-xs text-tertiary">{hint}</span> : <span />}
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBulk(bulk === null ? toLines(rows, bulkSep) : null)}>{bulk === null ? 'Bulk edit' : 'Table'}</button>
      </div>
      {bulk !== null ? (
        <textarea className="input font-mono wbw-bulk" aria-label={`${label} (one per line)`} value={bulk} placeholder={`name${bulkSep}value (one per line, # to switch off)`}
          onChange={(e) => { setBulk(e.target.value); onChange(fromLines(e.target.value, bulkSep.trim() || ':')); }} />
      ) : (
        <div className="wbw-kv-rows" role="table" aria-label={label}>
          {list.map((r, i) => {
            const last = i === list.length - 1;
            return (
              <div className="wbw-kv-row" role="row" key={i}>
                <input type="checkbox" aria-label="Send this row" checked={r.enabled !== false} disabled={last} onChange={(e) => set(i, { enabled: e.target.checked })} />
                <input className="input font-mono" list={suggestions.length ? `${id}-keys` : undefined} placeholder={keyPlaceholder} aria-label={`${label} name`} value={r.key} onChange={(e) => set(i, { key: e.target.value })} />
                {files && r.kind === 'file' ? (
                  <label className="input wbw-file">
                    <Paperclip size={13} /> <span className="truncate">{fileNameOf(r) || 'Choose a file…'}</span>
                    <input type="file" hidden aria-label={`File for ${r.key || 'this field'}`} onChange={(e) => e.target.files[0] && onPickFile?.(r, e.target.files[0])} />
                  </label>
                ) : (
                  <input className="input font-mono" list={valueSuggestions(r.key).length ? `${id}-v-${i}` : undefined} placeholder={valuePlaceholder} aria-label={`${label} value`} value={r.value ?? ''} onChange={(e) => set(i, { value: e.target.value })} />
                )}
                {valueSuggestions(r.key).length > 0 && <datalist id={`${id}-v-${i}`}>{valueSuggestions(r.key).map(v => <option key={v} value={v} />)}</datalist>}
                {files && (
                  <select className="input wbw-kind" aria-label="Field type" value={r.kind || 'text'} onChange={(e) => set(i, { kind: e.target.value })}>
                    <option value="text">Text</option><option value="file">File</option>
                  </select>
                )}
                {!last ? <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove row" onClick={() => remove(i)}><Trash2 size={13} /></button> : <span className="wbw-kv-gap" />}
              </div>
            );
          })}
          {suggestions.length > 0 && <datalist id={`${id}-keys`}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>}
        </div>
      )}
    </div>
  );
}
