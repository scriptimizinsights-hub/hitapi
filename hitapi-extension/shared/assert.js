/**
 * shared/assert.js — checks on a response (roadmap feature 8). Pure functions,
 * except the XPath helper, which needs the browser's DOMParser.
 *
 *   draft.tests = [{ id, target, path, op, expected, enabled }]
 *     target  'status' | 'header' | 'json' | 'xml' | 'time' | 'body'
 *     path    header name, JSONPath ($.data[0].id) or XPath (/user/name); unused for status/time/body
 *     op      see OPS
 *     expected  text; for JSON it is read as JSON when it can be (5, true, null, {"a":1}), else as text
 */

import { readPath } from './vars.js';

export const TARGETS = [
  { id: 'status', label: 'Status code' },
  { id: 'json', label: 'JSON body' },
  { id: 'header', label: 'Header' },
  { id: 'time', label: 'Response time' },
  { id: 'body', label: 'Body text' },
  { id: 'xml', label: 'XML body' },
];

/** Operators per target: [id, label, needs an expected value] */
export const OPS = {
  status: [['equals', 'equals', true], ['not_equals', 'is not', true], ['in_range', 'is in range (2xx, 200-299)', true], ['one_of', 'is one of (200, 201)', true]],
  header: [['exists', 'exists', false], ['not_exists', 'does not exist', false], ['equals', 'equals', true], ['contains', 'contains', true], ['matches', 'matches regex', true]],
  json: [['equals', 'equals', true], ['not_equals', 'is not', true], ['exists', 'exists', false], ['not_exists', 'does not exist', false], ['contains', 'contains', true],
    ['type_is', 'type is', true], ['length_equals', 'length is', true], ['gt', 'is greater than', true], ['lt', 'is less than', true], ['matches', 'matches regex', true]],
  xml: [['exists', 'exists', false], ['equals', 'equals', true], ['contains', 'contains', true]],
  time: [['lt', 'is below (ms)', true]],
  body: [['contains', 'contains', true], ['not_contains', 'does not contain', true], ['matches', 'matches regex', true], ['schema', 'matches JSON Schema', true]],
};

export const JSON_TYPES = ['string', 'number', 'boolean', 'object', 'array', 'null'];

let seq = 0;
export const testId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newTest(target = 'status', patch = {}) {
  const op = OPS[target][0][0];
  const defaults = { status: '200', time: '1000', json: '' };
  return { id: testId(), target, path: target === 'json' ? '$.' : '', op, expected: defaults[target] ?? '', enabled: true, ...patch };
}

export const needsPath = (t) => ['header', 'json', 'xml'].includes(t.target);
export const needsExpected = (t) => !!(OPS[t.target] || []).find(o => o[0] === t.op)?.[2];

/** "status equals 200", "$.id exists" — for lists and history. */
export function describe(t) {
  const op = (OPS[t.target] || []).find(o => o[0] === t.op)?.[1] || t.op;
  const what = { status: 'Status', time: 'Time', body: 'Body' }[t.target] || t.path || '(no path)';
  return `${what} ${op}${needsExpected(t) ? ` ${t.target === 'body' && t.op === 'schema' ? 'the schema' : t.expected}` : ''}`;
}

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const show = (v) => (v === undefined ? '(missing)' : typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v));
const parseExpected = (s) => { const t = String(s ?? '').trim(); try { return JSON.parse(t); } catch { return t; } };

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a); const kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => deepEqual(a[k], b[k]));
}

/** expected "5" vs actual 5, expected "true" vs true, expected "abc" vs "abc", expected {"a":1} vs object */
function looseEquals(actual, expected) {
  const e = parseExpected(expected);
  if (typeof actual === 'string') return actual === String(expected).trim() || (typeof e === 'string' && actual === e);
  return deepEqual(actual, e);
}

function regex(src) {
  const m = /^\/(.*)\/([gimsuy]*)$/s.exec(String(src));
  return m ? new RegExp(m[1], m[2]) : new RegExp(String(src));
}

function inRange(status, spec) {
  const s = String(spec).trim().toLowerCase();
  if (/^[1-5]xx$/.test(s)) return Math.floor(status / 100) === Number(s[0]);
  const m = /^(\d{3})\s*-\s*(\d{3})$/.exec(s);
  if (m) return status >= Number(m[1]) && status <= Number(m[2]);
  return status === Number(s);
}

// ── a small JSON Schema validator (draft-07 subset) ─────────────────────────

