// hitapi-cli tests: a local HTTP server, sample files, the real command.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, parseArgs } from '../src/main.mjs';

let server; let base; const dir = mkdtempSync(join(tmpdir(), 'hitapi-cli-'));
let flaky = 0; let cloudPolls = 0;
before(async () => {
  server = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    const u = new URL(req.url, 'http://x');
    const send = (code, data, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(data)); };
    if (u.pathname === '/login') return send(200, { token: 'tok-' + JSON.parse(body || '{}').user }, { 'X-Session': 'sess-1' });
    if (u.pathname === '/me') return req.headers.authorization?.startsWith('Bearer tok-') ? send(200, { user: req.headers.authorization.slice(11), cookie: req.headers.cookie || null, ua: req.headers['user-agent'] }) : send(401, { error: 'no' });
    if (u.pathname === '/echo') return send(200, { method: req.method, query: Object.fromEntries(u.searchParams), headers: req.headers, body });
    if (u.pathname === '/flaky') return send(flaky++ % 2 ? 500 : 200, {});
    if (u.pathname === '/redirect') { res.writeHead(302, { Location: '/echo?from=r' }); return res.end(); }
    if (u.pathname === '/slow') { await new Promise(r => setTimeout(r, 1500)); return send(200, {}); }
    if (u.pathname === '/oauth') return send(200, { access_token: 'oa-' + new URLSearchParams(body).get('client_id'), expires_in: 60 });
    if (u.pathname.startsWith('/api/projects/p/flows/f/run')) {
      if (req.headers.authorization !== 'Bearer hk_unit_test_key_000000000000') return send(401, { success: false, error: 'Unauthorized' });
      if (req.method === 'POST') return send(200, { success: true, data: { run_id: 'r1', status: 'queued', total_steps: 1 } });
      cloudPolls++;
      return send(200, { success: true, data: cloudPolls < 2 ? { run: { id: 'r1', status: 'running' }, stepResults: [] } : { run: { id: 'r1', status: 'done', passed: 1, failed: 0 }, stepResults: [{ step_order: 0, step_name: 'Ping', status: 'passed', actual_status: 200, request_method: 'GET' }] } });
    }
    send(404, { error: 'not found' });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const auth = (x = {}) => ({ type: 'none', bearer: { token: '', prefix: 'Bearer' }, basic: { username: '', password: '' }, apikey: { key: 'X-API-Key', value: '', in: 'header' }, custom: { name: '', value: '' }, oauth2: { tokenUrl: '', clientId: '', clientSecret: '', scope: '', audience: '', clientAuth: 'body' }, ...x });
const req = (name, url, extra = {}) => ({ id: name, type: 'request', name, draft: { method: 'GET', url, headers: [], bodyType: 'json', bodies: { json: '', xml: '', text: '', urlencoded: [], form: [], binary: {}, graphql: { query: '', variables: '' } }, auth: auth({ type: 'inherit' }), settings: { timeoutSec: 30, followRedirects: true }, extract: [], tests: [], ...extra } });
const status = (n) => ({ id: 't' + n, target: 'status', op: 'equals', expected: String(n), enabled: true });
const write = (name, data) => { const p = join(dir, name); writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data)); return p; };
async function run(args, env = {}) {
  let out = ''; let err = '';
  const code = await main(args, { stdout: (s) => { out += s; }, stderr: (s) => { err += s; }, env, color: false });
  return { code, out, err };
}

function collectionFile() {
  return write('shop.hitapi.json', { format: 'hitapi-collection', version: 1, collection: {
    id: 'c', type: 'collection', name: 'Shop', settings: { baseUrl: '{{base}}', headers: [{ key: 'X-Client', value: 'cli', enabled: true }], auth: auth({ type: 'bearer', bearer: { token: '{{token}}', prefix: 'Bearer' } }), variables: [{ key: 'base', value: base, enabled: true }, { key: 'apiSecret', value: '', secret: true, enabled: true }] },
    children: [
      req('Login', '/login', { method: 'POST', auth: auth(), bodies: { json: '{"user":"{{user}}"}', xml: '', text: '', urlencoded: [], form: [], binary: {}, graphql: { query: '', variables: '' } }, extract: [{ id: 'x', name: 'token', from: 'body', path: '$.token', enabled: true }], tests: [status(200)] }),
      { id: 'f', type: 'folder', name: 'Account', settings: { headers: [], auth: auth({ type: 'inherit' }), variables: [] }, children: [
        req('Me', '/me', { headers: [{ key: 'Cookie', value: 'a=1', enabled: true }, { key: 'User-Agent', value: 'hitapi-test', enabled: true }], tests: [status(200), { id: 'j', target: 'json', path: '$.user', op: 'equals', expected: '{{user}}', enabled: true }] }),
        req('Echo', '/echo?q={{apiSecret}}', { tests: [status(200)] })] }],
  } });
}

