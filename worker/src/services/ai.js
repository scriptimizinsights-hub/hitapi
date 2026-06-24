/**
 * Cloudflare Workers AI Service
 * Model: @hf/google/gemma-7b-it  — fastest available on Workers AI free tier
 * Fallback: @cf/meta/llama-3.2-1b-instruct — tiny, near-instant
 */

const MODEL = '@cf/meta/llama-3.2-1b-instruct';   // ~1–3s, always available
const MODEL_FALLBACK = '@hf/google/gemma-7b-it';           // better quality, use if 1B fails

function parseJSON(text) {
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch {
    // Try to pull any JSON array out of the text
    const match = text.match(/\[[\s\S]*?\]/s);
    if (match) {
      try { return JSON.parse(match[0]); } catch { }
    }
    // Try JSON object
    const objMatch = text.match(/\{[\s\S]*?\}/s);
    if (objMatch) {
      try {
        const obj = JSON.parse(objMatch[0]);
        return Array.isArray(obj) ? obj : [obj];
      } catch { }
    }
    console.error('Non-JSON from AI:', text.slice(0, 300));
    throw new Error('AI returned non-JSON');
  }
}

function extractText(response) {
  if (!response) return '';
  if (typeof response === 'string') return response;
  if (response.response) return response.response;
  if (response.choices?.[0]?.message?.content) return response.choices[0].message.content;
  if (response.choices?.[0]?.text) return response.choices[0].text;
  if (response.result) return response.result;
  console.log('Unknown AI shape:', JSON.stringify(response).slice(0, 100));
  return '';
}

async function runAI(ai, prompt, maxTokens = 800, timeoutMs = 20000) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`AI timeout after ${timeoutMs}ms`)), timeoutMs)
  );
  const call = ai.run(MODEL, {
    prompt,
    max_tokens: maxTokens,
    temperature: 0.1,
    stream: false
  });
  return Promise.race([call, timeout]);
}

export async function generateTestCases(ai, endpoint) {
  if (!ai) throw new Error('AI binding missing in wrangler.toml');

  // Ultra-short prompt — fewer tokens = faster response
  const bodyStr = endpoint.request_body
    ? JSON.stringify(endpoint.request_body).slice(0, 200)
    : 'none';

  const prompt = `Output ONLY a JSON array of 4 API test cases for: ${endpoint.method} ${endpoint.path}
Body schema: ${bodyStr}

Format (fill realistic values):
[{"name":"str","type":"positive|negative|boundary|security","input_payload":{},"input_params":{},"expected_status":200,"ai_reasoning":"str"}]

JSON array only, no text before or after.`;

  console.log(`AI generating tests for ${endpoint.method} ${endpoint.path}`);
  console.log('AI REQUEST >>>', prompt);

  let response;
  try {
    response = await runAI(ai, prompt, 600, 18000);
  } catch (err) {
    console.error(`AI timeout/error for ${endpoint.path}:`, err.message);
    // Return rule-based fallback instead of failing
    return fallbackTestCases(endpoint);
  }

  const text = extractText(response);
  console.log('AI RESPONSE >>>', text);

  if (!text || text.length < 10) {
    console.warn('AI returned empty, using fallback');
    return fallbackTestCases(endpoint);
  }

  try {
    const cases = parseJSON(text);
    if (!Array.isArray(cases) || cases.length === 0) {
      return fallbackTestCases(endpoint);
    }
    console.log(`Generated ${cases.length} cases for ${endpoint.path}`);
    return cases;
  } catch {
    console.warn('Parse failed, using fallback for', endpoint.path);
    return fallbackTestCases(endpoint);
  }
}

/**
 * Rule-based fallback — always works, no AI needed.
 * Used when AI times out or returns garbage.
 */
