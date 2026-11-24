/**
 * Web Workbench (W6) — the Scenarios sidebar: each scenario with its step count
 * and the result of its last run.
 */

import { MoreHorizontal, Plus, Zap, X, Workflow } from 'lucide-react';
import { useState } from 'react';
import { reportSummary } from '@hitapi/shared/scenarios.js';
import { Menu } from './CollectionsPanel.jsx';

export function ScenariosPanel({ state, activeId, runningId, signedIn, tabs, onClose, onNew, onOpen, onRun, onRename, onDuplicate, onExportCli, onPush, onPull, onDelete, onSchedule = () => {}, onCi = () => {}, onGitHub = () => {} }) {
  const [menu, setMenu] = useState(null);
  const menuFor = (s) => [
    { label: 'Open', run: () => onOpen(s.id) },
    { label: 'Run', run: () => onRun(s.id) },
    { label: 'Schedule runs in the cloud…', run: () => onSchedule(s.id) },
    null,
    { label: 'Rename', run: () => onRename(s.id) },
    { label: 'Duplicate', run: () => onDuplicate(s.id) },
    { label: 'Export for the CLI (CI)', run: () => onExportCli(s.id) },
    { label: 'Use in CI (hitapi-cli)…', run: () => onCi(s.id) },
    { label: 'Publish to GitHub…', run: () => onGitHub(s.id) },
    { label: 'Send to HitAPI as a flow suite…', run: () => onPush(s.id) },
    null,
    { label: 'Delete', run: () => onDelete(s.id), danger: true },
  ];
  return (
    <aside className="wbw-side wbw-scenarios" aria-label="Scenarios">
      <div className="wbw-side-head">
        {tabs}
        <span className="wbw-grow" />
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Hide the sidebar" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="wbw-cl-head">
        <button type="button" className="btn btn-ghost btn-sm wbw-sc-new" onClick={onNew}><Plus size={12} /> Scenario</button>
        <span className="wbw-grow" />
        <button type="button" className="btn btn-ghost btn-sm wbw-sc-pull" onClick={onPull} title={signedIn ? 'Make a scenario from a HitAPI flow suite' : 'Make a scenario from a HitAPI flow suite (sign-in needed)'}><Zap size={12} /> From HitAPI</button>
      </div>
      <div className="wbw-sc-list" role="list">
        {!state.items.length ? (
          <div className="wbw-cl-empty text-sm text-tertiary">
            <p>A scenario runs requests one after another as a user journey: log in, create an order, check it, delete it.</p>
            <p>Steps share variables (a login step can set {'{{token}}'} for the next ones), each step's Tests decide pass/fail, and a CSV can run it once per row.</p>
            <p><button type="button" className="btn btn-primary btn-sm" onClick={onNew}><Plus size={12} /> New scenario</button></p>
          </div>
        ) : state.items.map((s) => {
          const r = s.lastReport;
          const sm = r ? reportSummary(r) : null;
          const enabled = s.steps.filter(x => x.enabled).length;
          return (
            <div key={s.id} role="listitem" className={`wbw-sc-item${s.id === activeId ? ' active' : ''}`}>
              <button type="button" className="wbw-sc-open" onClick={() => onOpen(s.id)}>
                <Workflow size={13} aria-hidden="true" />
                <span className="wbw-sc-name truncate">{s.name}</span>
                <span className="text-xs text-tertiary">{enabled} step{enabled === 1 ? '' : 's'}</span>
                {runningId === s.id ? <span className="wbw-sc-badge run">running…</span>
                  : sm ? <span className={`wbw-sc-badge ${sm.failed ? 'bad' : 'ok'}`} title={`Last run: ${new Date(r.finishedAt || r.startedAt).toLocaleString()}`}>{sm.failed ? `✗ ${sm.failed} failed` : `✓ ${sm.passed}`}</span> : null}
              </button>
              <button type="button" className="btn btn-ghost btn-icon wbw-cl-more" aria-label={`More actions for ${s.name}`}
                onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); setMenu({ x: b.left, y: b.bottom + 4, h: b.height, items: menuFor(s) }); }}><MoreHorizontal size={14} /></button>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-tertiary wbw-cl-foot">Saved in this browser only{signedIn ? '; syncing to your account is coming soon' : ''}. "Export for the CLI" makes a file the hitapi CLI can run in CI.</p>
      {menu && <Menu menu={menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}
