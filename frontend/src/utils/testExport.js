/**
 * utils/testExport.js — export HitAPI test cases as a test file for another tool,
 * so tests aren't locked into HitAPI.
 *
 *   exportTests('pytest', testCases, project) → { filename, content, runHint }
 *
 * Formats: playwright (TypeScript), pytest (requests), jest (fetch), k6.
 * Every file reads BASE_URL and API_TOKEN from environment variables, so no
 * secret is ever written into the exported code. BASE_URL defaults to the
 * project's base URL; point it at your HitAPI mock server to run against mocks.
 */

import { pyLiteral } from './codegen.js';

export const TEST_FORMATS = [
    { id: 'playwright', label: 'Playwright', lang: 'TypeScript', file: 'hitapi.spec.ts' },
    { id: 'pytest', label: 'Pytest', lang: 'Python', file: 'test_hitapi.py' },
    { id: 'jest', label: 'Jest', lang: 'JavaScript', file: 'hitapi.test.js' },
    { id: 'k6', label: 'k6', lang: 'JavaScript', file: 'hitapi-k6.js' },
];

const parse = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
};

const AUTH_HEADER = /^(authorization|cookie|x-api-key|api-key)$/i;

/** One test case → the request it makes (path params filled, the rest as query). */
export function caseToRequest(tc) {
    const params = parse(tc.input_params) || {};
    const headers = parse(tc.input_headers) || {};
    const payload = parse(tc.input_payload);
    let path = tc.path || '/';
    const query = {};
    for (const [k, v] of Object.entries(typeof params === 'object' ? params : {})) {
        if (path.includes(`{${k}}`)) path = path.replace(`{${k}}`, encodeURIComponent(String(v)));
        else query[k] = v;
    }
    const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])).toString();
    const cleanHeaders = {};
    for (const [k, v] of Object.entries(typeof headers === 'object' ? headers : {})) {
        if (!AUTH_HEADER.test(k)) cleanHeaders[k] = String(v); // tokens come from API_TOKEN instead
    }
    const method = String(tc.method || 'GET').toUpperCase();
    const hasBody = !['GET', 'HEAD', 'DELETE'].includes(method) && payload !== null && payload !== undefined;
    return {
        name: tc.name || `${method} ${tc.path}`,
        type: tc.type || 'test',
        method,
        pathAndQuery: path + (qs ? `?${qs}` : ''),
        headers: cleanHeaders,
        body: hasBody ? payload : undefined,
        expected: Number(tc.expected_status) || 200,
        reasoning: tc.ai_reasoning || '',
    };
}

const title = (r) => `${r.method} ${r.pathAndQuery.split('?')[0]}: ${r.name} [${r.type}]`;
const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const jsStr = (s) => JSON.stringify(String(s));
const jsVal = (v, indent) => JSON.stringify(v, null, 2).split('\n').map((l, i) => (i ? ' '.repeat(indent) + l : l)).join('\n');

function headerBlock(project, count, howToRun) {
    return [
        `HitAPI test export — ${project?.name || 'project'} (${count} test${count === 1 ? '' : 's'})`,
        `Generated ${new Date().toISOString().slice(0, 10)} from https://hitapi.dev`,
        '',
        'Environment variables:',
        `  BASE_URL   API to test (default: ${project?.base_url || 'http://localhost:3000'}; a HitAPI mock URL works too)`,
        '  API_TOKEN  optional; sent as "Authorization: Bearer <token>"',
        '',
        'Run:',
        ...howToRun.map(l => '  ' + l),
    ];
}

function playwright(reqs, project) {
    const head = headerBlock(project, reqs.length, ['npm i -D @playwright/test', 'BASE_URL=https://api.example.com npx playwright test hitapi.spec.ts']);
    const out = [
        '/*', ...head.map(l => ` * ${l}`.trimEnd()), ' */',
        "import { test, expect } from '@playwright/test';",
        '',
        `const BASE_URL = (process.env.BASE_URL ?? ${jsStr(project?.base_url || 'http://localhost:3000')}).replace(/\\/$/, '');`,
        'const TOKEN = process.env.API_TOKEN;',
        'const AUTH: Record<string, string> = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};',
        '',
        `test.describe(${jsStr(`${project?.name || 'API'} tests (exported from HitAPI)`)}, () => {`,
    ];
    for (const r of reqs) {
        out.push(`  test(${jsStr(title(r))}, async ({ request }) => {`);
        if (r.reasoning) out.push(`    // ${oneLine(r.reasoning)}`);
        out.push(`    const res = await request.fetch(BASE_URL + ${jsStr(r.pathAndQuery)}, {`);
        out.push(`      method: ${jsStr(r.method)},`);
        out.push(`      headers: { ...AUTH, ${Object.entries(r.headers).map(([k, v]) => `${jsStr(k)}: ${jsStr(v)}`).join(', ')} },`);
        if (r.body !== undefined) out.push(`      data: ${jsVal(r.body, 6)},`);
        out.push('    });');
        out.push(`    expect(res.status()).toBe(${r.expected});`);
        out.push('  });', '');
    }
    if (out[out.length - 1] === '') out.pop();
    out.push('});', '');
    return out.join('\n');
}