test('arguments', () => {
  const { pos, o } = parseArgs(['run', 'a.json', 'b.json', '--var', 'x=1', '--var=y=2', '--bail', '--junit', 'r.xml']);
  assert.deepEqual(pos, ['run', 'a.json', 'b.json']); assert.deepEqual(o.var, ['x=1', 'y=2']); assert.equal(o.bail, true); assert.equal(o.junit, 'r.xml');
});

test('usage errors exit 2', async () => {
  assert.equal((await run([])).code, 2);
  assert.equal((await run(['run'])).code, 2);
  assert.match((await run(['run', join(dir, 'nope.json')])).err, /no such file/);
  assert.match((await run(['run', write('x.json', { a: 1 })])).err, /not a HitAPI collection/);
  assert.match((await run(['run', collectionFile(), '--frobnicate', '1'])).err, /Unknown option --frobnicate/);
  assert.equal((await run(['--version'])).code, 0);
  assert.match((await run(['--help'])).out, /hitapi run <file…>/);
});

test('collection: base URL, inherited auth, Set vars chain, protected headers, tests', async () => {
  const f = collectionFile();
  const r = await run(['run', f, '--var', 'user=asha', '--var', 'apiSecret=s3cr3t-value', '--json', join(dir, 'r.json'), '--junit', join(dir, 'r.xml'), '--export-env', join(dir, 'env.json')]);
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /✓ POST Login/); assert.match(r.out, /✓ GET Me/); assert.match(r.out, /PASS 3 passed, 0 failed/);
  const j = JSON.parse(readFileSync(join(dir, 'r.json'), 'utf8'));
  assert.equal(j.ok, true); assert.equal(j.summary.total, 3);
  assert.deepEqual(j.suites[0].results[0].setVars, ['token']);
  const x = readFileSync(join(dir, 'r.xml'), 'utf8');
  assert.match(x, /<testsuites name="hitapi" tests="3" failures="0" errors="0"/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'env.json'), 'utf8')).token, 'tok-asha');
  assert.ok(!readFileSync(join(dir, 'r.json'), 'utf8').includes('s3cr3t-value'), 'secret --var value redacted from reports');
});

test('missing variable: explained, exit 1; blanked secrets must come from CI', async () => {
  const r = await run(['run', collectionFile(), '--var', 'user=asha']);
  assert.equal(r.code, 1);
  assert.match(r.out, /Not defined: \{\{apiSecret\}\} — give a value with --var, --env-file or HITAPI_VAR_apiSecret/);
});

test('HITAPI_VAR_ and env files (.env, JSON, Postman); --var wins; secrets redacted in output', async () => {
  const dotenv = write('ci.env', '# comment\nuser=ben\nexport apiSecret="from-dotenv-123"\n');
  let r = await run(['run', collectionFile(), '--env-file', dotenv]);
  assert.equal(r.code, 0, r.out);
  const pm = write('pm.json', { name: 'Dev', _postman_variable_scope: 'environment', values: [{ key: 'user', value: 'pm-user', enabled: true }, { key: 'apiSecret', value: 'pm-secret-1', enabled: true }] });
  r = await run(['run', collectionFile(), '--env-file', pm, '--var', 'user=cli-user', '--reporter', 'json']);
  const j = JSON.parse(r.out);
  assert.equal(j.ok, true); assert.ok(!r.out.includes('pm-secret-1'));
  r = await run(['run', collectionFile(), '--var', 'user=env'], { HITAPI_VAR_apiSecret: 'from-ci-secret', HITAPI_VAR_user: 'ignored' });
  assert.equal(r.code, 0, r.out);
  // the secret appears in a failing assertion: blanked out
  const f2 = write('leak.hitapi.json', { format: 'hitapi-collection', version: 1, collection: { id: 'c', type: 'collection', name: 'Leak', settings: { baseUrl: '', headers: [], auth: auth(), variables: [] }, children: [req('Echo', `${base}/echo?k={{apiKey}}`, { auth: auth(), tests: [{ id: 'l', target: 'json', path: '$.query.k', op: 'equals', expected: 'nope', enabled: true }] })] } });
  r = await run(['run', f2], { HITAPI_VAR_apiKey: 'very-secret-key' });
  assert.equal(r.code, 1); assert.ok(!r.out.includes('very-secret-key'), r.out); assert.match(r.out, /••••••/);
});