function fallbackTestCases(endpoint) {
  const method = endpoint.method;
  const hasBody = method === 'POST' || method === 'PUT' || method === 'PATCH';
  const params = (endpoint.parameters || []);
  const pathParams = params.filter(p => p.in === 'path');
  const sampleId = pathParams.length ? { [pathParams[0].name]: '123' } : null;

  const cases = [
    {
      name: 'Valid request',
      type: 'positive',
      input_payload: hasBody ? { sample: 'value' } : null,
      input_params: sampleId,
      expected_status: method === 'POST' ? 201 : 200,
      ai_reasoning: 'Happy path — valid inputs should return success'
    },
    {
      name: method === 'GET' ? 'Non-existent resource' : 'Missing required field',
      type: 'negative',
      input_payload: hasBody ? {} : null,
      input_params: method === 'GET' && sampleId ? { [pathParams[0]?.name]: 'nonexistent-999' } : sampleId,
      expected_status: method === 'GET' ? 404 : 400,
      ai_reasoning: 'Invalid input should return 4xx error'
    },
    {
      name: 'Empty / null values',
      type: 'boundary',
      input_payload: hasBody ? { sample: '' } : null,
      input_params: sampleId ? { [pathParams[0]?.name]: '' } : null,
      expected_status: 400,
      ai_reasoning: 'Edge case: empty string / null should be rejected'
    },
    {
      name: 'SQL injection attempt',
      type: 'security',
      input_payload: hasBody ? { sample: "'; DROP TABLE users; --" } : null,
      input_params: sampleId ? { [pathParams[0]?.name]: "1' OR '1'='1" } : null,
      expected_status: 400,
      ai_reasoning: 'Security: SQL injection payload should be rejected'
    }
  ];

  console.log(`Fallback test cases generated for ${endpoint.method} ${endpoint.path}`);
  return cases;
}

export async function analyzeBug(ai, { endpoint, testCase, result }) {
  if (!ai || result.status === 'passed') return null;
  try {
    const prompt = `Output ONLY a JSON object analyzing this failed API test:
${endpoint.method} ${endpoint.path} — expected ${testCase.expected_status} got ${result.actual_status}
Response: ${JSON.stringify(result.actual_body || {}).slice(0, 150)}

{"severity":"high|medium|low","title":"short","description":"what went wrong","root_cause":"why","suggested_fix":"how to fix"}

JSON only.`;

    const response = await runAI(ai, prompt, 300, 12000);
    const text = extractText(response);
    console.log('Bug AI response:', text);
    if (!text) return null;
    return parseJSON(text);
  } catch (err) {
    console.error('Bug analysis failed:', err.message);
    // Rule-based fallback for bug analysis
    return {
      severity: result.actual_status >= 500 ? 'high' : 'medium',
      title: `${endpoint.method} ${endpoint.path} — unexpected ${result.actual_status}`,
      description: `Expected ${testCase.expected_status}, got ${result.actual_status}`,
      root_cause: result.actual_status >= 500 ? 'Server error — check logs' : 'Input validation issue',
      suggested_fix: result.actual_status >= 500 ? 'Check server logs for stack trace' : 'Verify input validation handles this case'
    };
  }
}

export async function detectWorkflows(ai, endpoints) {
  if (!ai || !endpoints.length) return [];
  try {
    const list = endpoints.slice(0, 12).map(e => `${e.method} ${e.path}`).join('\n');
    const prompt = `Output ONLY a JSON array of API workflow chains from these endpoints:
${list}

[{"name":"workflow name","steps":[{"method":"GET","path":"/example","action":"description"}]}]

JSON only.`;

    const response = await runAI(ai, prompt, 500, 12000);
    const text = extractText(response);
    if (!text) return [];
    return parseJSON(text);
  } catch { return []; }
}

export async function generateRecommendations(ai, { bugs, failedResults }) {
  if (!bugs.length && !failedResults.length) {
    return [{ type: 'success', category: 'reliability', message: 'All tests passed. API looks healthy!' }];
  }
  // Rule-based recommendations — no AI needed
  const recs = [];
  const highBugs = bugs.filter(b => b.severity === 'high' || b.severity === 'critical');
  if (highBugs.length) recs.push({ type: 'critical', category: 'reliability', message: `${highBugs.length} high-severity bug(s) detected — fix before deploying` });
  const securityBugs = bugs.filter(b => b.title?.toLowerCase().includes('inject') || b.title?.toLowerCase().includes('xss'));
  if (securityBugs.length) recs.push({ type: 'critical', category: 'security', message: 'Security vulnerabilities detected — sanitize all inputs' });
  if (failedResults.length > failedResults.length * 0.3) recs.push({ type: 'warning', category: 'validation', message: 'Many validation tests failing — review input schema enforcement' });
  if (!recs.length) recs.push({ type: 'info', category: 'reliability', message: 'Some tests failed — review the bugs tab for details' });
  return recs;
}

export async function generateTestData(ai, schema) {
  if (!ai) return [];
  try {
    const prompt = `Output ONLY a JSON array of 3 realistic test data objects for schema: ${JSON.stringify(schema).slice(0, 200)}
JSON array only.`;
    const response = await runAI(ai, prompt, 400, 10000);
    const text = extractText(response);
    if (!text) return [];
    return parseJSON(text);
  } catch { return []; }
}