/**
 * The "daily limit reached" banner (docs/platform/usage-limits.md): shown on every page,
 * signed in or not, when the API answered 503 DAILY_LIMIT. Says what's paused, until when,
 * what still works, and offers Upgrade. Admins also see how to lift the limit for everyone.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { DAILY_LIMIT_EVENT, currentDailyLimit } from '../../utils/dailyLimit.js';
import { useStore } from '../../store/index.js';

const CLOUDFLARE_PLANS = 'https://dash.cloudflare.com/?to=/:account/workers/plans';

function resetText(iso) {
  if (!iso) return 'the limit resets (00:00 UTC)';
  const d = new Date(iso);
  const mins = Math.max(1, Math.round((d.getTime() - Date.now()) / 60000));
  const left = mins >= 60 ? `in about ${Math.round(mins / 60)} h` : `in ${mins} min`;
  return `${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} (${left})`;
}

export function DailyLimitBanner() {
  const [info, setInfo] = useState(() => (typeof window === 'undefined' ? null : currentDailyLimit()));
  const [hidden, setHidden] = useState(false);
  const isAdmin = useStore((s) => s.isAdmin);
  let wasAdmin = false; try { wasAdmin = localStorage.getItem('hitapi:wasAdmin') === '1'; } catch { /* ignore */ }
  useEffect(() => {
    const on = (e) => { setInfo(e.detail || currentDailyLimit()); setHidden(false); };
    window.addEventListener(DAILY_LIMIT_EVENT, on);
    const t = setInterval(() => setInfo(currentDailyLimit()), 60_000);   // gone once it resets
    return () => { window.removeEventListener(DAILY_LIMIT_EVENT, on); clearInterval(t); };
  }, []);
  if (!info || hidden) return null;
  return (
    <div className="daily-limit" role="alert">
      <AlertTriangle size={16} className="daily-limit-icon" aria-hidden="true" />
      <div className="daily-limit-text">
        <strong>HitAPI has reached today's free usage limit.</strong>{' '}
        Signing in, saving to your account, projects and schedules are paused until {resetText(info.resetsAt)}.
        {' '}The API Workbench in this browser still works.
        {(isAdmin || wasAdmin) && (
          <div className="daily-limit-admin">
            Admin: this is your Cloudflare account's daily D1 limit, shared by everyone. Upgrading the account to Workers Paid ($5/month) lifts it within minutes.
            {' '}<a href={CLOUDFLARE_PLANS} target="_blank" rel="noopener noreferrer">Cloudflare plans ↗</a>
          </div>
        )}
      </div>
      <a className="btn btn-primary btn-sm daily-limit-upgrade" href="/pricing">Upgrade</a>
      <button type="button" className="btn btn-ghost btn-icon" aria-label="Hide this message" onClick={() => setHidden(true)}><X size={14} /></button>
    </div>
  );
}
