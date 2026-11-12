/**
 * services/mock/specSamples.js — the mock response for one stored endpoint:
 * which status to answer with, and a body from the spec's example, else from
 * its schema, else a sensible fallback.
 *
 * Stored endpoints come in a few shapes (OpenAPI 3 normalised, raw Swagger 2,
 * captured by the browser extension with no responses at all); all are handled.
 */

import { sampleFromSchema, fallbackBody } from './fakeData.js';

const parse = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return null; }
};

/** The success status the mock should answer with. */
export function pickStatus(method, responses) {
    const codes = Object.keys(responses || {}).filter(c => /^\d{3}$/.test(c)).map(Number).sort((a, b) => a - b);
    const m = method.toUpperCase();
    if (m === 'POST' && codes.includes(201)) return 201; // "created" is the usual answer to a POST
    const ok = codes.find(c => c >= 200 && c < 300);
    if (ok) return ok;
    if (m === 'POST') return 201;
    if (m === 'DELETE') return codes.length ? (codes.includes(204) ? 204 : 200) : 204;
    return 200;
}

/** The JSON content entry of a response, whatever shape it was stored in. */
function jsonContent(response) {
    if (!response || typeof response !== 'object') return null;
    const content = response.content;
    if (content && typeof content === 'object') {
        const key = Object.keys(content).find(k => k.includes('json')) || Object.keys(content)[0];
        if (key) return content[key];
    }
    // Swagger 2 raw: { schema, examples: { 'application/json': … } }
    if (response.schema || response.examples) {
        const ex = response.examples && (response.examples['application/json'] ?? Object.values(response.examples)[0]);
        return { schema: response.schema, example: ex };
    }
    return null;
}

function exampleOf(content) {
    if (!content) return undefined;
    if (content.example !== undefined) return content.example;
    if (content.examples && typeof content.examples === 'object') {
        const first = Object.values(content.examples)[0];
        if (first && typeof first === 'object' && 'value' in first) return first.value;
        if (first !== undefined) return first;
    }
    return undefined;
}

/**
 * @param {object} endpoint  a row from the endpoints table
 * @returns {{ status, body, source: 'example'|'schema'|'fallback', schema }}
 */
export function mockFromEndpoint(endpoint) {
    const responses = parse(endpoint.responses) || {};
    const status = pickStatus(endpoint.method, responses);
    const content = jsonContent(responses[String(status)]) || jsonContent(responses.default);
    const schema = content?.schema || null;

    if (status === 204) return { status, body: null, source: 'schema', schema };

    const example = exampleOf(content);
    if (example !== undefined && example !== null) return { status, body: example, source: 'example', schema };

    if (schema) {
        return { status, body: sampleFromSchema(schema, '', `${endpoint.method} ${endpoint.path}`), source: 'schema', schema };
    }
    return { status, body: fallbackBody(endpoint.method, endpoint.path), source: 'fallback', schema: null };
}
