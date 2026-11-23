/**
 * workbench/views/body/body-pane.js — the Body tab (roadmap feature 2).
 *
 * A type picker, then one pane per type. Each type keeps what was typed, so
 * switching back and forth loses nothing. Content-Type is set from the type
 * unless you add your own Content-Type header.
 */

import { h, mount, toast } from '../../../ui/core/dom.js';
import { BODY_TYPES, AUTO_CONTENT_TYPE, checkJson, formatJson, minifyJson, formatXml } from '../../../shared/body.js';
import { hasNoBody, formatBytes } from '../../../shared/http.js';
import { createCodeEditor } from './code-editor.js';
import { createFormTable } from './form-table.js';
import { createKvTable } from '../kv-table.js';

function xmlProblem(text) {
  if (!text.trim()) return null;
  const doc = new DOMParser().parseFromString(text.replace(/\{\{[^}\n]*\}\}/g, 'x'), 'application/xml');
  const err = doc.querySelector('parsererror');
  if (!err) return null;
  const msg = (err.textContent || 'Not well-formed XML').split('\n').find(l => /line|error/i.test(l)) || err.textContent;
  return msg.replace(/^This page contains the following errors:/, '').replace(/Below is a rendering.*$/s, '').trim();
}

/**
 * @param {object} o
 * @param {object} o.draft
 * @param {{ binary: File|null, form: Map<string, File> }} o.files
 * @param {(patch: object) => void} o.onChange     { bodyType } or { bodies }
 * @param {(m: string) => void} o.onMethod
 * @param {() => string} o.manualContentType     the Content-Type header the user set, or ''
 */
