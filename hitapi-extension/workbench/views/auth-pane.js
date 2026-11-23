/**
 * workbench/views/auth-pane.js — the Auth tab (roadmap feature 3).
 * What it adds is also shown, read-only, at the top of the Headers tab.
 */

import { h, mount, toast } from '../../ui/core/dom.js';
import { call } from '../../ui/core/bridge.js';
import { MSG } from '../../shared/messages.js';
import { AUTH_TYPES, INHERIT_TYPE, authSummary, maskSecret } from '../../shared/auth.js';
import { cachedToken, fetchToken, forgetToken } from '../oauth.js';

function field(label, input, hint = null) {
  return h('label', { class: 'ap-field' }, h('span', { class: 'ap-label' }, label), input, hint ? h('span', { class: 'muted small' }, hint) : null);
}

function secretInput(value, onInput, label, placeholder = '') {
  const input = h('input', { type: 'password', class: 'mono', value, placeholder, 'aria-label': label, autocomplete: 'off', spellcheck: 'false' });
  input.addEventListener('input', () => onInput(input.value));
  const toggle = h('button', { type: 'button', class: 'btn-ghost btn-sm ap-eye', title: 'Show / hide', 'aria-label': `Show ${label}`,
    onclick: () => { input.type = input.type === 'password' ? 'text' : 'password'; toggle.textContent = input.type === 'password' ? 'Show' : 'Hide'; } }, 'Show');
  return h('div', { class: 'ap-secret' }, input, toggle);
}

