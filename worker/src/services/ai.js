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
    // Fix common model mistake: missing commas between array objects
    // e.g. "}\n  {" → "},\n  {"
    const fixed = text
      .replace(/\}\s*\n\s*\{/g, '},\n  {')   // missing comma between objects
      .replace(/\}\s*\{/g, '},{')             // no whitespace version
      .trim();
    try { return JSON.parse(fixed); } catch { }

    // Try to pull any JSON array out of the text
    const match = fixed.match(/\[[\s\S]*?\]/s);
    if (match) {
      try { return JSON.parse(match[0]); } catch {
        // Last resort: fix the extracted match too
        const fixedMatch = match[0].replace(/\}\s*\n\s*\{/g, '},\n  {').replace(/\}\s*\{/g, '},{');
        try { return JSON.parse(fixedMatch); } catch { }
      }
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

  // Extract real field names from schema
  const schema = endpoint.request_body;
  let fields = schema?.properties ? Object.keys(schema.properties) : [];
  let requiredFields = schema?.required || [];

  console.log(`[TestGen] ${endpoint.method} ${endpoint.path} — schema fields: [${fields.join(', ')}]`);
  console.log(`[TestGen] request_body:`, JSON.stringify(schema)?.slice(0, 300));

  // If schema has no properties, infer fields from path name
  if (fields.length === 0 && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
    const path = endpoint.path.toLowerCase();
    if (path.includes('login') || path.includes('signin')) {
      fields = ['email', 'password'];
      requiredFields = ['email', 'password'];
    } else if (path.includes('signup') || path.includes('register')) {
      fields = ['email', 'password', 'name'];
      requiredFields = ['email', 'password', 'name'];
    } else if (path.includes('user')) {
      fields = ['email', 'name', 'role'];
      requiredFields = ['email', 'name'];
    } else if (path.includes('project')) {
      fields = ['name', 'description'];
      requiredFields = ['name'];
    } else if (path.includes('task')) {
      fields = ['title', 'description', 'status'];
      requiredFields = ['title'];
    } else if (path.includes('auth')) {
      fields = ['email', 'password'];
      requiredFields = ['email', 'password'];
    } else {
      fields = ['name', 'description'];
      requiredFields = ['name'];
    }
    console.log(`[TestGen] No schema — inferred fields from path: [${fields.join(', ')}]`);
  }

  // Use schema properties for types if available, otherwise guess from field name
  const schemaProps = schema?.properties || {};

  // Build realistic example values based on field names
  function exampleValue(fieldName, fieldSchema) {
    const name = fieldName.toLowerCase();
    if (fieldSchema?.example !== undefined) return fieldSchema.example;
    if (fieldSchema?.enum) return fieldSchema.enum[0];
    if (name.includes('email')) return 'test@example.com';
    if (name.includes('password')) return 'Test@123456';
    if (name.includes('name') && name.includes('user')) return 'Test User';
    if (name.includes('firstname') || name === 'first_name') return 'John';
    if (name.includes('lastname') || name === 'last_name') return 'Doe';
    if (name.includes('name')) return 'Test Name';
    if (name.includes('phone')) return '+919876543210';
    if (name.includes('url')) return 'https://example.com';
    if (name.includes('title')) return 'Test Title';
    if (name.includes('description') || name.includes('desc')) return 'Test description';
    if (name.includes('age')) return 25;
    if (name.includes('count') || name.includes('qty') || name.includes('quantity')) return 1;
    if (name.includes('price') || name.includes('amount')) return 100;
    if (name.includes('date')) return '2024-01-01';
    if (name.includes('id')) return '123';
    if (name.includes('status')) return 'active';
    if (name.includes('token')) return 'test-token-123';
    if (fieldSchema?.type === 'boolean') return true;
    if (fieldSchema?.type === 'integer' || fieldSchema?.type === 'number') return 1;
    return 'test_value';
  }

  // Build valid payload from real schema
  let validPayload = null;
  let missingPayload = null;
  let emptyPayload = null;
  let injectionPayload = null;

  if (fields.length > 0) {
    // Valid: all fields with realistic values
    validPayload = {};
    fields.forEach(f => {
      validPayload[f] = exampleValue(f, schemaProps[f] || {});
    });

    // Missing required: omit one required field
    if (requiredFields.length > 0) {
      missingPayload = { ...validPayload };
      delete missingPayload[requiredFields[0]];
    } else {
      missingPayload = {};
    }

    // Empty values: all fields empty
    emptyPayload = {};
    fields.forEach(f => { emptyPayload[f] = ''; });

    // SQL injection in first string field
    injectionPayload = { ...validPayload };
    const firstStrField = fields.find(f => !schemaProps[f]?.type || schemaProps[f]?.type === 'string');
    if (firstStrField) injectionPayload[firstStrField] = "'; DROP TABLE users; --";
  }

  // Path param handling
  const pathParams = (endpoint.parameters || []).filter(p => p.in === 'path');
  const queryParams = (endpoint.parameters || []).filter(p => p.in === 'query');

  const validParams = {};
  pathParams.forEach(p => { validParams[p.name] = p.example || '1'; });
  queryParams.forEach(p => { validParams[p.name] = p.example || p.default || 'test'; });

  const method = endpoint.method;
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);

  // Return rule-based test cases using real schema — no AI needed for this
  return [
    {
      name: 'Valid request',
      type: 'positive',
      input_payload: hasBody ? validPayload : null,
      input_params: Object.keys(validParams).length ? validParams : null,
      expected_status: method === 'POST' ? 201 : 200,
      ai_reasoning: `Happy path — valid inputs with realistic values should return ${method === 'POST' ? '201 Created' : '200 OK'}`
    },
    {
      name: requiredFields.length > 0 ? `Missing required field: ${requiredFields[0]}` : 'Missing required field',
      type: 'negative',
      input_payload: hasBody ? missingPayload : null,
      input_params: Object.keys(validParams).length ? validParams : null,
      expected_status: method === 'GET' ? 404 : 400,
      ai_reasoning: `Omitting required field "${requiredFields[0] || 'field'}" should return 400 Bad Request`
    },
    {
      name: 'Empty / null values',
      type: 'boundary',
      input_payload: hasBody ? emptyPayload : null,
      input_params: pathParams.length ? Object.fromEntries(pathParams.map(p => [p.name, ''])) : null,
      expected_status: 400,
      ai_reasoning: 'Edge case: empty string values should be rejected with 400'
    },
    {
      name: 'SQL injection attempt',
      type: 'security',
      input_payload: hasBody ? injectionPayload : null,
      input_params: Object.keys(validParams).length ? validParams : null,
      expected_status: 400,
      ai_reasoning: 'Security: SQL injection payload should be sanitized and rejected'
    }
  ];
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