export function createBodyPane({ draft, files, onChange, onMethod, manualContentType }) {
  const panes = {};
  const holder = h('div', { class: 'bp-holder' });
  const noBody = h('div', { class: 'wb-nobody' });
  const ctNote = h('div', { class: 'muted small bp-ct' });
  const typeBtns = {};
  const picker = h('div', { class: 'bp-types', role: 'radiogroup', 'aria-label': 'Body type' },
    BODY_TYPES.map(t => {
      typeBtns[t.id] = h('button', { type: 'button', role: 'radio', class: 'bp-type', onclick: () => select(t.id) }, t.label);
      return typeBtns[t.id];
    }));

  const setBodies = (patch) => { draft.bodies = { ...draft.bodies, ...patch }; onChange({ bodies: draft.bodies }); paintCt(); };

  /** JSON pasted somewhere: make sure it goes out as JSON with a method that can carry a body. */
  function afterJsonPaste() {
    if (hasNoBody(draft.method)) { onMethod('POST'); toast('JSON pasted: switched to POST, because GET can\'t send a body.', 'info'); }
  }

  // ── text-like panes (JSON, XML, Text) ─────────────────────────────────────
  function textPane(type) {
    const status = h('div', { class: 'bp-status small' });
    const editor = createCodeEditor({
      value: draft.bodies[type], mode: type === 'text' ? 'text' : type, label: `${type.toUpperCase()} body`,
      placeholder: type === 'json' ? 'Paste or type JSON, e.g.\n{\n  "name": "Asha",\n  "email": "asha@example.com"\n}'
        : type === 'xml' ? '<user>\n  <name>Asha</name>\n</user>' : 'Plain text body',
      onInput: (v) => { setBodies({ [type]: v }); checkSoon(); },
      onPaste: (v) => {
        if (type === 'text' && /^\s*[[{]/.test(v)) {
          try { JSON.parse(v); setBodies({ json: v }); panes.json?.editor.setValue(v); select('json'); afterJsonPaste(); toast('That was JSON, so the body type is now JSON.', 'info'); return; }
          catch { /* plain text */ }
        }
        if (type === 'json') afterJsonPaste();
      },
    });
    let timer = null;
    const checkSoon = () => { clearTimeout(timer); timer = setTimeout(paintStatus, 200); };
    function paintStatus() {
      const v = editor.value;
      if (type === 'json') {
        const c = checkJson(v);
        if (c.empty) return mount(status, h('span', { class: 'muted' }, 'Tip: {{variables}} work anywhere, even unquoted.'));
        if (c.ok) return mount(status, h('span', { class: 'text-green' }, '✓ Valid JSON'));
        return mount(status, h('span', { class: 'text-red' }, `✗ Line ${c.line}, column ${c.col}: ${c.message}`),
          h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => editor.reveal(c.pos) }, 'Go to error'));
      }
      if (type === 'xml') {
        if (!v.trim()) return mount(status);
        const p = xmlProblem(v);
        return mount(status, p ? h('span', { class: 'text-red' }, `✗ ${p}`) : h('span', { class: 'text-green' }, '✓ Well-formed XML'));
      }
      mount(status);
    }
    const tools = [];
    if (type === 'json') {
      tools.push(h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Indent with 2 spaces', onclick: () => {
        try { const f = formatJson(editor.value); editor.setValue(f); setBodies({ json: f }); paintStatus(); }
        catch { const c = checkJson(editor.value); toast(`Can't format: line ${c.line}, column ${c.col}: ${c.message}`, 'error'); if (c.pos != null) editor.reveal(c.pos); }
      } }, 'Format'));
      tools.push(h('button', { type: 'button', class: 'btn-ghost btn-sm', title: 'Remove all spaces and line breaks', onclick: () => {
        try { const f = minifyJson(editor.value); editor.setValue(f); setBodies({ json: f }); paintStatus(); }
        catch { const c = checkJson(editor.value); toast(`Can't minify: line ${c.line}, column ${c.col}: ${c.message}`, 'error'); }
      } }, 'Minify'));
    } else if (type === 'xml') {
      tools.push(h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => {
        const p = xmlProblem(editor.value);
        if (p) { toast(`Can't format: ${p}`, 'error'); return; }
        const f = formatXml(editor.value); editor.setValue(f); setBodies({ xml: f }); paintStatus();
      } }, 'Format'));
    }
    paintStatus();
    const el = h('div', { class: 'bp-pane' }, editor.el, h('div', { class: 'bp-foot' }, status, h('span', { class: 'grow' }), tools));
    return { el, editor, refresh: () => { editor.setValue(draft.bodies[type]); paintStatus(); } };
  }

  function urlencodedPane() {
    const table = createKvTable({ kind: 'params', rows: draft.bodies.urlencoded, hint: 'Sent as application/x-www-form-urlencoded (like a classic HTML form).',
      onChange: (rows) => setBodies({ urlencoded: rows }) });
    return { el: table.el, refresh: () => table.setRows(draft.bodies.urlencoded) };
  }

  function formPane() {
    const table = createFormTable({ rows: draft.bodies.form, files, onChange: (rows) => setBodies({ form: rows }) });
    return { el: table.el, refresh: () => table.setRows(draft.bodies.form) };
  }

  function binaryPane() {
    const input = h('input', { type: 'file', hidden: true, 'aria-label': 'File to send' });
    const info = h('div', { class: 'bp-file' });
    const paint = () => {
      const f = files.binary;
      const saved = draft.bodies.binary;
      mount(info,
        h('button', { type: 'button', class: 'btn-ghost', onclick: () => input.click() }, f ? 'Choose another file' : 'Choose file'),
        f ? h('span', {}, h('strong', {}, f.name), ` · ${formatBytes(f.size)} · ${f.type || 'unknown type'}`)
          : saved.fileName ? h('span', { class: 'ft-missing' }, `${saved.fileName} — pick it again (files are not saved between sessions)`)
            : h('span', { class: 'muted' }, 'No file chosen'),
        f ? h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => { files.binary = null; setBodies({ binary: { fileName: '', size: 0, type: '' } }); paint(); } }, 'Remove') : null);
    };
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (!f) return;
      files.binary = f;
      setBodies({ binary: { fileName: f.name, size: f.size, type: f.type } });
      paint();
    });
    paint();
    return { el: h('div', { class: 'bp-pane' }, info, input, h('div', { class: 'muted small' }, 'The file is sent as the whole body, with its own type as Content-Type (application/octet-stream if unknown).')), refresh: paint };
  }

  function graphqlPane() {
    const status = h('div', { class: 'bp-status small' });
    const q = createCodeEditor({ value: draft.bodies.graphql.query, mode: 'graphql', label: 'GraphQL query', minLines: 12,
      placeholder: 'query GetUser($id: ID!) {\n  user(id: $id) {\n    name\n    email\n  }\n}',
      onInput: (v) => setBodies({ graphql: { ...draft.bodies.graphql, query: v } }) });
    const vars = createCodeEditor({ value: draft.bodies.graphql.variables, mode: 'json', label: 'GraphQL variables', minLines: 6,
      placeholder: '{ "id": "42" }',
      onInput: (v) => { setBodies({ graphql: { ...draft.bodies.graphql, variables: v } }); paintStatus(); } });
    function paintStatus() {
      const c = checkJson(draft.bodies.graphql.variables);
      mount(status, c.empty ? null : c.ok ? h('span', { class: 'text-green' }, '✓ Variables are valid JSON')
        : h('span', { class: 'text-red' }, `✗ Variables, line ${c.line}, column ${c.col}: ${c.message}`));
    }
    paintStatus();
    return {
      el: h('div', { class: 'bp-pane' }, h('div', { class: 'bp-label' }, 'Query'), q.el, h('div', { class: 'bp-label' }, 'Variables (JSON)'), vars.el, status,
        h('div', { class: 'muted small' }, 'Sent as JSON: { "query", "variables", "operationName" }.')),
      refresh: () => { q.setValue(draft.bodies.graphql.query); vars.setValue(draft.bodies.graphql.variables); paintStatus(); },
    };
  }

  const FACTORY = { json: () => textPane('json'), xml: () => textPane('xml'), text: () => textPane('text'), urlencoded: urlencodedPane, form: formPane, binary: binaryPane, graphql: graphqlPane };

  function paintCt() {
    const type = draft.bodyType;
    if (type === 'none') { mount(ctNote, 'No body is sent.'); return; }
    const manual = manualContentType();
    if (manual && !(type === 'form' && /multipart\/form-data/i.test(manual) && !/boundary=/i.test(manual))) {
      mount(ctNote, 'Content-Type: ', h('code', {}, manual), ' (your header, from the Headers tab)');
    } else if (type === 'form') {
      mount(ctNote, 'Content-Type: ', h('code', {}, 'multipart/form-data; boundary=…'), ' (set by the browser)');
    } else if (type === 'binary') {
      mount(ctNote, 'Content-Type: ', h('code', {}, files.binary?.type || 'application/octet-stream'), ' (from the file)');
    } else {
      mount(ctNote, 'Content-Type: ', h('code', {}, AUTO_CONTENT_TYPE[type]), ' (automatic; add a Content-Type header to change it)');
    }
  }

  function paintNoBody() {
    const none = hasNoBody(draft.method) && draft.bodyType !== 'none';
    noBody.hidden = !none;
    if (none) {
      mount(noBody,
        h('span', {}, `Browsers can't send a body with ${draft.method.toUpperCase()}; switch the method to send this body: `),
        ['POST', 'PUT', 'PATCH'].map(m => h('button', { type: 'button', class: 'btn-ghost btn-sm', onclick: () => onMethod(m) }, `Use ${m}`)));
    }
  }

  function select(type) {
    if (draft.bodyType !== type) { draft.bodyType = type; onChange({ bodyType: type }); }
    for (const [id, b] of Object.entries(typeBtns)) b.setAttribute('aria-checked', String(id === type));
    if (type === 'none') {
      mount(holder, h('div', { class: 'wb-empty muted' }, 'This request has no body. Pick a type above to add one.'));
    } else {
      panes[type] ||= FACTORY[type]();
      holder.replaceChildren(panes[type].el);
    }
    paintCt();
    paintNoBody();
  }

  select(draft.bodyType);

  return {
    el: h('div', { class: 'bp' }, picker, noBody, holder, ctNote),
    /** Method or headers changed. */
    refresh() { paintNoBody(); paintCt(); },
    /** The whole draft was replaced (e.g. cURL import): rebuild from it. */
    reload() { for (const k of Object.keys(panes)) delete panes[k]; select(draft.bodyType); },
  };
}