export function validateSchema(value, schema, path = '$', errors = []) {
  if (!schema || typeof schema !== 'object' || errors.length >= 10) return errors;
  const t = typeOf(value);
  const types = schema.type ? [].concat(schema.type) : null;
  if (types && !types.some(x => x === t || (x === 'integer' && Number.isInteger(value)) || (x === 'number' && t === 'number'))) {
    errors.push(`${path} should be ${types.join(' or ')}, but is ${t}`);
    return errors;
  }
  if (schema.enum && !schema.enum.some(e => deepEqual(e, value))) errors.push(`${path} should be one of ${JSON.stringify(schema.enum)}`);
  if ('const' in schema && !deepEqual(schema.const, value)) errors.push(`${path} should be ${JSON.stringify(schema.const)}`);
  if (t === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${path} is shorter than ${schema.minLength}`);
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push(`${path} is longer than ${schema.maxLength}`);
    if (schema.pattern) { try { if (!new RegExp(schema.pattern).test(value)) errors.push(`${path} does not match ${schema.pattern}`); } catch { /* bad pattern */ } }
  }
  if (t === 'number') {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${path} is below ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${path} is above ${schema.maximum}`);
  }
  if (t === 'array') {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${path} has fewer than ${schema.minItems} items`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${path} has more than ${schema.maxItems} items`);
    if (schema.items && typeof schema.items === 'object') value.forEach((v, i) => validateSchema(v, schema.items, `${path}[${i}]`, errors));
  }
  if (t === 'object') {
    for (const k of schema.required || []) if (!(k in value)) errors.push(`${path}.${k} is required`);
    for (const [k, s] of Object.entries(schema.properties || {})) if (k in value) validateSchema(value[k], s, `${path}.${k}`, errors);
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) if (!(k in (schema.properties || {}))) errors.push(`${path}.${k} is not allowed`);
    }
  }
  return errors;
}

// ── XPath (browser only) ────────────────────────────────────────────────────

/** Text of the nodes an XPath finds in an XML document, or { error }. */
export function xpathTexts(xml, path) {
  if (typeof DOMParser === 'undefined') return { error: 'XPath is not available here' };
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return { error: 'the response is not valid XML' };
  try {
    const r = doc.evaluate(path, doc, null, XPathResult.ANY_TYPE, null);
    if (r.resultType === XPathResult.NUMBER_TYPE) return { values: [String(r.numberValue)] };
    if (r.resultType === XPathResult.STRING_TYPE) return { values: [r.stringValue] };
    if (r.resultType === XPathResult.BOOLEAN_TYPE) return { values: r.booleanValue ? ['true'] : [] };
    const values = []; let n;
    while ((n = r.iterateNext())) values.push(n.textContent);
    return { values };
  } catch (e) { return { error: `can't read the XPath: ${e.message}` }; }
}

// ── running checks ──────────────────────────────────────────────────────────

/**
 * @param {object} t   one check (path/expected already have {{vars}} filled in)
 * @param {object} res the response (status, ms, headers/rawHeaders, text)
 * @param {object} cache  shared between checks of one response (parsed JSON)
 * @returns {{ pass: boolean, actual: string, message: string }}
 */
