/**
 * background/auth/session.js — sign in, sign out, and expired sessions.
 */

import { api, ApiError, onUnauthorized } from '../api/client.js';
import { EVENT } from '../../shared/messages.js';
import { LOCAL, getLocal, setLocal, removeLocal } from '../storage.js';
import { publish } from '../live.js';

const listeners = { login: [], logout: [] };

/** Let other modules react, e.g. the Local Agent starts polling after login. */
export function onSessionChange(kind, fn) {
  listeners[kind].push(fn);
}

function emit(kind) {
  for (const fn of listeners[kind]) { try { fn(); } catch (e) { console.warn('[HitAPI] session listener', e); } }
}

export async function login(email, password) {
  if (!email || !password) throw new ApiError('Enter your email and password');
  const data = await api('/auth/login', { method: 'POST', body: { email, password }, auth: false });
  if (!data?.token) throw new ApiError(data?.error || 'Sign in failed');
  await setLocal({ [LOCAL.TOKEN]: data.token, [LOCAL.USER]: data.user || null });
  emit('login');
  return { user: data.user || null };
}

export async function logout() {
  await removeLocal([LOCAL.TOKEN, LOCAL.USER]);
  emit('logout');
  return { ok: true };
}

export async function getAuthState() {
  const [token, user] = await Promise.all([getLocal(LOCAL.TOKEN), getLocal(LOCAL.USER)]);
  return { signedIn: !!token, user: token ? (user || null) : null };
}

/** Wire the API client: a 401 clears the saved login and tells every open UI. */
export function registerSessionExpiry() {
  onUnauthorized(async () => {
    await removeLocal([LOCAL.TOKEN, LOCAL.USER]);
    emit('logout');
    publish(EVENT.AUTH_EXPIRED);
  });
}