function textInput(value, onInput, label, placeholder = '') {
  const input = h('input', { type: 'text', class: 'mono', value, placeholder, 'aria-label': label, spellcheck: 'false', autocomplete: 'off' });
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

const ago = (ms) => {
  if (!ms) return '';
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
};

/**
 * @param {{ draft: object, onChange: () => void, inherit?: { label?: string, describe: () => string } | null }} o
 *   inherit: offer "Inherit" (a saved request or folder inside a collection); describe() says what it gives.
 */
export function createAuthPane({ draft, onChange, inherit = null }) {
  const holder = h('div', { class: 'ap-body' });
  const summary = h('div', { class: 'ap-summary small' });
  const typeBtns = {};
  const picker = h('div', { class: 'bp-types', role: 'radiogroup', 'aria-label': 'Auth type' },
    (inherit || draft.auth.type === 'inherit' ? [{ ...INHERIT_TYPE, label: inherit?.label || INHERIT_TYPE.label }, ...AUTH_TYPES] : AUTH_TYPES)
      .map(t => (typeBtns[t.id] = h('button', { type: 'button', role: 'radio', class: 'bp-type', onclick: () => select(t.id) }, t.label))));
  let oauthToken = null;

  const set = (section, patch) => { draft.auth[section] = { ...draft.auth[section], ...patch }; onChange(); paintSummary(); };

  function paintSummary() {
    if (draft.auth.type === 'inherit') {
      mount(summary, inherit ? inherit.describe() : 'This request is not in a collection, so there is nothing to inherit: no auth is added.');
      return;
    }
    const s = authSummary(draft.auth, { oauthToken });
    if (!s) { mount(summary, draft.auth.type === 'none' ? 'No auth is added. (An Authorization header in the Headers tab is still sent.)' : ''); return; }
    mount(summary, s.where === 'query' ? 'Adds to the URL when sent: ' : 'Adds this header: ', h('code', {}, s.text),
      s.where === 'header' ? ' It replaces a header with the same name in the Headers tab.' : '');
  }

  function bearerPane() {
    const b = draft.auth.bearer;
    const list = h('div', { class: 'ap-tokens', hidden: true });
    const tokenField = secretInput(b.token, (v) => set('bearer', { token: v }), 'Bearer token', 'eyJhbGciOi…');
    const detectedBtn = h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: async () => {
      if (!list.hidden) { list.hidden = true; return; }
      let found = [];
      try { found = await call(MSG.WB_LIST_TOKENS); } catch (e) { toast(e.message, 'error'); return; }
      list.hidden = false;
      if (!found.length) {
        mount(list, h('div', { class: 'muted small' }, 'No tokens seen yet. Start capture on a site you are signed in to (HitAPI popup → ▶ Start), use the site, then come back here.'));
        return;
      }
      mount(list, found.map(t => h('button', { type: 'button', class: 'ap-token', onclick: () => {
        set('bearer', { token: t.value });
        tokenField.querySelector('input').value = t.value;
        list.hidden = true;
        toast(`Using the token seen on ${t.origin || 'a captured request'}`, 'ok');
      } }, h('span', { class: 'mono' }, maskSecret(t.value)), h('span', { class: 'muted small' }, `${t.origin || ''} · ${ago(t.at)}`))));
    } }, 'Use detected token ▾');
    return h('div', { class: 'ap-grid' },
      field('Token', tokenField),
      h('div', { class: 'ap-row' }, detectedBtn, h('span', { class: 'muted small' }, 'Tokens the extension saw while capturing (kept in memory until Chrome closes).')),
      list,
      field('Prefix', textInput(b.prefix, (v) => set('bearer', { prefix: v }), 'Token prefix', 'Bearer'), 'Usually "Bearer". Some APIs use "Token" or "JWT".'));
  }

  function basicPane() {
    const b = draft.auth.basic;
    return h('div', { class: 'ap-grid' },
      field('Username', textInput(b.username, (v) => set('basic', { username: v }), 'Username')),
      field('Password', secretInput(b.password, (v) => set('basic', { password: v }), 'Password')),
      h('div', { class: 'muted small' }, 'Sent as Authorization: Basic base64(username:password). Use HTTPS so it isn\'t readable on the network.'));
  }

  function apikeyPane() {
    const a = draft.auth.apikey;
    const where = h('select', { 'aria-label': 'Send the key in' },
      h('option', { value: 'header', selected: a.in !== 'query' }, 'Header'),
      h('option', { value: 'query', selected: a.in === 'query' }, 'Query parameter'));
    where.addEventListener('change', () => set('apikey', { in: where.value }));
    return h('div', { class: 'ap-grid' },
      field('Key name', textInput(a.key, (v) => set('apikey', { key: v }), 'API key name', 'X-API-Key')),
      field('Value', secretInput(a.value, (v) => set('apikey', { value: v }), 'API key value')),
      field('Send in', where, 'A query parameter is added when the request is sent; the URL bar stays as you typed it.'));
  }

  function customPane() {
    const c = draft.auth.custom;
    return h('div', { class: 'ap-grid' },
      field('Header name', textInput(c.name, (v) => set('custom', { name: v }), 'Header name', 'X-Auth-Token')),
      field('Value', secretInput(c.value, (v) => set('custom', { value: v }), 'Header value')),
      h('div', { class: 'muted small' }, 'For APIs that use their own auth header. Cookie and similar headers work too.'));
  }

  function oauthPane() {
    const o = draft.auth.oauth2;
    const status = h('div', { class: 'ap-status small' });
    const paintStatus = () => {
      if (!oauthToken) { mount(status, h('span', { class: 'muted' }, 'No token yet. It is fetched when you press Get token, or automatically on Send.')); return; }
      const left = oauthToken.expires_at ? Math.max(0, Math.round((oauthToken.expires_at - Date.now()) / 60000)) : null;
      mount(status, h('span', { class: 'text-green' }, '✓ Token '), h('code', {}, maskSecret(oauthToken.access_token)),
        h('span', { class: 'muted' }, left == null ? ' · no expiry given' : ` · expires in ${left} min`),
        h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: async () => { await forgetToken(draft.auth.oauth2); oauthToken = null; paintStatus(); paintSummary(); } }, 'Forget'));
    };
    const refreshCached = async () => { oauthToken = await cachedToken(draft.auth.oauth2); paintStatus(); paintSummary(); };
    const getBtn = h('button', { type: 'button', class: 'btn-primary btn-sm', onclick: async () => {
      getBtn.disabled = true; getBtn.textContent = 'Getting token…';
      try { oauthToken = await fetchToken(draft.auth.oauth2); toast('Got a new access token', 'ok'); }
      catch (e) { mount(status, h('span', { class: 'text-red' }, `✗ ${e.message}`)); getBtn.disabled = false; getBtn.textContent = 'Get token'; return; }
      getBtn.disabled = false; getBtn.textContent = 'Get token';
      paintStatus(); paintSummary();
    } }, 'Get token');
    const change = (patch) => { set('oauth2', patch); refreshCached(); };
    const clientAuth = h('select', { 'aria-label': 'Send client credentials' },
      h('option', { value: 'body', selected: o.clientAuth !== 'basic' }, 'In the request body'),
      h('option', { value: 'basic', selected: o.clientAuth === 'basic' }, 'As a Basic auth header'));
    clientAuth.addEventListener('change', () => change({ clientAuth: clientAuth.value }));
    refreshCached();
    return h('div', { class: 'ap-grid' },
      h('div', { class: 'muted small' }, 'Client credentials grant: HitAPI gets an access token from your token URL and sends it as a Bearer token. It is renewed automatically when it expires.'),
      field('Token URL', textInput(o.tokenUrl, (v) => change({ tokenUrl: v }), 'Token URL', 'https://auth.example.com/oauth/token')),
      field('Client ID', textInput(o.clientId, (v) => change({ clientId: v }), 'Client ID')),
      field('Client secret', secretInput(o.clientSecret, (v) => change({ clientSecret: v }), 'Client secret')),
      field('Scope', textInput(o.scope, (v) => change({ scope: v }), 'Scope', 'read write'), 'Optional, space-separated.'),
      field('Audience', textInput(o.audience, (v) => change({ audience: v }), 'Audience'), 'Optional (Auth0 and some others need it).'),
      field('Client credentials', clientAuth),
      h('div', { class: 'ap-row' }, getBtn, status));
  }

  const FACTORY = { bearer: bearerPane, basic: basicPane, apikey: apikeyPane, custom: customPane, oauth2: oauthPane };

  function select(type) {
    if (draft.auth.type !== type) { draft.auth.type = type; onChange(); }
    for (const [id, b] of Object.entries(typeBtns)) b.setAttribute('aria-checked', String(id === type));
    if (type === 'none' || type === 'inherit') mount(holder);
    else mount(holder, FACTORY[type]());
    paintSummary();
  }
  select(draft.auth.type);

  return { el: h('div', { class: 'ap' }, picker, holder, summary), reload: () => select(draft.auth.type), setOauthToken: (t) => { oauthToken = t; paintSummary(); } };
}
