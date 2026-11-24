/**
 * Web Workbench (W10) — the Flow settings dialog (flow-prefs.js).
 */

import { Dialog } from './Dialogs.jsx';

const OPEN = [
  ['page', 'On their own page', 'The whole window, at its own address (you can bookmark it). ← Workbench brings you back.'],
  ['tab', 'In a new browser tab', 'The Workbench stays open in this tab.'],
  ['inline', 'Inside the Workbench', 'In the box below the toolbar, as before.'],
];

export function FlowSettingsDialog({ prefs, onChange, onClose }) {
  const set = (patch) => onChange({ ...prefs, ...patch });
  return (
    <Dialog title="Flow settings" onClose={onClose} footer={<><span className="wbw-grow" /><button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Done</button></>}>
      <div className="wbw-form wbw-fset">
        <fieldset>
          <legend className="text-xs text-tertiary">Open flows</legend>
          {OPEN.map(([v, label, hint]) => (
            <label key={v} className="wbw-fset-opt">
              <input type="radio" name="wbw-fset-open" value={v} checked={prefs.open === v} onChange={() => set({ open: v })} />
              <span><strong>{label}</strong>{v === 'page' && <span className="text-tertiary"> (default)</span>}<br /><span className="text-xs text-tertiary">{hint}</span></span>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend className="text-xs text-tertiary">Canvas</legend>
          <label className="wbw-check"><input type="checkbox" checked={prefs.snap} onChange={(e) => set({ snap: e.target.checked })} /> Snap cards to the grid</label>
          <label className="wbw-check"><input type="checkbox" checked={prefs.labels} onChange={(e) => set({ labels: e.target.checked })} /> Show what each line passes on</label>
          <label className="wbw-check"><input type="checkbox" checked={prefs.minimap} onChange={(e) => set({ minimap: e.target.checked })} /> Show the mini-map</label>
          <label className="wbw-fset-row">Cards per row when arranging
            <select className="input" aria-label="Cards per row when arranging" value={prefs.perRow} onChange={(e) => set({ perRow: Number(e.target.value) })}>
              <option value={0}>As many as fit</option>
              {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="wbw-fset-row">A flow without a saved view opens as
            <select className="input" aria-label="Default view" value={prefs.defaultView} onChange={(e) => set({ defaultView: e.target.value })}>
              <option value="canvas">Canvas</option><option value="list">List</option>
            </select>
          </label>
        </fieldset>
        <p className="text-xs text-tertiary">Saved in this browser, for every flow.</p>
      </div>
    </Dialog>
  );
}
