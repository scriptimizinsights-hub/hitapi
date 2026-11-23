import { Globe2, Monitor, Puzzle } from 'lucide-react';
import { MODES } from './core.js';
import { STORE_URL } from './bridge.js';

const ICONS = { cloud: Globe2, browser: Monitor, extension: Puzzle };

/** Where the request is sent from: HitAPI cloud / this browser / the HitAPI extension. */
export function ModePicker({ mode, setMode, ext, onConnect, connecting, auto }) {
  const hint = MODES.find(m => m.id === mode)?.hint;
  return (
    <div className="wbw-modes">
      <span className="text-xs text-tertiary">Send from:</span>
      <div className="wbw-seg" role="radiogroup" aria-label="Send from">
        {MODES.map(m => {
          const Icon = ICONS[m.id];
          return (
            <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className={`wbw-seg-btn${mode === m.id ? ' on' : ''}`} onClick={() => setMode(m.id)} title={m.hint}>
              <Icon size={12} /> {m.label}
            </button>
          );
        })}
      </div>
      {auto && <span className="text-xs text-tertiary">(picked for this URL)</span>}
      <span className="wbw-modehint text-xs text-tertiary">
        {mode === 'extension' && !ext.installed && <>The HitAPI Chrome extension isn't installed. <a href={STORE_URL} target="_blank" rel="noopener noreferrer">Install it free</a>, then reload this page.</>}
        {mode === 'extension' && ext.installed && ext.outdated && <>Your HitAPI extension ({ext.version}) is too old for this. Update it from chrome://extensions, then reload.</>}
        {mode === 'extension' && ext.installed && !ext.outdated && !ext.allowed && <>
          The extension needs your OK once. <button type="button" className="btn btn-primary btn-sm" disabled={connecting} onClick={onConnect}>{connecting ? 'Waiting for your answer in the extension…' : 'Connect the extension'}</button>
        </>}
        {(mode !== 'extension' || (ext.installed && ext.allowed && !ext.outdated)) && hint}
      </span>
    </div>
  );
}
