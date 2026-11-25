/**
 * services/dailyLimit.js — D1's daily free limit, as a clear answer.
 *
 * On the Workers Free plan every D1 query fails once the account has used its
 * daily rows read / written, until 00:00 UTC. Instead of "Internal server error"
 * the API then answers 503 { code: 'DAILY_LIMIT', resetsAt } so the website can
 * say what happened and what still works. See docs/platform/usage-limits.md.
 */

import { json } from '../middleware/cors.js';

const LIMIT_RE = /daily row (read|write) limit|exceeded D1's free tier/i;

export const isDailyLimit = (message) => LIMIT_RE.test(String(message || ''));

/** The next 00:00 UTC, when Cloudflare resets the free limits. */
export function nextReset(now = Date.now()) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
}

export function limitResponse(message = '') {
  const reset = nextReset();
  const res = json({
    success: false,
    code: 'DAILY_LIMIT',
    error: 'HitAPI has reached today\'s free usage limit. Signing in, saving to your account, projects and schedules are paused until the limit resets.',
    limit: /read/i.test(message) ? 'reads' : 'writes',
    resetsAt: reset.toISOString(),
  }, 503);
  res.headers.set('Retry-After', String(Math.max(60, Math.ceil((reset.getTime() - Date.now()) / 1000))));
  return res;
}

/** A 5xx response whose body is D1's limit error → the clear answer. Other responses pass through. */
export async function checkLimit(response) {
  if (!response || response.status < 500) return response;
  try {
    const text = await response.clone().text();
    if (isDailyLimit(text)) return limitResponse(text);
  } catch { /* not readable: leave it */ }
  return response;
}

/**
 * Local development only (wrangler dev --var DEV_SIMULATE_DAILY_LIMIT:1): every D1 query fails
 * with Cloudflare's own message, to try the website's "limit reached" banner. Never set in production.
 */
export function simulateLimit(env) {
  if (env?.DEV_SIMULATE_DAILY_LIMIT !== '1' || !env.DB) return env;
  const fail = () => Promise.reject(new Error("D1_ERROR: Your account has exceeded D1's free tier daily row write limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue."));
  const stmt = { bind: () => stmt, run: fail, all: fail, first: fail, raw: fail };
  return { ...env, DB: { prepare: () => stmt, batch: fail, exec: fail } };
}