test('--folder, --bail, --delay, --timeout, redirects, data rows', async () => {
  let r = await run(['run', collectionFile(), '--folder', 'Account', '--var', 'user=a', '--var', 'apiSecret=x1234', '--var', 'token=tok-a']);
  assert.equal(r.code, 0, r.out); assert.match(r.out, /Shop \/ Account/); assert.doesNotMatch(r.out, /Login/);
  assert.equal((await run(['run', collectionFile(), '--folder', 'Nope'])).code, 2);
  const flakyFile = write('flaky.hitapi.json', { format: 'hitapi-collection', version: 1, collection: { id: 'c', type: 'collection', name: 'Flaky', settings: { baseUrl: base, headers: [], auth: auth(), variables: [] }, children: [req('A', '/flaky', { auth: auth() }), req('B', '/flaky', { auth: auth() }), req('C', '/flaky', { auth: auth() })] } });
  flaky = 0; r = await run(['run', flakyFile, '--bail']);
  assert.equal(r.code, 1); assert.match(r.out, /✓ GET A/); assert.match(r.out, /✗ GET B/); assert.doesNotMatch(r.out, /GET C/); assert.match(r.err, /--bail/);
  flaky = 0; const t0 = Date.now(); r = await run(['run', flakyFile, '--delay', '200']);
  assert.ok(Date.now() - t0 >= 600); assert.match(r.out, /2 passed, 1 failed/);
  const slow = write('slow.hitapi.json', { format: 'hitapi-collection', version: 1, collection: { id: 'c', type: 'collection', name: 'Slow', settings: { baseUrl: base, headers: [], auth: auth(), variables: [] }, children: [req('S', '/slow', { auth: auth() }), req('R', '/redirect', { auth: auth(), settings: { timeoutSec: 30, followRedirects: false }, tests: [status(302)] })] } });
  r = await run(['run', slow, '--timeout', '300']);
  assert.match(r.out, /No response after 0 s \(timeout\)|timeout/); assert.match(r.out, /✓ GET R {2}302/);
  const data = write('rows.csv', 'user\nasha\nben\n');
  r = await run(['run', collectionFile(), '--data', data, '--var', 'apiSecret=abcd1', '--reporter', 'junit']);
  assert.equal(r.code, 0, r.out); assert.match(r.out, /POST Login \[row 2\]/); assert.match(r.out, /tests="6"/);
});

test('scenario file from the extension: steps, onFail, repeat, inline data, oauth2', async () => {
  const f = write('flow.scenario.json', { format: 'hitapi-scenario', version: 1, scenario: { name: 'Flow', data: { text: 'user\nzoe', format: 'csv' }, steps: [
    { name: 'Login', enabled: true, delayMs: 0, repeat: 2, onFail: 'stop', variables: [{ key: 'base', value: base, enabled: true }], draft: { ...req('Login', '{{base}}/login', { method: 'POST', auth: auth(), bodies: { json: '{"user":"{{user}}"}' }, extract: [{ id: 'x', name: 'token', from: 'body', path: '$.token', enabled: true }] }).draft } },
    { name: 'Me', enabled: true, delayMs: 0, repeat: 1, onFail: 'stop', variables: [{ key: 'base', value: base, enabled: true }], draft: { ...req('Me', '{{base}}/me', { auth: auth({ type: 'bearer', bearer: { token: '{{token}}', prefix: 'Bearer' } }), tests: [{ id: 'j', target: 'json', path: '$.user', op: 'equals', expected: 'zoe', enabled: true }] }).draft } },
    { name: 'OAuth', enabled: true, delayMs: 0, repeat: 1, onFail: 'continue', variables: [], draft: { ...req('OAuth', `${base}/echo`, { auth: auth({ type: 'oauth2', oauth2: { tokenUrl: `${base}/oauth`, clientId: 'cli-app', clientSecret: 'x', scope: '', audience: '', clientAuth: 'body' } }), tests: [{ id: 'h', target: 'json', path: '$.headers.authorization', op: 'equals', expected: 'Bearer oa-cli-app', enabled: true }] }).draft } },
    { name: 'Off', enabled: false, delayMs: 0, repeat: 1, onFail: 'stop', variables: [], draft: req('Off', `${base}/missing`).draft },
  ] } });
  const r = await run(['run', f]);
  assert.equal(r.code, 0, r.out);
  assert.equal((r.out.match(/POST Login/g) || []).length, 2, 'repeat 2');
  assert.match(r.out, /✓ GET OAuth/); assert.doesNotMatch(r.out, /Off/);
  assert.match(r.out, /PASS 4 passed/);
});

