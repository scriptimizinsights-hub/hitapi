/**
 * workbench/views/response/response.js — the response viewer (roadmap feature 4).
 *
 *   Pretty   JSON tree / XML tree / coloured HTML source / text
 *   Raw      exactly what arrived
 *   Preview  HTML (sandboxed, no scripts), images, PDF
 *   Headers  every response header, including duplicates and Set-Cookie
 *   Cookies  Set-Cookie headers, parsed
 *   Timing   DNS, connect, TLS, waiting, download; redirects
 *   Tests    results of the request's checks (roadmap feature 8), when it has any
 */

import { h, mount, copyText, toast } from '../../../ui/core/dom.js';
import { formatBytes } from '../../../shared/http.js';
import { bodyKind, parseSetCookies, parseLinkHeader, fileNameFor, headersSize, timingPhases } from '../../../shared/response.js';
import { highlight } from '../body/code-editor.js';
import { createJsonTree } from './json-tree.js';
import { createXmlTree } from './xml-tree.js';
import { describe as describeTest, needsExpected } from '../../../shared/assert.js';

const TREE_LIMIT = 2 * 1024 * 1024;   // bigger JSON/XML: Raw only, so the page never freezes
const TAB_KEY = 'hitapi:wbResponseTab';
const TABS = [['pretty', 'Pretty'], ['raw', 'Raw'], ['preview', 'Preview'], ['headers', 'Headers'], ['cookies', 'Cookies'], ['timing', 'Timing']];

const recall = () => { try { return localStorage.getItem(TAB_KEY); } catch { return null; } };
const remember = (t) => { try { localStorage.setItem(TAB_KEY, t); } catch { /* storage blocked */ } };

function statusTone(status) {
  if (!status) return 'err';
  if (status < 300) return 'ok';
  if (status < 400) return 'warn';
  return 'err';
}

