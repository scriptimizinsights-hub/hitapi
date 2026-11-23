/**
 * shared/convert/codegen.js — a request as code (roadmap feature 10):
 * cURL, JavaScript fetch, Node.js (axios), Python (requests), Go (net/http), PHP (cURL).
 *
 *   req = { method, url, headers: [[name, value]], body: string|null,
 *           form: [{ key, value, file }]|null }   (form = multipart form-data)
 */

import { toCurl } from '../curl.js';

export const LANGUAGES = [
  { id: 'curl', label: 'cURL' },
  { id: 'fetch', label: 'JavaScript (fetch)' },
  { id: 'axios', label: 'Node.js (axios)' },
  { id: 'python', label: 'Python (requests)' },
  { id: 'go', label: 'Go (net/http)' },
  { id: 'php', label: 'PHP (cURL)' },
];

const js = (s) => JSON.stringify(String(s));
const py = (s) => JSON.stringify(String(s));   // JSON strings are valid Python strings
const goStr = (s) => (/[`]/.test(s) || /\r/.test(s) ? JSON.stringify(String(s)) : `\`${s}\``);
const php = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const isJson = (req) => { const ct = req.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1] || ''; if (!/json/.test(ct) || !req.body) return null; try { return JSON.parse(req.body); } catch { return null; } };
const pyLiteral = (v, ind = '') => {
  if (v === null) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (Array.isArray(v)) return v.length ? `[\n${v.map(x => `${ind}    ${pyLiteral(x, `${ind}    `)}`).join(',\n')}\n${ind}]` : '[]';
  if (typeof v === 'object') { const e = Object.entries(v); return e.length ? `{\n${e.map(([k, x]) => `${ind}    ${py(k)}: ${pyLiteral(x, `${ind}    `)}`).join(',\n')}\n${ind}}` : '{}'; }
  return typeof v === 'string' ? py(v) : String(v);
};

