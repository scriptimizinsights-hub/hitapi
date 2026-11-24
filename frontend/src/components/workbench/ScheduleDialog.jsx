/**
 * Web Workbench (W9) — schedule a collection, folder or scenario to run in the cloud
 * (the browser can be closed). New, or editing an existing schedule.
 */

import { useMemo, useState } from 'react';
import { Dialog } from './Dialogs.jsx';
import { EVERY, KIND_LABEL, schedulesApi, scheduleNeeds } from './schedules-api.js';
import { loadTree } from './collections-store.js';
import { loadEnvs } from './env-store.js';
import { loadScenarios } from './scenarios-store.js';

/**
 * @param {object} p
 * @param {{ kind, id, name }} p.target          for a new schedule
 * @param {object} [p.schedule]                  an existing one (edit)
 * @param {boolean} p.syncOn                     the Workbench is kept in the account (needed)
 * @param {() => Promise<object>} p.beforeSave   save the latest changes to the account first
 * @param {(schedule) => void} p.onSaved
 */
export function ScheduleDialog({ target, schedule = null, signedIn = true, syncOn, beforeSave, onSaved, onOpenBackup, onClose }) {
  const data = useMemo(() => ({ tree: loadTree(), envs: loadEnvs(), scenarios: loadScenarios() }), []);
  const tgt = schedule ? { kind: schedule.target_kind, id: schedule.target_id, name: target?.name || schedule.name } : target;
  const [name, setName] = useState(schedule?.name || tgt.name || 'Schedule');
  const [every, setEvery] = useState(schedule?.every_min || 60);
  const [envId, setEnvId] = useState(schedule ? schedule.env_id || '' : data.envs.active || '');
  const [notify, setNotify] = useState(schedule?.notify || 'failures');
  const [email, setEmail] = useState(schedule ? schedule.notify_email : true);
  const [webhook, setWebhook] = useState(schedule?.webhook_url || '');
  const needs = useMemo(() => scheduleNeeds(tgt, data, envId), [envId]);   // eslint-disable-line react-hooks/exhaustive-deps
  const stored = new Set(schedule?.secret_names || []);
  // new schedule: this browser's values are offered; editing: blank = keep what is stored
  const [values, setValues] = useState(() => Object.fromEntries(needs.secrets.map(x => [x.key, schedule ? '' : x.value])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setBusy(true); setError('');
    try {
      await beforeSave?.();
      const body = { name: name.trim(), every_min: every, env_id: envId || null, notify, notify_email: email, webhook_url: webhook.trim() };
      const typed = Object.fromEntries(Object.entries(values).filter(([, v]) => String(v) !== ''));
      let out;
      if (schedule) {
        if (Object.keys(typed).length) body.secrets = typed;   // the server keeps the stored ones not retyped
        out = await schedulesApi.update(schedule.id, body);
      } else out = await schedulesApi.create({ ...body, target_kind: tgt.kind, target_id: tgt.id, secrets: typed });
      onSaved?.(out);
      onClose();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <Dialog wide title={schedule ? `Schedule: ${schedule.name}` : `Schedule "${tgt.name}" in the cloud`} onClose={onClose} footer={<>
      <span className="text-xs text-tertiary">Runs on HitAPI's servers, even with your browser closed. At most 10 schedules, every 5 minutes, 100 requests a run.</span>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      <button type="button" className="btn btn-primary btn-sm wbw-sch-save" disabled={busy || !syncOn || !signedIn} onClick={save}>{busy ? 'Saving…' : schedule ? 'Save' : 'Create schedule'}</button>
    </>}>
      {!signedIn ? (
        <div className="wbw-note">
          <strong>Sign in to HitAPI first.</strong>
          <div className="text-xs">Cloud schedules run on HitAPI's servers with your browser closed, and email or call a webhook when a run fails. A free account works: <a href="/login">sign in or create an account</a>. The HitAPI Chrome extension can also schedule runs while Chrome is open.</div>
        </div>
      ) : !syncOn ? (
        <div className="wbw-note">
          <strong>Keep your Workbench in your account first.</strong>
          <div className="text-xs">Cloud schedules run what is in your HitAPI account. Turn on "Keep my Workbench in my HitAPI account" in Backup and sync. <button type="button" className="wbw-link" onClick={onOpenBackup}>Open Backup and sync</button></div>
        </div>
      ) : (
        <div className="wbw-form">
          <p className="text-sm text-tertiary">{KIND_LABEL[tgt.kind]} <strong>{tgt.name}</strong> — every request in it runs in order; its Tests decide pass or fail (without tests, a status below 400).</p>
          <div className="wbw-grid">
            <label className="wbw-field"><span>Name</span><input className="input" aria-label="Schedule name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="wbw-field"><span>How often</span>
              <select className="input" aria-label="How often" value={every} onChange={(e) => setEvery(Number(e.target.value))}>{EVERY.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select>
            </label>
            <label className="wbw-field"><span>Environment</span>
              <select className="input" aria-label="Environment" value={envId} onChange={(e) => setEnvId(e.target.value)}>
                <option value="">No environment (Globals only)</option>
                {data.envs.envs.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
          </div>
          <div className="wbw-field"><span>Secret values for the cloud runs</span>
            {needs.secrets.length ? <>
              <p className="text-xs text-tertiary">These secret variables are never saved in your account copy, so the schedule keeps its own copy, encrypted. You won't see them again.{schedule ? ' Leave a box empty to keep what is stored.' : ' Filled in from this browser.'}</p>
              {needs.secrets.map(x => (
                <label key={x.key} className="wbw-sch-secret">
                  <code>{`{{${x.key}}}`}</code>
                  <input className="input font-mono" type="password" autoComplete="off" aria-label={`Value of ${x.key}`} placeholder={stored.has(x.key) ? 'stored — type to replace' : 'value'}
                    value={values[x.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [x.key]: e.target.value }))} />
                  <span className="text-xs text-tertiary">{stored.has(x.key) ? '✓ stored · ' : ''}from {x.from}</span>
                </label>
              ))}
            </> : <p className="text-xs text-tertiary">None needed: its requests use no secret variables{needs.produced.length ? ` (${needs.produced.map(n => `{{${n}}}`).join(', ')} come from a "Set vars" step)` : ''}.</p>}
            {needs.literal.length > 0 && <p className="text-xs text-amber">{needs.literal.join(', ')} {needs.literal.length === 1 ? 'has' : 'have'} a token or password typed straight into the request or collection. Those aren't saved to your account, so cloud runs send them empty: put them in a secret {'{{variable}}'} instead.</p>}
          </div>
          <div className="wbw-grid">
            <label className="wbw-field"><span>Alerts</span>
              <select className="input" aria-label="Alerts" value={notify} onChange={(e) => setNotify(e.target.value)}>
                <option value="failures">When a run fails (and when it works again)</option>
                <option value="always">After every run</option>
                <option value="never">Never</option>
              </select>
            </label>
            <label className="wbw-field"><span>Webhook (optional)</span>
              <input className="input font-mono" aria-label="Webhook URL" placeholder="https://hooks.slack.com/services/…" value={webhook} onChange={(e) => setWebhook(e.target.value)} />
            </label>
          </div>
          <label className="wbw-check"><input type="checkbox" checked={email} aria-label="Email me" onChange={(e) => setEmail(e.target.checked)} /> Email me (to your HitAPI account's address)</label>
          <p className="text-xs text-tertiary">The webhook gets Slack-compatible JSON (<code>text</code>, plus <code>status</code>, <code>passed</code>, <code>failed</code>, <code>failures</code>).</p>
          {error && <div className="wbw-err" role="alert">{error}</div>}
        </div>
      )}
    </Dialog>
  );
}
