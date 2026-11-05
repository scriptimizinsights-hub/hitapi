/**
 * ui/core/dom.js — tiny DOM helpers. Elements are built with textContent,
 * never innerHTML, so captured URLs / names can't inject markup.
 *
 *   h('button', { class: 'btn-primary', onclick: fn }, 'Save')
 */

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'value') el.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected') el[key] = !!value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Replace an element's children. */
export function mount(container, ...children) {
  container.replaceChildren();
  append(container, children);
}

export function spinner() {
  return h('span', { class: 'spinner', 'aria-hidden': 'true' });
}

let toastTimer = null;
/** kind: 'ok' | 'error' | 'info' */
export function toast(message, kind = 'ok') {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), kind === 'error' ? 5000 : 2500);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    // DevTools panels may block the async clipboard API
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    return ok;
  }
}

export function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

/**
 * Disable a button and show a spinner while `work` runs. Keeps the form's
 * inputs as they are (nothing is re-rendered), then restores the button.
 */
export async function withBusy(button, work, busyLabel = null) {
  const original = [...button.childNodes];
  button.disabled = true;
  button.replaceChildren(spinner(), ...(busyLabel ? [` ${busyLabel}`] : []));
  try { return await work(); }
  finally {
    if (button.isConnected) { button.disabled = false; button.replaceChildren(...original); }
  }
}