test('Postman collection v2.1 with a test script', async () => {
  const f = write('pm.postman_collection.json', { info: { name: 'PM', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, variable: [{ key: 'base', value: base }], item: [
    { name: 'Echo', request: { method: 'GET', url: '{{base}}/echo?x=1' }, event: [{ listen: 'test', script: { exec: ['pm.test("ok", function () { pm.response.to.have.status(200); });'] } }] },
    { name: 'Missing', request: { method: 'GET', url: '{{base}}/missing' } }] });
  const r = await run(['run', f]);
  assert.equal(r.code, 1); assert.match(r.out, /✓ GET Echo/); assert.match(r.out, /✗ GET Missing {2}404/);
});

test('backup: runs its scenarios with saved requests; --env picks the environment', async () => {
  const c = JSON.parse(readFileSync(collectionFile(), 'utf8')).collection;
  const f = write('backup.json', { format: 'hitapi-backup', version: 1, collections: { items: [c] }, environments: { globals: [], envs: [{ id: 'e1', name: 'Dev', vars: [{ key: 'user', value: 'dev-user', enabled: true }, { key: 'apiSecret', value: 'dev-s3cret', enabled: true }] }] },
    scenarios: { items: [{ id: 's', name: 'Saved flow', steps: [{ id: 'a', kind: 'saved', requestId: 'Login', enabled: true, delayMs: 0, repeat: 1, onFail: 'stop' }, { id: 'b', kind: 'saved', requestId: 'Me', enabled: true, delayMs: 0, repeat: 1, onFail: 'stop' }, { id: 'c', kind: 'saved', requestId: 'gone', enabled: true, delayMs: 0, repeat: 1, onFail: 'continue' }], data: { text: '', format: 'csv' } }] } });
  let r = await run(['run', f, '--env', 'Dev']);
  assert.equal(r.code, 1, r.out); assert.match(r.out, /Saved flow/); assert.match(r.out, /✓ GET Me/); assert.match(r.out, /saved request for this step was deleted/);
  r = await run(['run', f, '--collection', 'Shop', '--env-file', f, '--env', 'Dev']);
  assert.equal(r.code, 0, r.out);
  assert.equal((await run(['run', f, '--env', 'Prod'])).code, 2);
});

test('cloud run: API key, polling, JUnit; bad key exits 2', async () => {
  const api = `${base}/api`;
  let r = await run(['cloud', 'run', '--project', 'p', '--suite', 'f', '--api', api, '--junit', join(dir, 'c.xml')], { HITAPI_API_KEY: 'hk_unit_test_key_000000000000', HITAPI_POLL_MS: '20' });
  assert.equal(r.code, 0, r.out + r.err); assert.match(r.out, /status: running/); assert.match(r.out, /PASS 1 passed, 0 failed/);
  assert.match(readFileSync(join(dir, 'c.xml'), 'utf8'), /name="GET Ping"/);
  r = await run(['cloud', 'run', '--project', 'p', '--suite', 'f', '--api', api], { HITAPI_API_KEY: 'hk_wrong' });
  assert.equal(r.code, 2); assert.match(r.err, /did not accept the API key/);
  r = await run(['cloud', 'run', '--project', 'p', '--suite', 'f', '--api', api], {});
  assert.equal(r.code, 2); assert.match(r.err, /HITAPI_API_KEY/);
});
