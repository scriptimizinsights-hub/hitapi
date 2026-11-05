/**
 * background/api/client.js — the only place that talks to the HitAPI backend.
 *
 * Always throws an ApiError when something goes wrong, so callers (and the
 * popup, through the message router) can never mistake a failure for success.
 */

import { API_BASE } from '../../shared/config.js';
import { ERR } from '../../shared/messages.js';
import { LOCAL, getLocal } from '../storage.js';

export class ApiError extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let unauthorizedHandler = null;

/** Called once when the backend says the saved login is no longer valid. */
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
}

/**
 * @param {string} path      e.g. '/projects'
 * @param {object} options   { method, body, auth = true, token }
 * @returns the response's `data` field (or the whole JSON if there is none)
 */
export async function api(path, { method = 'GET', body, auth = true, token } = {}) {
  const bearer = auth ? (token ?? await getLocal(LOCAL.TOKEN)) : null;
  if (auth && !bearer) {
    throw new ApiError('Please sign in to HitAPI first', { status: 401, code: ERR.NOT_LOGGED_IN });
  }

  const headers = { 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach HitAPI. Check your internet connection.", { code: ERR.NETWORK });
  }

  const json = await res.json().catch(() => ({}));

  if (res.status === 401 && auth) {
    await unauthorizedHandler?.();
    throw new ApiError('Your session has expired. Please sign in again.', { status: 401, code: ERR.AUTH_EXPIRED });
  }
  if (!res.ok || json?.success === false) {
    throw new ApiError(json?.error || json?.message || `HitAPI returned HTTP ${res.status}`, { status: res.status });
  }
  return json?.data !== undefined ? json.data : json;
}