export function runTest(t, res, cache = {}) {
  const fail = (actual, message) => ({ pass: false, actual, message });
  const ok = (actual) => ({ pass: true, actual, message: '' });
  if (!res || res.error) return fail('', `The request failed: ${res?.error?.split('\n')[0] || 'no response'}`);
  const exp = String(t.expected ?? '').trim();
  try {
    switch (t.target) {
      case 'status': {
        const s = res.status;
        const pass = t.op === 'equals' ? s === Number(exp) : t.op === 'not_equals' ? s !== Number(exp)
          : t.op === 'in_range' ? inRange(s, exp) : exp.split(/[\s,]+/).filter(Boolean).map(Number).includes(s);
        return pass ? ok(String(s)) : fail(String(s), `Status is ${s}`);
      }
      case 'time':
        return res.ms < Number(exp) ? ok(`${res.ms} ms`) : fail(`${res.ms} ms`, `Took ${res.ms} ms (limit ${exp} ms)`);
      case 'header': {
        const want = String(t.path || '').trim().toLowerCase();
        const values = (res.rawHeaders || res.headers || []).filter(([k]) => k.toLowerCase() === want).map(([, v]) => String(v));
        if (t.op === 'exists') return values.length ? ok(values.join(', ')) : fail('(missing)', `No ${t.path} header`);
        if (t.op === 'not_exists') return values.length ? fail(values.join(', '), `${t.path} is there`) : ok('(missing)');
        if (!values.length) return fail('(missing)', `No ${t.path} header`);
        const v = values.join(', ');
        const pass = t.op === 'equals' ? values.some(x => x === exp) : t.op === 'contains' ? v.toLowerCase().includes(exp.toLowerCase()) : regex(exp).test(v);
        return pass ? ok(v) : fail(v, `${t.path} is ${JSON.stringify(v)}`);
      }
      case 'body': {
        const text = String(res.text ?? '');
        if (t.op === 'contains') return text.includes(exp) ? ok('found') : fail('not found', `The body does not contain ${JSON.stringify(exp)}`);
        if (t.op === 'not_contains') return text.includes(exp) ? fail('found', `The body contains ${JSON.stringify(exp)}`) : ok('not found');
        if (t.op === 'matches') return regex(exp).test(text) ? ok('matches') : fail('no match', `The body does not match ${exp}`);
        let schema; try { schema = JSON.parse(exp); } catch { return fail('', 'The schema is not valid JSON'); }
        let body; try { body = JSON.parse(text); } catch { return fail('', 'The response is not JSON'); }
        const errors = validateSchema(body, schema);
        return errors.length ? fail(`${errors.length} problem${errors.length === 1 ? '' : 's'}`, errors.slice(0, 3).join('; ')) : ok('valid');
      }
      case 'json': {
        if (!('json' in cache)) { try { cache.json = JSON.parse(res.text); } catch { cache.json = undefined; } }
        if (cache.json === undefined) return fail('', 'The response is not JSON');
        const got = readPath(cache.json, t.path);
        if (got.error) return fail('', got.error);
        if (t.op === 'exists') return got.found ? ok(show(got.value)) : fail('(missing)', `${t.path} is not in the response`);
        if (t.op === 'not_exists') return got.found ? fail(show(got.value), `${t.path} is there`) : ok('(missing)');
        if (!got.found) return fail('(missing)', `${t.path} is not in the response`);
        const v = got.value; const actual = show(v);
        let pass;
        switch (t.op) {
          case 'equals': pass = looseEquals(v, exp); break;
          case 'not_equals': pass = !looseEquals(v, exp); break;
          case 'contains': pass = typeof v === 'string' ? v.includes(exp) : Array.isArray(v) ? v.some(x => looseEquals(x, exp)) : (typeOf(v) === 'object' ? exp in v : String(v).includes(exp)); break;
          case 'type_is': pass = typeOf(v) === exp.toLowerCase() || (exp.toLowerCase() === 'integer' && Number.isInteger(v)); break;
          case 'length_equals': pass = (v?.length ?? (typeOf(v) === 'object' ? Object.keys(v).length : NaN)) === Number(exp); break;
          case 'gt': pass = Number(v) > Number(exp); break;
          case 'lt': pass = Number(v) < Number(exp); break;
          case 'matches': pass = regex(exp).test(typeof v === 'string' ? v : JSON.stringify(v)); break;
          default: pass = false;
        }
        const shownActual = t.op === 'type_is' ? typeOf(v) : t.op === 'length_equals' ? String(v?.length ?? Object.keys(v || {}).length) : actual;
        return pass ? ok(shownActual) : fail(shownActual, `${t.path} is ${shownActual}`);
      }
      case 'xml': {
        const r = xpathTexts(String(res.text ?? ''), t.path);
        if (r.error) return fail('', r.error);
        if (t.op === 'exists') return r.values.length ? ok(JSON.stringify(r.values[0])) : fail('(missing)', `Nothing at ${t.path}`);
        if (!r.values.length) return fail('(missing)', `Nothing at ${t.path}`);
        const v = r.values[0];
        const pass = t.op === 'equals' ? r.values.some(x => x.trim() === exp) : r.values.some(x => x.includes(exp));
        return pass ? ok(JSON.stringify(v)) : fail(JSON.stringify(v), `${t.path} is ${JSON.stringify(v)}`);
      }
      default: return fail('', `Unknown check: ${t.target}`);
    }
  } catch (e) {
    return fail('', e instanceof SyntaxError ? `Bad regular expression: ${e.message}` : e.message);
  }
}

/** Run every enabled check. Returns [{ test, pass, actual, message }]. */
export function runTests(tests, res) {
  const cache = {};
  return (tests || []).filter(t => t.enabled !== false).map(t => ({ test: { ...t }, ...runTest(t, res, cache) }));
}

export const summary = (results) => ({ passed: results.filter(r => r.pass).length, total: results.length });

/** Checks worth having for this response (no AI): status, time, content type, top-level JSON fields. */
export function suggestTests(res) {
  if (!res || res.error) return [];
  const out = [newTest('status', { op: 'equals', expected: String(res.status) })];
  out.push(newTest('time', { expected: String(Math.max(1000, Math.ceil((res.ms * 3) / 100) * 100)) }));
  const ct = (res.rawHeaders || res.headers || []).find(([k]) => k.toLowerCase() === 'content-type')?.[1];
  if (ct) out.push(newTest('header', { path: 'Content-Type', op: 'contains', expected: ct.split(';')[0].trim() }));
  let json; try { json = JSON.parse(res.text); } catch { /* not JSON */ }
  if (json && typeof json === 'object') {
    if (Array.isArray(json)) out.push(newTest('json', { path: '$', op: 'type_is', expected: 'array' }));
    else for (const [k, v] of Object.entries(json).slice(0, 6)) {
      const path = /^[A-Za-z_$][\w$]*$/.test(k) ? `$.${k}` : `$['${k.replace(/'/g, "\\'")}']`;
      out.push(newTest('json', { path, op: 'type_is', expected: typeOf(v) }));
    }
  }
  return out;
}