function pyName(r, used) {
    let base = `test_${r.method}_${r.pathAndQuery.split('?')[0]}_${r.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
    let name = base;
    for (let i = 2; used.has(name); i++) name = `${base}_${i}`;
    used.add(name);
    return name;
}

function pytest(reqs, project) {
    const head = headerBlock(project, reqs.length, ['pip install pytest requests', 'BASE_URL=https://api.example.com pytest test_hitapi.py -v']);
    const out = [
        ...head.map(l => `# ${l}`.trimEnd()),
        '',
        'import os',
        '',
        'import requests',
        '',
        `BASE_URL = os.environ.get("BASE_URL", ${JSON.stringify(project?.base_url || 'http://localhost:3000')}).rstrip("/")`,
        'TOKEN = os.environ.get("API_TOKEN")',
        'AUTH = {"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}',
        'TIMEOUT = 30',
    ];
    const used = new Set();
    for (const r of reqs) {
        out.push('', '');
        out.push(`def ${pyName(r, used)}():`);
        out.push(`    # ${oneLine(title(r))}`);
        if (r.reasoning) out.push(`    # ${oneLine(r.reasoning)}`);
        const args = [JSON.stringify(r.method), `BASE_URL + ${JSON.stringify(r.pathAndQuery)}`, `headers={**AUTH, **${pyLiteral(r.headers, 1)}}`];
        if (r.body !== undefined) args.push(typeof r.body === 'string' ? `data=${JSON.stringify(r.body)}` : `json=${pyLiteral(r.body, 1)}`);
        args.push('timeout=TIMEOUT');
        out.push(`    res = requests.request(`);
        out.push(...args.map(a => `        ${a},`));
        out.push('    )');
        out.push(`    assert res.status_code == ${r.expected}, f"expected ${r.expected}, got {res.status_code}: {res.text[:300]}"`);
    }
    out.push('');
    return out.join('\n');
}

function jest(reqs, project) {
    const head = headerBlock(project, reqs.length, ['npm i -D jest   (Node 18+, uses built-in fetch)', 'BASE_URL=https://api.example.com npx jest hitapi.test.js']);
    const out = [
        '/*', ...head.map(l => ` * ${l}`.trimEnd()), ' */',
        `const BASE_URL = (process.env.BASE_URL ?? ${jsStr(project?.base_url || 'http://localhost:3000')}).replace(/\\/$/, '');`,
        'const TOKEN = process.env.API_TOKEN;',
        'const AUTH = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};',
        '',
        `describe(${jsStr(`${project?.name || 'API'} tests (exported from HitAPI)`)}, () => {`,
    ];
    for (const r of reqs) {
        out.push(`  test(${jsStr(title(r))}, async () => {`);
        if (r.reasoning) out.push(`    // ${oneLine(r.reasoning)}`);
        const headers = { ...r.headers };
        if (r.body !== undefined && typeof r.body !== 'string' && !Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
        out.push(`    const res = await fetch(BASE_URL + ${jsStr(r.pathAndQuery)}, {`);
        out.push(`      method: ${jsStr(r.method)},`);
        out.push(`      headers: { ...AUTH, ${Object.entries(headers).map(([k, v]) => `${jsStr(k)}: ${jsStr(v)}`).join(', ')} },`);
        if (r.body !== undefined) out.push(`      body: ${typeof r.body === 'string' ? jsStr(r.body) : `JSON.stringify(${jsVal(r.body, 6)})`},`);
        out.push('    });');
        out.push(`    expect(res.status).toBe(${r.expected});`);
        out.push('  }, 30000);', '');
    }
    if (out[out.length - 1] === '') out.pop();
    out.push('});', '');
    return out.join('\n');
}

function k6(reqs, project) {
    const head = headerBlock(project, reqs.length, ['k6 run -e BASE_URL=https://api.example.com hitapi-k6.js', 'Load test: k6 run --vus 10 --duration 30s hitapi-k6.js']);
    const out = [
        '/*', ...head.map(l => ` * ${l}`.trimEnd()), ' */',
        "import http from 'k6/http';",
        "import { check, group } from 'k6';",
        '',
        'export const options = {',
        '  vus: 1,',
        '  iterations: 1,',
        "  thresholds: { checks: ['rate==1.0'] },",
        '};',
        '',
        `const BASE_URL = (__ENV.BASE_URL || ${jsStr(project?.base_url || 'http://localhost:3000')}).replace(/\\/$/, '');`,
        'const TOKEN = __ENV.API_TOKEN;',
        'const AUTH = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};',
        '',
        'export default function () {',
    ];
    for (const r of reqs) {
        const headers = { ...r.headers };
        if (r.body !== undefined && typeof r.body !== 'string' && !Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
        out.push(`  group(${jsStr(title(r))}, () => {`);
        const body = r.body === undefined ? 'null' : typeof r.body === 'string' ? jsStr(r.body) : `JSON.stringify(${jsVal(r.body, 4)})`;
        out.push(`    const res = http.request(${jsStr(r.method)}, BASE_URL + ${jsStr(r.pathAndQuery)}, ${body}, {`);
        out.push(`      headers: { ...AUTH, ${Object.entries(headers).map(([k, v]) => `${jsStr(k)}: ${jsStr(v)}`).join(', ')} },`);
        out.push('    });');
        out.push(`    check(res, { ${jsStr(`status is ${r.expected}`)}: (r) => r.status === ${r.expected} });`);
        out.push('  });', '');
    }
    if (out[out.length - 1] === '') out.pop();
    out.push('}', '');
    return out.join('\n');
}

const EXPORTERS = { playwright, pytest, jest, k6 };

/**
 * @param {'playwright'|'pytest'|'jest'|'k6'} format
 * @param {Array} testCases  rows from GET /projects/:id/tests (with path and method)
 * @param {{ name, base_url }} project
 */
export function exportTests(format, testCases, project) {
    const fmt = TEST_FORMATS.find(f => f.id === format);
    if (!fmt) throw new Error(`Unknown export format: ${format}`);
    const reqs = (testCases || []).map(caseToRequest);
    return { filename: fmt.file, content: EXPORTERS[format](reqs, project), count: reqs.length };
}

/** Save text as a file in the browser. */
export function downloadText(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