export function generate(lang, req) {
  const m = String(req.method || 'GET').toUpperCase();
  const headers = req.headers.filter(([k]) => !(req.form && k.toLowerCase() === 'content-type'));
  switch (lang) {
    case 'curl': {
      const bodyArgs = req.form ? req.form.map(f => ['-F', f.file ? `${f.key}=@${f.file}` : `${f.key}=${f.value}`]) : req.body != null ? [['--data-raw', req.body]] : [];
      return toCurl({ method: m, url: req.url, headers: headers.map(([key, value]) => ({ key, value, enabled: true })), bodyArgs });
    }
    case 'fetch': {
      const lines = [];
      if (req.form) {
        lines.push('const form = new FormData();');
        for (const f of req.form) lines.push(f.file ? `form.append(${js(f.key)}, fileInput.files[0]); // ${f.file}` : `form.append(${js(f.key)}, ${js(f.value)});`);
        lines.push('');
      }
      const opts = [`  method: ${js(m)},`];
      if (headers.length) opts.push(`  headers: {\n${headers.map(([k, v]) => `    ${js(k)}: ${js(v)},`).join('\n')}\n  },`);
      const j = isJson(req);
      if (req.form) opts.push('  body: form,');
      else if (j !== null) opts.push(`  body: JSON.stringify(${JSON.stringify(j, null, 2).replace(/\n/g, '\n  ')}),`);
      else if (req.body != null) opts.push(`  body: ${js(req.body)},`);
      lines.push(`const response = await fetch(${js(req.url)}, {`, ...opts, '});', '', 'console.log(response.status);', 'console.log(await response.text());');
      return lines.join('\n');
    }
    case 'axios': {
      const lines = ["import axios from 'axios';"];
      if (req.form) { lines.push("import FormData from 'form-data';", "import fs from 'node:fs';", '', 'const form = new FormData();'); for (const f of req.form) lines.push(f.file ? `form.append(${js(f.key)}, fs.createReadStream(${js(f.file)}));` : `form.append(${js(f.key)}, ${js(f.value)});`); }
      lines.push('', 'const response = await axios({', `  method: ${js(m.toLowerCase())},`, `  url: ${js(req.url)},`);
      if (headers.length || req.form) lines.push(`  headers: {\n${headers.map(([k, v]) => `    ${js(k)}: ${js(v)},`).join('\n')}${req.form ? '\n    ...form.getHeaders(),' : ''}\n  },`);
      const j = isJson(req);
      if (req.form) lines.push('  data: form,');
      else if (j !== null) lines.push(`  data: ${JSON.stringify(j, null, 2).replace(/\n/g, '\n  ')},`);
      else if (req.body != null) lines.push(`  data: ${js(req.body)},`);
      lines.push('  validateStatus: () => true,', '});', '', 'console.log(response.status, response.data);');
      return lines.join('\n');
    }
    case 'python': {
      const lines = ['import requests', ''];
      lines.push(`url = ${py(req.url)}`);
      if (headers.length) lines.push(`headers = {\n${headers.map(([k, v]) => `    ${py(k)}: ${py(v)},`).join('\n')}\n}`);
      const j = isJson(req);
      const args = ['url'];
      if (headers.length) args.push('headers=headers');
      if (req.form) {
        const text = req.form.filter(f => !f.file); const files = req.form.filter(f => f.file);
        if (text.length) { lines.push(`data = {\n${text.map(f => `    ${py(f.key)}: ${py(f.value)},`).join('\n')}\n}`); args.push('data=data'); }
        if (files.length) { lines.push(`files = {\n${files.map(f => `    ${py(f.key)}: open(${py(f.file)}, "rb"),`).join('\n')}\n}`); args.push('files=files'); }
      } else if (j !== null) { lines.push(`payload = ${pyLiteral(j)}`); args.push('json=payload'); }
      else if (req.body != null) { lines.push(`payload = ${py(req.body)}`); args.push('data=payload'); }
      lines.push('', `response = requests.request(${py(m)}, ${args.join(', ')})`, '', 'print(response.status_code)', 'print(response.text)');
      return lines.join('\n');
    }
    case 'go': {
      const lines = ['package main', '', 'import (', '\t"fmt"', '\t"io"', '\t"net/http"'];
      if (req.body != null && !req.form) lines.push('\t"strings"');
      lines.push(')', '', 'func main() {');
      if (req.form) lines.push('\t// multipart form-data: build the body with mime/multipart (fields: ' + req.form.map(f => f.key).join(', ') + ')');
      lines.push(`\treq, err := http.NewRequest(${js(m)}, ${js(req.url)}, ${req.body != null && !req.form ? `strings.NewReader(${goStr(req.body)})` : 'nil'})`);
      lines.push('\tif err != nil {', '\t\tpanic(err)', '\t}');
      for (const [k, v] of headers) lines.push(`\treq.Header.Set(${js(k)}, ${js(v)})`);
      lines.push('', '\tres, err := http.DefaultClient.Do(req)', '\tif err != nil {', '\t\tpanic(err)', '\t}', '\tdefer res.Body.Close()', '', '\tbody, _ := io.ReadAll(res.Body)', '\tfmt.Println(res.StatusCode)', '\tfmt.Println(string(body))', '}');
      return lines.join('\n');
    }
    case 'php': {
      const lines = ['<?php', '', '$ch = curl_init();', `curl_setopt($ch, CURLOPT_URL, ${php(req.url)});`, `curl_setopt($ch, CURLOPT_CUSTOMREQUEST, ${php(m)});`, 'curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);'];
      if (headers.length) lines.push(`curl_setopt($ch, CURLOPT_HTTPHEADER, [\n${headers.map(([k, v]) => `    ${php(`${k}: ${v}`)},`).join('\n')}\n]);`);
      if (req.form) lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, [\n${req.form.map(f => `    ${php(f.key)} => ${f.file ? `new CURLFile(${php(f.file)})` : php(f.value)},`).join('\n')}\n]);`);
      else if (req.body != null) lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, ${php(req.body)});`);
      lines.push('', '$response = curl_exec($ch);', '$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);', 'curl_close($ch);', '', 'echo $status . "\\n" . $response;');
      return lines.join('\n');
    }
    default: return '';
  }
}
