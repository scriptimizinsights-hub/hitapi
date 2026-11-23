/**
 * workbench/views/body/code-editor.js — a small code editor: line numbers,
 * syntax highlighting (JSON, XML, GraphQL), Tab inserts spaces, Enter keeps
 * the indent. A transparent <textarea> sits over a highlighted <pre>, so
 * typing, selection, undo and paste are the browser's own.
 * Highlighting is built from text nodes (never innerHTML).
 */

import { h } from '../../../ui/core/dom.js';

const MAX_HIGHLIGHT = 150_000; // larger bodies are shown without colours, to stay fast

const RULES = {
  json: /("(?:\\.|[^"\\\n])*")(\s*:)?|(\{\{[^}\n]*\}\})|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|\b(true|false|null)\b/g,
  xml: /(<!--[\s\S]*?-->)|(<\/?[\w:.-]+)|([\w:.-]+)(=)("[^"]*"|'[^']*')|(\/?>)|(\{\{[^}\n]*\}\})/g,
  graphql: /(#[^\n]*)|("(?:\\.|[^"\\\n])*")|(\{\{[^}\n]*\}\})|\b(query|mutation|subscription|fragment|on|true|false|null)\b|(\$\w+)|(-?\b\d+(?:\.\d+)?\b)/g,
};

function classify(mode, m) {
  if (mode === 'json') {
    if (m[1]) return m[2] ? [['tok-key', m[1]], [null, m[2]]] : [['tok-str', m[1]]];
    if (m[3]) return [['tok-var', m[3]]];
    if (m[4]) return [['tok-num', m[4]]];
    if (m[5]) return [['tok-lit', m[5]]];
  } else if (mode === 'xml') {
    if (m[1]) return [['tok-com', m[1]]];
    if (m[2]) return [['tok-tag', m[2]]];
    if (m[3]) return [['tok-attr', m[3]], [null, m[4]], ['tok-str', m[5]]];
    if (m[6]) return [['tok-tag', m[6]]];
    if (m[7]) return [['tok-var', m[7]]];
  } else if (mode === 'graphql') {
    if (m[1]) return [['tok-com', m[1]]];
    if (m[2]) return [['tok-str', m[2]]];
    if (m[3]) return [['tok-var', m[3]]];
    if (m[4]) return [['tok-key', m[4]]];
    if (m[5]) return [['tok-lit', m[5]]];
    if (m[6]) return [['tok-num', m[6]]];
  }
  return [[null, m[0]]];
}

/** Fill `target` with `text`, coloured for `mode` (also used read-only by the response viewer). */
export function highlight(target, text, mode) {
  const frag = document.createDocumentFragment();
  const rule = RULES[mode];
  if (!rule || text.length > MAX_HIGHLIGHT) {
    frag.append(text);
  } else {
    rule.lastIndex = 0;
    let last = 0;
    let m;
    while ((m = rule.exec(text))) {
      if (m[0] === '') { rule.lastIndex++; continue; }
      if (m.index > last) frag.append(text.slice(last, m.index));
      for (const [cls, part] of classify(mode, m)) {
        if (!part) continue;
        frag.append(cls ? h('span', { class: cls }, part) : part);
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.append(text.slice(last));
    // {{variables}} inside JSON strings stay readable
  }
  frag.append('\n'); // keeps the last empty line the same height as the textarea's
  target.replaceChildren(frag);
}

/**
 * @param {object} o
 * @param {string} o.value
 * @param {'json'|'xml'|'graphql'|'text'} o.mode
 * @param {(value: string) => void} o.onInput
 * @param {(value: string) => void} [o.onPaste]   called after a paste with the new value
 * @param {string} [o.placeholder]
 * @param {string} [o.label]
 * @param {number} [o.minLines]
 */
const LINE_PX = 19;      // keep in step with --ce-lh in workbench.css
const PAD_PX = 10;
const MAX_VH = 0.65;     // grows with the content up to about two thirds of the window, then scrolls

export function createCodeEditor({ value = '', mode = 'text', onInput, onPaste, placeholder = '', label = 'Editor', minLines = 16 }) {
  // the numbers sit in an absolutely positioned inner box, so a long text never makes the column taller than the editor
  const gutterInner = h('div', { class: 'ce-gutter-inner' });
  const gutter = h('div', { class: 'ce-gutter', 'aria-hidden': 'true' }, gutterInner);
  const pre = h('pre', { class: 'ce-hl mono', 'aria-hidden': 'true' });
  const area = h('textarea', { class: 'ce-input mono', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off',
    wrap: 'off', 'aria-label': label, placeholder });
  area.value = value;
  const wrap = h('div', { class: 'ce-wrap' }, pre, area);
  const el = h('div', { class: 'ce' }, gutter, wrap);
  // (custom properties can't be set through style.x =, so the sizes are set directly)
  const minPx = minLines * LINE_PX + 2 * PAD_PX;
  area.style.minHeight = `${minPx}px`;
  let lines = 0;
  let userSized = false;   // after a manual drag of the resize handle, stop auto-growing
  area.addEventListener('mousedown', (e) => {
    const r = area.getBoundingClientRect();
    if (e.clientX > r.right - 18 && e.clientY > r.bottom - 18) userSized = true;
  });

  function fit() {
    if (userSized) return;
    const content = lines * LINE_PX + 2 * PAD_PX + 14; // + room for a horizontal scrollbar
    const max = Math.max(minPx, Math.round(window.innerHeight * MAX_VH));
    area.style.height = `${Math.min(Math.max(minPx, content), max)}px`;
  }

  function paint() {
    highlight(pre, area.value, mode);
    const n = area.value.split('\n').length;
    if (n !== lines) {
      lines = n;
      const frag = document.createDocumentFragment();
      for (let i = 1; i <= Math.max(n, 1); i++) frag.append(h('div', {}, String(i)));
      gutterInner.replaceChildren(frag);
      gutter.style.width = `${Math.max(40, String(n).length * 8 + 20)}px`;
      fit();
    }
    sync();
  }
  function sync() {
    pre.style.transform = `translate(${-area.scrollLeft}px, ${-area.scrollTop}px)`;
    gutterInner.style.transform = `translateY(${-area.scrollTop}px)`;
  }

  area.addEventListener('input', () => { paint(); onInput?.(area.value); });
  area.addEventListener('scroll', sync);
  area.addEventListener('paste', () => setTimeout(() => onPaste?.(area.value), 0));
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');   // keeps undo working
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      const before = area.value.slice(0, area.selectionStart);
      const indent = /[^\n]*$/.exec(before)[0].match(/^\s*/)[0];
      const opener = /[{[(]\s*$/.test(before) || (mode === 'xml' && /<[^/!?][^>]*[^/]>\s*$/.test(before));
      e.preventDefault();
      document.execCommand('insertText', false, `\n${indent}${opener ? '  ' : ''}`);
    }
  });

  paint();
  return {
    el,
    get value() { return area.value; },
    setValue(v) { if (area.value !== v) { area.value = v; paint(); } },
    setMode(m) { mode = m; paint(); },
    focus: () => area.focus(),
    /** Put the cursor at a character position and scroll to it. */
    reveal(pos) {
      area.focus();
      area.setSelectionRange(pos, pos);
      const line = area.value.slice(0, pos).split('\n').length;
      const lh = parseFloat(getComputedStyle(area).lineHeight) || 19;
      area.scrollTop = Math.max(0, (line - 3) * lh);
      sync();
    },
  };
}
