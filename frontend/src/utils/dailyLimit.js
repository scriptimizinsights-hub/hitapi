/**
 * utils/dailyLimit.js — HitAPI reached D1's daily free limit (API answers 503 { code: 'DAILY_LIMIT', resetsAt }).
 * Every API caller reports it here; <DailyLimitBanner /> shows it on every page, signed in or not.
 * See docs/platform/usage-limits.md.
 */

const KEY = 'hitapi:dailyLimit';
export const DAILY_LIMIT_EVENT = 'hitapi:daily-limit';

export function reportDailyLimit(data = {}) {
  const info = { resetsAt: data.resetsAt || null, limit: data.limit || 'writes', at: Date.now() };
  try { sessionStorage.setItem(KEY, JSON.stringify(info)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(DAILY_LIMIT_EVENT, { detail: info })); } catch { /* not in a browser */ }
  return info;
}

/** The limit reported in this tab that hasn't reset yet, or null. */
export function currentDailyLimit() {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (v?.resetsAt && Date.parse(v.resetsAt) <= Date.now()) { sessionStorage.removeItem(KEY); return null; }
    return v;
  } catch { return null; }
}

/** A fetch Response + its parsed body: was it the daily limit? (reports it) */
export function isDailyLimitResponse(res, data) {
  if (res?.status === 503 && data?.code === 'DAILY_LIMIT') { reportDailyLimit(data); return true; }
  return false;
}

/** The user in a HitAPI login token (id, email, name), to stay signed in while the API can't answer. */
export function userFromToken(token) {
  try {
    const p = JSON.parse(atob(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (p.exp && p.exp * 1000 < Date.now()) return null;
    return p.sub ? { id: p.sub, email: p.email || '', name: p.name || '' } : null;
  } catch { return null; }
}
