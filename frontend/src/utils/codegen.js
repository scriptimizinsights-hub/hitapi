/**
 * utils/codegen.js — turn one HTTP request into a ready-to-run code snippet.
 *
 *   toSnippet('python', { method, url, headers, body })
 *
 * Languages: curl, python (requests), go (net/http), node (fetch, Node 18+).
 * Used by the API Playground's Code tab and the Mock Server page.
 */

export const LANGUAGES = [
    { id: 'curl', label: 'cURL', file: 'request.sh' },
    { id: 'python', label: 'Python', file: 'request.py' },
    { id: 'go', label: 'Go', file: 'main.go' },
    { id: 'node', label: 'Node.js', file: 'request.mjs' },
];

const shellQuote = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** The body as a JSON value if it is valid JSON, else undefined. */
function jsonBody(body) {
    if (body === undefined || body === null || body === '') return undefined;
    if (typeof body !== 'string') return body;
    try { return JSON.parse(body); } catch { return undefined; }
}

const bodyText = (body) => (typeof body === 'string' ? body : JSON.stringify(body, null, 2));

// ── Python literal from a JSON value ────────────────────────────────────────
export function pyLiteral(value, indent = 0) {
    const pad = '    '.repeat(indent + 1);
    const end = '    '.repeat(indent);
    if (value === null || value === undefined) return 'None';
    if (value === true) return 'True';
    if (value === false) return 'False';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'None';
    if (typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) {
        if (!value.length) return '[]';
        return `[\n${value.map(v => pad + pyLiteral(v, indent + 1)).join(',\n')},\n${end}]`;
    }
    const entries = Object.entries(value);
    if (!entries.length) return '{}';
    return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${pyLiteral(v, indent + 1)}`).join(',\n')},\n${end}}`;
}

// ── JavaScript object literal (2-space indent) ─────────────────────────────
const jsLiteral = (value, indent = 0) =>
    JSON.stringify(value, null, 2).split('\n').map((l, i) => (i ? '  '.repeat(indent) + l : l)).join('\n');

// ── Go string literal ───────────────────────────────────────────────────────
const goString = (s) => (String(s).includes('`') ? JSON.stringify(String(s)) : '`' + s + '`');

function curl({ method, url, headers, body }) {
    const parts = [`curl -X ${method} ${shellQuote(url)}`];
    for (const [k, v] of Object.entries(headers || {})) parts.push(`  -H ${shellQuote(`${k}: ${v}`)}`);
    if (body !== undefined && body !== null && body !== '') parts.push(`  --data ${shellQuote(bodyText(body))}`);
    return parts.join(' \\\n');
}

function python({ method, url, headers, body }) {
    const json = jsonBody(body);
    const h = { ...(headers || {}) };
    const lines = ['import requests', '', `url = ${JSON.stringify(url)}`];
    // requests sets Content-Type for json= itself
    if (json !== undefined) for (const k of Object.keys(h)) if (k.toLowerCase() === 'content-type' && /json/i.test(h[k])) delete h[k];
    if (Object.keys(h).length) lines.push(`headers = ${pyLiteral(h)}`);
    if (json !== undefined) lines.push(`payload = ${pyLiteral(json)}`);
    else if (body) lines.push(`payload = ${JSON.stringify(bodyText(body))}`);
    const args = [JSON.stringify(method), 'url'];
    if (Object.keys(h).length) args.push('headers=headers');
    if (json !== undefined) args.push('json=payload');
    else if (body) args.push('data=payload');
    args.push('timeout=30');
    lines.push('', `response = requests.request(${args.join(', ')})`, '', 'print(response.status_code)', 'print(response.text)');
    return lines.join('\n');
}

function go({ method, url, headers, body }) {
    const hasBody = body !== undefined && body !== null && body !== '';
    const imports = ['"fmt"', '"io"', '"net/http"'];
    if (hasBody) imports.push('"strings"');
    const lines = [
        'package main', '', 'import (', ...imports.map(i => `\t${i}`), ')', '',
        'func main() {',
    ];
    if (hasBody) {
        lines.push(`\tbody := strings.NewReader(${goString(bodyText(body))})`);
        lines.push(`\treq, err := http.NewRequest(${JSON.stringify(method)}, ${JSON.stringify(url)}, body)`);
    } else {
        lines.push(`\treq, err := http.NewRequest(${JSON.stringify(method)}, ${JSON.stringify(url)}, nil)`);
    }
    lines.push('\tif err != nil {', '\t\tpanic(err)', '\t}');
    for (const [k, v] of Object.entries(headers || {})) lines.push(`\treq.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(String(v))})`);
    lines.push(
        '', '\tres, err := http.DefaultClient.Do(req)', '\tif err != nil {', '\t\tpanic(err)', '\t}',
        '\tdefer res.Body.Close()', '', '\tdata, err := io.ReadAll(res.Body)', '\tif err != nil {', '\t\tpanic(err)', '\t}',
        '\tfmt.Println(res.Status)', '\tfmt.Println(string(data))', '}',
    );
    return lines.join('\n');
}

function node({ method, url, headers, body }) {
    const json = jsonBody(body);
    const opts = [`  method: ${JSON.stringify(method)},`];
    if (Object.keys(headers || {}).length) opts.push(`  headers: ${jsLiteral(headers, 1)},`);
    if (json !== undefined) opts.push(`  body: JSON.stringify(${jsLiteral(json, 1)}),`);
    else if (body) opts.push(`  body: ${JSON.stringify(bodyText(body))},`);
    return [
        '// Node.js 18+ (built-in fetch). Save as request.mjs and run: node request.mjs',
        `const response = await fetch(${JSON.stringify(url)}, {`,
        ...opts,
        '});',
        '',
        'console.log(response.status);',
        'console.log(await response.text());',
    ].join('\n');
}

const GENERATORS = { curl, python, go, node };

/**
 * @param {'curl'|'python'|'go'|'node'} lang
 * @param {{ method: string, url: string, headers?: object, body?: string|object }} req
 */
export function toSnippet(lang, req) {
    const gen = GENERATORS[lang];
    if (!gen) throw new Error(`Unknown language: ${lang}`);
    let url = String(req.url || '');
    try { url = new URL(url).toString(); } catch { /* keep as typed */ } // encodes spaces etc.
    return gen({ ...req, url, method: String(req.method || 'GET').toUpperCase(), headers: req.headers || {} });
}