/** @param {{ onOpenUrl: (url: string) => void, onAssert?: (path: string, value: *) => void }} opts */
export function createResponse({ onOpenUrl, onAssert = null } = {}) {
  let tab = recall() || 'pretty';
  let res = null;
  let timer = null;
  let blobUrl = null;
  let wrap = false;
  let fromHistory = null;   // time of the send, when this response was opened from history
  let banner = null;        // a note above the response (e.g. "from the run of …")
  const el = h('section', { class: 'wb-response', 'aria-label': 'Response', 'aria-live': 'polite' });

  const dropBlob = () => { if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = null; } };
  const blobFor = () => { dropBlob(); blobUrl = URL.createObjectURL(new Blob([res.bytes || res.text], { type: res.contentType || 'application/octet-stream' })); return blobUrl; };
  const headerList = () => res.rawHeaders || res.headers;

  function empty() {
    clearInterval(timer);
    mount(el, h('div', { class: 'wb-empty-state' },
      h('div', { class: 'wb-empty-icon' }, '⇄'),
      h('div', {}, 'Enter a URL and press Send.'),
      h('div', { class: 'muted small' }, 'Ctrl/⌘ + Enter sends · Esc cancels · localhost and any API work, with no CORS errors.')));
  }

  function sending(startedAt) {
    clearInterval(timer);
    fromHistory = null;
    banner = null;
    el.classList.remove('from-history');
    const clock = h('span', { class: 'mono' }, '0.0 s');
    mount(el, h('div', { class: 'wb-empty-state' }, h('span', { class: 'spinner' }), h('div', {}, 'Sending… ', clock)));
    timer = setInterval(() => { clock.textContent = `${((performance.now() - startedAt) / 1000).toFixed(1)} s`; }, 100);
  }

  function historyEl() {
    if (banner) return banner;
    if (!fromHistory) return null;
    const d = new Date(fromHistory);
    return h('div', { class: 'wb-history-note small' }, `🕘 Response from history (${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}). Send to get a fresh one.`,
      res.truncated && res.text ? ' Only the first 256 KB of the body was kept.' : '');
  }
  const notKeptEl = () => h('div', { class: 'wb-empty muted' },
    res.notKept === 'space' ? 'The body was not kept in history (browser storage was full).'
      : `This ${res.notKept === 'image' ? 'image' : res.notKept === 'pdf' ? 'PDF' : 'binary'} body (${formatBytes(res.size)}) is not kept in history. Send again to see it.`);

  // ── tests (roadmap feature 8) ──
  const testCounts = () => { const t = res?.tests || []; return { passed: t.filter(x => x.pass).length, total: t.length }; };
  function testsBadge() {
    const { passed, total } = testCounts();
    if (!total) return null;
    const ok = passed === total;
    return h('button', { type: 'button', class: `wb-stat-btn wb-tests-badge ${ok ? 'ok' : 'bad'}`, title: 'See the test results', onclick: () => select('tests') },
      ok ? `✓ ${total} test${total === 1 ? '' : 's'} passed` : `✗ ${total - passed} of ${total} test${total === 1 ? '' : 's'} failed`);
  }
  function testsList() {
    return h('div', { class: 'tr-list' }, (res.tests || []).map(r => h('div', { class: `tr-item ${r.pass ? 'ok' : 'bad'}` },
      h('span', { class: 'tr-mark', 'aria-hidden': 'true' }, r.pass ? '✓' : '✗'),
      h('div', { class: 'tr-body' },
        h('div', { class: 'tr-name mono' }, describeTest(r.test)),
        h('div', { class: 'muted small' },
          needsExpected(r.test) && !(r.test.target === 'body' && r.test.op === 'schema') ? ['Expected ', h('code', {}, String(r.test.expected)), ' · '] : '',
          'Actual ', h('code', {}, r.actual || '—')),
        !r.pass && r.message ? h('div', { class: 'tr-msg small' }, r.message) : null))));
  }
  function testsPane() {
    const { passed, total } = testCounts();
    return h('div', { class: 'tr' },
      h('div', { class: `tr-sum ${passed === total ? 'ok' : 'bad'}` }, `${passed} of ${total} passed`),
      testsList(),
      h('div', { class: 'muted small' }, 'Edit the checks in the request\'s Tests tab.'));
  }

  function warningsEl() {
    return res.warnings?.length ? h('div', { class: 'wb-warn small' }, res.warnings.map(w => h('div', {}, `⚠ ${w}`))) : null;
  }

  // ── panes ──
  function codeBlock(text, mode) {
    const pre = h('pre', { class: `wb-pre mono${wrap ? '' : ' nowrap-pre'}` });
    if (text.length > TREE_LIMIT) pre.textContent = text; else highlight(pre, text, mode);
    return pre;
  }

  function prettyPane(kind) {
    if (res.redirectBlocked) return h('div', { class: 'wb-empty muted' }, 'The server answered with a redirect, and "Follow redirects" is off in Settings. Browsers do not show the redirect target in this case; turn the setting on to follow it.');
    if (res.notKept) return notKeptEl();
    if (!res.size && !res.text) return h('div', { class: 'wb-empty muted' }, '(no body)');
    if (kind === 'image' || kind === 'pdf') return previewPane(kind);
    if (kind === 'binary') return h('div', { class: 'wb-empty muted' }, `Binary body (${formatBytes(res.size)}, ${res.contentType || 'unknown type'}). Use Save to keep it as a file.`);
    if ((kind === 'json' || kind === 'xml') && res.size > TREE_LIMIT) {
      return h('div', {}, h('div', { class: 'wb-warn small' }, `This body is ${formatBytes(res.size)}, too big for the tree view; showing it as text.`), codeBlock(res.text, 'text'));
    }
    if (kind === 'json') {
      try { return createJsonTree(JSON.parse(res.text), { baseUrl: res.finalUrl, onOpenUrl, onAssert: fromHistory ? null : onAssert }).el; }
      catch { return h('div', {}, h('div', { class: 'wb-warn small' }, 'The Content-Type says JSON, but this is not valid JSON; showing it as text.'), codeBlock(res.text, 'text')); }
    }
    if (kind === 'xml') return createXmlTree(res.text)?.el || codeBlock(res.text, 'xml');
    if (kind === 'html') return codeBlock(res.text, 'xml');
    return codeBlock(res.text, 'text');
  }

  function rawPane(kind) {
    if (res.notKept) return notKeptEl();
    if (kind === 'binary' || kind === 'image' || kind === 'pdf') return h('div', { class: 'wb-empty muted' }, `Binary body (${formatBytes(res.size)}); it isn't shown as text. Use Save to keep it.`);
    const toggle = h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: wrap, onchange: (e) => { wrap = e.target.checked; draw(); } }), ' Wrap long lines');
    return h('div', { class: 'wb-rawpane' }, toggle, res.text ? h('pre', { class: `wb-pre mono${wrap ? '' : ' nowrap-pre'}` }, res.text) : h('div', { class: 'wb-empty muted' }, '(no body)'));
  }

  function previewPane(kind) {
    if (res.notKept) return notKeptEl();
    if (kind === 'image') return h('div', { class: 'wb-imgbox' }, h('img', { src: blobFor(), alt: 'Response image', class: 'wb-img',
      onload: (e) => { e.target.nextSibling.textContent = `${e.target.naturalWidth} × ${e.target.naturalHeight} px · ${formatBytes(res.size)}`; } }), h('div', { class: 'muted small' }));
    if (kind === 'pdf') return h('iframe', { class: 'wb-frame-preview', src: blobFor(), title: 'PDF preview' });
    if (kind === 'html') {
      // sandbox with no permissions: scripts, forms and popups are all off
      const base = `<base href="${String(res.finalUrl).replace(/"/g, '&quot;')}">`;
      return h('div', {}, h('div', { class: 'muted small' }, 'Scripts are turned off in this preview.'),
        h('iframe', { class: 'wb-frame-preview', sandbox: '', srcdoc: base + res.text, title: 'HTML preview', referrerpolicy: 'no-referrer' }));
    }
    return h('div', { class: 'wb-empty muted' }, 'Preview shows HTML pages, images and PDFs. This response is ', kind === 'json' ? 'JSON' : kind.toUpperCase(), '; see Pretty.');
  }

  function headersPane() {
    const list = headerList();
    const filter = h('input', { type: 'search', class: 'jt-search', placeholder: 'Filter headers', 'aria-label': 'Filter headers' });
    const body = h('tbody');
    const paint = () => {
      const q = filter.value.trim().toLowerCase();
      mount(body, list.filter(([k, v]) => !q || k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q)).map(([k, v]) => {
        let value = v;
        if (/^link$/i.test(k)) {
          value = parseLinkHeader(v, res.finalUrl).flatMap((l, i) => [i ? ', ' : '', h('a', { href: l.url, onclick: (e) => { e.preventDefault(); onOpenUrl(l.url); }, title: 'Open as a new request' }, l.url), l.rel ? ` (${l.rel})` : '']);
        } else if (/^(location|content-location)$/i.test(k)) {
          let url = v; try { url = new URL(v, res.finalUrl).toString(); } catch { /* keep */ }
          value = h('a', { href: url, onclick: (e) => { e.preventDefault(); onOpenUrl(url); }, title: 'Open as a new request' }, v);
        }
        return h('tr', {}, h('th', {}, k), h('td', {}, value));
      }));
    };
    filter.addEventListener('input', paint);
    paint();
    return h('div', { class: 'wb-hwrap' },
      h('div', { class: 'jt-bar' }, filter, h('span', { class: 'muted small' }, `${list.length} headers · ${formatBytes(headersSize(list))}`)),
      h('table', { class: 'wb-htable' }, body),
      res.rawHeaders ? null : h('div', { class: 'muted small' }, 'Duplicate headers are merged and Set-Cookie is hidden in this list (the browser did not report the raw headers).'));
  }

  function cookiesPane() {
    const set = (res.rawHeaders || []).filter(([k]) => /^set-cookie$/i.test(k)).map(([, v]) => v);
    if (!res.rawHeaders) return h('div', { class: 'wb-empty muted' }, 'Cookies could not be read for this response.');
    if (!set.length) return h('div', { class: 'wb-empty muted' }, 'This response sets no cookies.');
    const cookies = parseSetCookies(set);
    return h('div', { class: 'wb-hwrap' },
      h('table', { class: 'wb-htable wb-ctable' },
        h('thead', {}, h('tr', {}, ['Name', 'Value', 'Domain', 'Path', 'Expires', 'Flags'].map(c => h('th', {}, c)))),
        h('tbody', {}, cookies.map(c => h('tr', {},
          h('td', { class: 'mono' }, c.name), h('td', { class: 'mono' }, c.value), h('td', {}, c.domain || '(this host)'), h('td', {}, c.path || '/'),
          h('td', {}, c.maxAge ? `in ${c.maxAge} s` : c.expires || 'session'),
          h('td', {}, [c.httpOnly && 'HttpOnly', c.secure && 'Secure', c.sameSite && `SameSite=${c.sameSite}`].filter(Boolean).join(' · ')))))),
      h('div', { class: 'muted small' }, 'Cookies from the Workbench are not stored in your browser unless "Send this browser\'s cookies" is on in Settings.'));
  }

  function timingPane() {
    const t = timingPhases(res.timing);
    const total = res.ms;
    const rows = [];
    if (t?.detailed) {
      const max = Math.max(...t.phases.map(([, v]) => v), 1);
      for (const [name, v] of t.phases) {
        rows.push(h('div', { class: 'tm-row' }, h('span', { class: 'tm-name' }, name),
          h('span', { class: 'tm-bar' }, h('span', { style: { width: `${Math.max(2, (v / max) * 100)}%` } })), h('span', { class: 'tm-ms mono' }, `${v} ms`)));
      }
    }
    return h('div', { class: 'tm' },
      h('div', { class: 'tm-row tm-total' }, h('span', { class: 'tm-name' }, 'Total'), h('span', {}), h('span', { class: 'tm-ms mono' }, `${total} ms`)),
      h('div', { class: 'tm-row' }, h('span', { class: 'tm-name' }, 'Until the first byte'), h('span', {}), h('span', { class: 'tm-ms mono' }, `${res.ttfb} ms`)),
      h('div', { class: 'tm-row' }, h('span', { class: 'tm-name' }, 'Reading the body'), h('span', {}), h('span', { class: 'tm-ms mono' }, `${Math.max(0, total - res.ttfb)} ms`)),
      rows.length ? h('div', { class: 'tm-sub' }, 'Breakdown', t.protocol ? h('span', { class: 'muted' }, ` · ${t.protocol}`) : null) : null,
      rows,
      fromHistory ? h('div', { class: 'muted small' }, 'The detailed breakdown is not kept in history.')
        : !t?.detailed ? h('div', { class: 'muted small' }, 'The browser hides the detailed breakdown (DNS, connect, TLS) unless the server sends a Timing-Allow-Origin header.') : null,
      res.redirects?.length ? h('div', { class: 'tm-sub' }, `Redirects (${res.redirects.length})`) : null,
      (res.redirects || []).map(r => h('div', { class: 'tm-redirect small' }, h('span', { class: 'wb-code wb-code-warn' }, String(r.status)), h('span', { class: 'mono break' }, r.url), ' → ', h('span', { class: 'mono break' }, r.location))));
  }

  // ── frame ──
  function draw() {
    const kind = bodyKind(res.contentType, res.text);
    const list = headerList();
    const cookieCount = (res.rawHeaders || []).filter(([k]) => /^set-cookie$/i.test(k)).length;
    const status = h('div', { class: 'wb-status' },
      h('span', { class: `wb-code wb-code-${statusTone(res.status)}` }, res.redirectBlocked ? '3xx' : String(res.status), ' ', res.statusText || ''),
      h('button', { type: 'button', class: 'wb-stat-btn', title: `Time to first byte: ${res.ttfb} ms · click for the breakdown`, onclick: () => select('timing') }, `${res.ms} ms`),
      h('span', { title: `Body ${formatBytes(res.size)} + headers ${formatBytes(headersSize(list))}` }, formatBytes(res.size)),
      res.redirects?.length ? h('button', { type: 'button', class: 'wb-stat-btn', onclick: () => select('timing'), title: 'See the redirects' }, `↪ ${res.redirects.length} redirect${res.redirects.length === 1 ? '' : 's'}`) : null,
      res.redirected ? h('span', { class: 'muted ellipsis', title: res.finalUrl }, res.finalUrl) : null,
      testsBadge(),
      h('span', { class: 'grow' }),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Copy the body (or the headers on the Headers tab)', onclick: async () => {
        const text = tab === 'headers' ? list.map(([k, v]) => `${k}: ${v}`).join('\n')
          : (tab === 'pretty' && kind === 'json') ? (() => { try { return JSON.stringify(JSON.parse(res.text), null, 2); } catch { return res.text; } })() : res.text;
        toast(await copyText(text) ? 'Copied' : 'Could not copy', 'info');
      } }, 'Copy'),
      h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Save the body to a file', disabled: !res.size || !!res.notKept, onclick: () => {
        const a = h('a', { href: blobFor(), download: fileNameFor(res.finalUrl, res.contentType) });
        document.body.append(a); a.click(); a.remove();
      } }, 'Save'));
    const counts = { headers: list.length, cookies: cookieCount };
    const tc = testCounts();
    const shownTabs = tc.total ? [...TABS, ['tests', 'Tests']] : TABS;
    const current = shownTabs.some(([id]) => id === tab) ? tab : 'pretty';
    const tabs = h('div', { class: 'wb-tabs', role: 'tablist' }, shownTabs.map(([id, label]) => h('button', {
      type: 'button', role: 'tab', class: 'wb-tab', 'aria-selected': String(current === id), dataset: { tab: id }, onclick: () => select(id),
    }, label, id === 'tests' ? h('span', { class: `wb-count ${tc.passed === tc.total ? 'tr-ok' : 'tr-bad'}` }, `${tc.passed}/${tc.total}`)
      : counts[id] ? h('span', { class: 'wb-count' }, String(counts[id])) : null)));
    const pane = { pretty: () => prettyPane(kind), raw: () => rawPane(kind), preview: () => previewPane(kind), headers: headersPane, cookies: cookiesPane, timing: timingPane, tests: testsPane }[current]();
    mount(el, historyEl(), status, warningsEl(), tabs, h('div', { class: 'wb-respane' }, pane));
    el.classList.toggle('from-history', !!fromHistory);
  }

  function select(id) { tab = id; remember(id); draw(); }

  function show(r, { fromHistory: at = null, banner: note = null } = {}) {
    clearInterval(timer);
    dropBlob();
    res = r;
    fromHistory = at;
    banner = note;
    el.classList.toggle('from-history', !!at);
    if (r.error) {
      mount(el, historyEl(),
        h('div', { class: `wb-error wb-error-${r.kind}`, role: 'alert' },
          h('strong', {}, r.kind === 'timeout' ? 'Timed out' : r.kind === 'cancel' ? 'Cancelled' : r.kind === 'invalid' ? 'Can\'t send yet' : 'Request failed'),
          h('div', { class: 'wb-pre-line' }, r.error),
          r.code ? h('div', { class: 'muted small mono' }, r.code) : null,
          r.kind === 'network' ? h('div', { class: 'muted small' }, 'Check the URL and port. For localhost, make sure your server is running.') : null),
        warningsEl(),
        r.tests?.length ? h('div', { class: 'tr' }, h('div', { class: 'tr-sum bad' }, `0 of ${r.tests.length} tests passed`), testsList()) : null);
      return;
    }
    // first response of a kind with no useful Pretty view: open Preview
    const kind = bodyKind(r.contentType, r.text);
    if (!recall() && (kind === 'image' || kind === 'pdf')) tab = 'preview';
    draw();
  }

  empty();
  return { el, empty, sending, show };
}
