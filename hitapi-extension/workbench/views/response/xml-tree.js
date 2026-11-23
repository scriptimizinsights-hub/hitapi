/**
 * workbench/views/response/xml-tree.js — XML (and well-formed HTML) as a
 * collapsible tree of elements. Built from text nodes, never innerHTML.
 */

import { h } from '../../../ui/core/dom.js';

const MAX_NODES = 20000;

/** @returns {{ el } | null} null when the text isn't well-formed XML */
export function createXmlTree(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) return null;
  let count = 0;

  const attrs = (elx) => [...elx.attributes].flatMap(a => [' ', h('span', { class: 'tok-attr' }, a.name), '=', h('span', { class: 'tok-str' }, `"${a.value}"`)]);

  function elementNode(elx, depth) {
    count++;
    const kids = [...elx.childNodes].filter(n => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim()) || n.nodeType === 4 || n.nodeType === 8);
    const pad = { paddingLeft: `${depth * 16 + 4}px` };
    const open = h('span', { class: 'tok-tag' }, `<${elx.nodeName}`);
    // <tag>text</tag> on one line
    if (kids.length === 0 || (kids.length === 1 && kids[0].nodeType !== 1)) {
      const inner = kids[0] ? (kids[0].nodeType === 8 ? h('span', { class: 'tok-com' }, `<!--${kids[0].textContent}-->`) : h('span', { class: 'xt-text' }, kids[0].textContent.trim())) : null;
      return h('div', { class: 'jt-row', style: pad }, h('span', { class: 'jt-toggle' }), open, attrs(elx),
        h('span', { class: 'tok-tag' }, inner ? '>' : ' />'), inner, inner ? h('span', { class: 'tok-tag' }, `</${elx.nodeName}>`) : null);
    }
    const toggle = h('span', { class: 'jt-toggle' }, '▾');
    const summary = h('span', { class: 'jt-preview', hidden: true }, ` … ${kids.length} children `);
    const row = h('div', { class: 'jt-row', style: pad, role: 'treeitem', 'aria-expanded': 'true' }, toggle, open, attrs(elx), h('span', { class: 'tok-tag' }, '>'), summary);
    const box = h('div', { class: 'jt-kids' });
    for (const k of kids) {
      if (count > MAX_NODES) { box.append(h('div', { class: 'muted small', style: pad }, '… (too many elements to show; see Raw)')); break; }
      if (k.nodeType === 1) box.append(elementNode(k, depth + 1));
      else if (k.nodeType === 8) box.append(h('div', { class: 'jt-row tok-com', style: { paddingLeft: `${(depth + 1) * 16 + 20}px` } }, `<!--${k.textContent}-->`));
      else box.append(h('div', { class: 'jt-row xt-text', style: { paddingLeft: `${(depth + 1) * 16 + 20}px` } }, k.textContent.trim()));
    }
    const close = h('div', { class: 'jt-row', style: { paddingLeft: `${depth * 16 + 20}px` } }, h('span', { class: 'tok-tag' }, `</${elx.nodeName}>`));
    row.addEventListener('click', () => {
      const shut = !box.hidden;
      box.hidden = shut; close.hidden = shut; summary.hidden = !shut;
      toggle.textContent = shut ? '▸' : '▾';
      row.setAttribute('aria-expanded', String(!shut));
    });
    return h('div', { class: 'jt-node' }, row, box, close);
  }

  const decl = /^\s*(<\?xml[^>]*\?>)/.exec(text)?.[1];
  return { el: h('div', { class: 'jt-wrap' }, h('div', { class: 'jt-scroll' }, h('div', { class: 'jt xt' },
    decl ? h('div', { class: 'jt-row tok-com' }, decl) : null, elementNode(doc.documentElement, 0)))) };
}
