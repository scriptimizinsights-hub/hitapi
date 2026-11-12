/**
 * services/mock/aiMock.js — asks Workers AI for a realistic response body.
 *
 * The schema-based sample is always made first; AI only replaces it when it
 * returns valid JSON of the same shape (object vs array). Any failure keeps
 * the schema sample, so a mock never ends up empty or broken.
 */

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const TIMEOUT_MS = 20000;

function textOf(res) {
    if (!res) return '';
    if (typeof res === 'string') return res;
    if (typeof res.response === 'string') return res.response;
    if (res.response && typeof res.response === 'object') return JSON.stringify(res.response);
    if (res.result?.response) return res.result.response;
    if (res.choices?.[0]?.message?.content) return res.choices[0].message.content;
    return '';
}

function extractJson(text) {
    const clean = String(text).replace(/```(?:json)?/gi, '').trim();
    try { return JSON.parse(clean); } catch { /* try the outermost {...} or [...] */ }
    const first = clean.search(/[[{]/);
    if (first < 0) return undefined;
    const open = clean[first];
    const close = open === '{' ? '}' : ']';
    const last = clean.lastIndexOf(close);
    if (last <= first) return undefined;
    try { return JSON.parse(clean.slice(first, last + 1)); } catch { return undefined; }
}

const shapeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

/**
 * @param {object} ai        env.AI binding
 * @param {object} endpoint  { method, path, summary, description }
 * @param {object} schema    response JSON schema (may be null)
 * @param {*} baseline       the schema-based sample; also the shape to keep
 * @returns {Promise<*>}     the AI body, or undefined to keep the baseline
 */
export async function aiResponseBody(ai, endpoint, schema, baseline) {
    if (!ai) return undefined;
    const schemaText = schema ? JSON.stringify(schema).slice(0, 2500) : 'not provided';
    const baselineText = JSON.stringify(baseline).slice(0, 1500);
    const prompt = `You generate realistic mock API responses for frontend developers.
Endpoint: ${endpoint.method} ${endpoint.path}${endpoint.summary ? ` (${endpoint.summary})` : ''}
Response JSON schema: ${schemaText}
Current placeholder response: ${baselineText}

Return ONLY the JSON response body (no prose, no markdown). Keep exactly the same structure, field names and types as the placeholder, but use realistic, varied, internally consistent values that fit this API's domain (real-looking names, emails, prices, dates in 2026, IDs). Arrays should have 3 items.`;

    try {
        const call = ai.run(MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 900, temperature: 0.4 });
        const res = await Promise.race([
            call,
            new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), TIMEOUT_MS)),
        ]);
        const body = extractJson(textOf(res));
        if (body === undefined || shapeOf(body) !== shapeOf(baseline)) return undefined;
        return body;
    } catch (e) {
        console.warn('[Mock AI]', endpoint.method, endpoint.path, e.message);
        return undefined;
    }
}
