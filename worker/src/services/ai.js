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

  const method = endpoint.method;
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);

  // Ask AI to generate structured test cases based on full endpoint context
  const schemaStr = JSON.stringify(endpoint.request_body || {}).slice(0, 1000);
  const paramsStr = JSON.stringify(endpoint.parameters || []);

  const prompt = `You are an API testing expert. Generate exactly 4 realistic test cases for this API endpoint.
  
Endpoint: ${method} ${endpoint.path}
Summary: ${endpoint.summary || ''}
Schema: ${schemaStr}
Parameters: ${paramsStr}

Each test case MUST include ALL of these fields:
{
  "name": "descriptive test name",
  "type": "positive" | "negative" | "boundary" | "security",
  "input_payload": { ... } or null (if no body is expected),
  "input_params": { ... } or null (if no query/path params exist),
  "expected_status": number,
  "ai_reasoning": "brief explanation"
}

Ensure you generate cases representing:
1. "positive": A successful request with valid data.
2. "negative": A bad request missing a required field, or using invalid data.
3. "boundary": A test with empty, null, or extreme values.
4. "security": A test containing SQL/XSS/Command injection payloads.

Return ONLY a valid JSON array of these 4 test case objects, nothing else.`;

  console.log(`[TestGen] Querying AI to generate test cases for ${method} ${endpoint.path}`);

  try {
    const response = await runAI(ai, prompt, 1000, 20000);
    const text = extractText(response);

    if (text) {
      const generatedCases = parseJSON(text);
      if (Array.isArray(generatedCases) && generatedCases.length > 0) {
        console.log(`[TestGen] Successfully generated ${generatedCases.length} test cases via AI.`);
        return generatedCases;
      }
    }
  } catch (err) {
    console.warn(`[TestGen] AI generation failed for ${endpoint.path}: ${err.message}`);
  }

  // AI failed — fall back to structured fallback test cases without rule guesses
  return fallbackTestCases(endpoint);
}

/**
 * Clean fallback test cases when AI fails or times out
 */
function fallbackTestCases(endpoint) {
  const method = endpoint.method;
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const params = endpoint.parameters || [];
  const pathParams = params.filter(p => p.in === 'path');

  const sampleParams = pathParams.length
    ? { [pathParams[0].name]: '123' }
    : null;

  console.log(`[TestGen] Falling back to default structural test cases for ${method} ${endpoint.path}`);

  return [
    {
      name: 'Valid request (Fallback)',
      type: 'positive',
      input_payload: hasBody ? {} : null,
      input_params: sampleParams,
      expected_status: method === 'POST' ? 201 : 200,
      ai_reasoning: 'Fallback: Basic structural positive test verification.'
    },
    {
      name: 'Empty body / Invalid request (Fallback)',
      type: 'negative',
      input_payload: hasBody ? null : null,
      input_params: sampleParams,
      expected_status: 400,
      ai_reasoning: 'Fallback: Testing behavior with an empty request body payload.'
    },
    {
      name: 'Empty parameter boundaries (Fallback)',
      type: 'boundary',
      input_payload: hasBody ? {} : null,
      input_params: pathParams.length ? { [pathParams[0].name]: '' } : null,
      expected_status: 400,
      ai_reasoning: 'Fallback: Parameter boundary evaluation using empty string input.'
    },
    {
      name: 'SQL injection attempt (Fallback)',
      type: 'security',
      input_payload: hasBody ? { input: "'; DROP TABLE users; --" } : null,
      input_params: sampleParams,
      expected_status: 400,
      ai_reasoning: 'Fallback: Security check verifying sanitization against injection payloads.'
    }
  ];
}

/**
 * analyzeFlowStepBug
 * Single Responsibility: analyze ONE failed flow step at a time.
 * Reuses existing analyzeBug prompt structure + adds flow context.
 * Called sequentially per failed step — not all at once.
 */
export async function analyzeFlowStepBug(ai, { step, result, endpoint, suiteContext }) {
  if (!ai || result.status === 'passed') return null;

  try {
    // Build minimal focused context for this ONE step
    const stepContext = {
      method: step.method || result.request_method,
      path: endpoint?.path || step.endpoint_path || result.request_url,
      expected_status: step.expected_status,
      actual_status: result.actual_status,
      request_body: result.request_body
        ? JSON.stringify(result.request_body).slice(0, 200)
        : null,
      response_body: result.actual_body
        ? JSON.stringify(result.actual_body).slice(0, 200)
        : null,
      failure_reason: result.failure_reason,
      // Flow-specific context
      had_token: !!suiteContext?.token,
      previous_passed: suiteContext?.previousPassed ?? true,
      step_order: step.step_order,
    };

    const prompt = `Analyze this ONE failed API test step and output ONLY a JSON object:

Endpoint: ${stepContext.method} ${stepContext.path}
Expected: ${stepContext.expected_status}, Got: ${stepContext.actual_status}
Request body: ${stepContext.request_body || 'none'}
Response: ${stepContext.response_body || 'none'}
Had auth token: ${stepContext.had_token}
Failure reason: ${stepContext.failure_reason || 'status mismatch'}

Output this exact JSON (no markdown, no extra text):
{"severity":"high|medium|low","title":"short title under 60 chars","description":"what went wrong in 1-2 sentences","root_cause":"why this specific request failed","suggested_fix":"concrete action to fix this"}`;

    const response = await runAI(ai, prompt, 300, 12000);
    const text = extractText(response);
    if (!text) return ruleBugFallback(stepContext);
    const parsed = parseJSON(text);
    // Reject if AI echoed the prompt template literally
    if (parsed && parsed.title && (
      parsed.title.toLowerCase().includes('short title') ||
      parsed.title.toLowerCase().includes('under 60 chars') ||
      parsed.title.toLowerCase().includes('title here') ||
      parsed.severity === 'high|medium|low'
    )) {
      return ruleBugFallback(stepContext);
    }
    return parsed || ruleBugFallback(stepContext);
  } catch (err) {
    console.error(`[BugAnalysis] Failed for step ${step.step_order}:`, err.message);
    return ruleBugFallback({
      method: step.method,
      path: endpoint?.path || step.endpoint_path,
      expected_status: step.expected_status,
      actual_status: result.actual_status,
    });
  }
}

function ruleBugFallback({ method, path, expected_status, actual_status }) {
  const status = actual_status;
  return {
    severity: status >= 500 ? 'high' : status === 401 || status === 403 ? 'high' : 'medium',
    title: `${method} ${path} — expected ${expected_status}, got ${status}`,
    description: `Request returned ${status} instead of ${expected_status}.`,
    root_cause: status === 401 ? 'Missing or invalid auth token'
      : status === 403 ? 'Insufficient permissions'
        : status === 404 ? 'Resource not found — id may be wrong'
          : status === 400 ? 'Invalid request body or missing required fields'
            : status >= 500 ? 'Server error — check API logs'
              : 'Unexpected response status',
    suggested_fix: status === 401 ? 'Ensure login step succeeds and token is extracted correctly'
      : status === 403 ? 'Check user role/permissions for this endpoint'
        : status === 404 ? 'Verify the resource ID is extracted correctly from previous steps'
          : status === 400 ? 'Edit the request body to include all required fields'
            : status >= 500 ? 'Check server logs for stack trace'
              : 'Review request and expected status',
  };
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