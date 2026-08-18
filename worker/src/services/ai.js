/**
 * Cloudflare Workers AI Service
 * Model: @hf/google/gemma-7b-it  — fastest available on Workers AI free tier
 * Fallback: @cf/meta/llama-3.2-1b-instruct — tiny, near-instant
 */

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';   // ~1–3s, always available
const MODEL_FALLBACK = '@hf/google/gemma-7b-it';           // better quality, use if 1B fails
import { processModelResponse, processSingleObjectResponse, NormalizeError } from '../utils/normalizeAIResponse.js';
export function parseJSON(text) {
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

export function extractText(response) {
  if (!response) return '';
  if (Array.isArray(response) && response.length > 0) {
    response = response[0];
  }
  if (typeof response === 'string') return response;
  if (Array.isArray(response.response)) {
    return JSON.stringify(response.response);
  }
  if (response.response) return response.response;
  if (response.choices?.[0]?.message?.content) return response.choices[0].message.content;
  if (response.choices?.[0]?.text) return response.choices[0].text;
  if (response.result) return response.result;
  console.log('Unknown AI shape:', JSON.stringify(response));
  return '';
}

export async function runAI(ai, prompt, maxTokens = 800, timeoutMs = 20000, model = MODEL, geminiKey = null) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`AI timeout after ${timeoutMs}ms`)), timeoutMs)
  );
  console.log(`[AI] Prompt (${prompt.length} chars, max_tokens=${maxTokens}):`, prompt);

  try {
    const call = ai.run(model, {
      prompt,
      max_tokens: maxTokens,
      temperature: 0.1,
      stream: false,
    });
    const response = await Promise.all([call]);

    const text = extractText(response);
    if (!text || !text.trim()) {
      throw new Error('AI returned empty content');
    }

    return response;

  } catch (err) {
    console.error('[AI] Error during AI call:', err);
    const isQuotaExhausted =
      err.message?.includes('4006') ||
      err.message?.includes('daily free allocation') ||
      err.message?.includes('Workers Paid plan');

    const isTimeout = err.message?.includes('AI timeout after');

    // Retry via Gemini for BOTH quota exhaustion AND timeouts
    if (err && geminiKey) {
      console.warn(`[AI] Workers AI ${isTimeout ? 'timed out' : 'quota exhausted'} — falling back to Gemini`);
      return await runGemini(prompt, maxTokens, timeoutMs, geminiKey);
    }

    throw err;
  }
}


export async function runGemini(prompt, maxTokens, timeoutMs, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 },
        }),
        signal: controller.signal,
      }
    );

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Gemini HTTP ${res.status}`);
    }

    const text = (data.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || '')
      .join('');

    if (!text) throw new Error('Gemini returned empty response');

    const finishReason = data.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      console.warn(`[AI] Gemini finishReason: ${finishReason}`);
    }

    console.log('[AI] Gemini fallback succeeded');


    return {
      response: text,
      _model: 'gemini-2.5-flash',
      _tokensIn: data.usageMetadata?.promptTokenCount ?? null,
      _tokensOut: data.usageMetadata?.candidatesTokenCount ?? null,
    };

  } finally {
    clearTimeout(timer);
  }
}




export async function runAILogged(ai, db, prompt, maxTokens = 800, timeoutMs = 20000, opts = {}) {
  const { stage = 'unknown', projectId = null, model = MODEL, geminiKey = null } = opts;

  const t0 = Date.now();
  let rawResponse = null;
  let errMsg = null;
  let failStage = null;
  let result = null;
  let actualModel = model;
  let tokensIn = null;
  let tokensOut = null;

  try {
    rawResponse = await runAI(ai, prompt, maxTokens, timeoutMs, model, geminiKey);
    console.log(`[AI] ${stage} — raw response:`, rawResponse);
    const text = extractText(rawResponse);
    if (rawResponse?._model) actualModel = rawResponse._model;
    if (rawResponse?._tokensIn !== undefined) tokensIn = rawResponse._tokensIn;
    if (rawResponse?._tokensOut !== undefined) tokensOut = rawResponse._tokensOut;
    console.log(`[AI] ${stage} — extracted text (${text.length} chars):`, text);

    result = stage === 'bug_analysis'
      ? processSingleObjectResponse(text)   // returns bug object directly
      : processModelResponse(text);         // returns { steps, droppedInvalid, droppedDuplicates }

    return result;

  } catch (err) {
    errMsg = err.message;
    failStage = err instanceof NormalizeError ? err.stage : 'ai_call';
    throw err;

  } finally {
    const duration = Date.now() - t0;
    const text = rawResponse ? extractText(rawResponse) : null;

    if (db) {
      db.run(
        `INSERT INTO ai_logs
           (project_id, stage, model, prompt, response, parsed_ok, tokens_in, tokens_out, duration_ms, error, fail_stage)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId, stage, actualModel,
          prompt.slice(0, 10000),
          text ? text.slice(0, 10000) : null,
          result ? 1 : 0,
          tokensIn, tokensOut,
          duration, errMsg, failStage,
        ]
      ).catch(logErr => console.error('[AILog] Failed to save log:', JSON.stringify(logErr)));
    }
  }
}


function resolveSchema(schema, fullSpec = {}) {
  if (!schema) return {};

  // Handle $ref
  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/', '').replace(/^\//, '').split('/');
    let resolved = fullSpec;
    for (const part of refPath) {
      resolved = resolved?.[part];
      if (!resolved) return {};
    }
    return resolveSchema(resolved, fullSpec);
  }

  // Handle allOf — merge all schemas
  if (schema.allOf) {
    return schema.allOf.reduce((merged, sub) => {
      const resolved = resolveSchema(sub, fullSpec);
      return {
        ...merged,
        properties: { ...(merged.properties || {}), ...(resolved.properties || {}) },
        required: [...(merged.required || []), ...(resolved.required || [])],
      };
    }, {});
  }

  // Handle oneOf / anyOf — pick first option
  if (schema.oneOf || schema.anyOf) {
    return resolveSchema((schema.oneOf || schema.anyOf)[0], fullSpec);
  }

  return schema;
}

function buildEndpointContext(endpoint, fullSpec) {
  // Resolve $ref in request body
  const resolvedSchema = resolveSchema(endpoint.request_body, fullSpec);

  // Separate path, query, header params
  const params = endpoint.parameters || [];
  const pathParams = params.filter(p => p.in === 'path');
  const queryParams = params.filter(p => p.in === 'query');
  const headerParams = params.filter(p => p.in === 'header');

  // Extract all enum values from path params
  const pathEnums = {};
  for (const p of pathParams) {
    if (p.schema?.enum) pathEnums[p.name] = p.schema.enum;
  }

  // Extract expected status codes from Swagger responses
  const responses = endpoint.responses || {};
  const statusCodes = Object.entries(responses).map(([code, resp]) => ({
    code: parseInt(code),
    description: resp.description || '',
  }));

  // Detect content type
  const contentTypes = Object.keys(endpoint.request_body_content || {});
  const primaryContentType = contentTypes[0] || 'application/json';

  return {
    method: endpoint.method,
    path: endpoint.path,
    summary: endpoint.summary || '',
    description: endpoint.description || '',
    contentType: primaryContentType,
    schema: resolvedSchema,
    pathParams,
    queryParams,
    headerParams,
    pathEnums,
    statusCodes,
    hasBody: ['POST', 'PUT', 'PATCH'].includes(endpoint.method),
  };
}


function buildPrompt(ctx) {
  const pathParamSection = ctx.pathParams.length > 0 ? `
PATH PARAMETERS:
${ctx.pathParams.map(p => `
  - name: "${p.name}"
    required: ${p.required}
    description: "${p.description || ''}"
    ${p.schema?.enum ? `enum values (ONLY use these): ${JSON.stringify(p.schema.enum)}` : `type: ${p.schema?.type || 'string'}`}
    ${p.schema?.example ? `example: "${p.schema.example}"` : ''}
`).join('')}` : 'PATH PARAMETERS: none';

  const queryParamSection = ctx.queryParams.length > 0 ? `
QUERY PARAMETERS:
${ctx.queryParams.map(p => `
  - name: "${p.name}"
    required: ${p.required || false}
    ${p.schema?.enum ? `enum values: ${JSON.stringify(p.schema.enum)}` : `type: ${p.schema?.type || 'string'}`}
    ${p.default !== undefined ? `default: ${p.default}` : ''}
`).join('')}` : 'QUERY PARAMETERS: none';

  const schemaSection = ctx.hasBody ? `
REQUEST BODY (${ctx.contentType}):
${JSON.stringify(ctx.schema, null, 2)}` : 'REQUEST BODY: none (GET/DELETE endpoint)';

  const statusSection = ctx.statusCodes.length > 0 ? `
KNOWN RESPONSE CODES FROM SPEC:
${ctx.statusCodes.map(s => `  ${s.code}: ${s.description}`).join('\n')}` : '';

  const enumWarning = Object.keys(ctx.pathEnums).length > 0 ? `
CRITICAL RULES FOR PATH PARAMETERS:
${Object.entries(ctx.pathEnums).map(([name, values]) =>
    `- "${name}" MUST be one of: ${JSON.stringify(values)}
   Do NOT use any other value except when specifically testing invalid enum (use "invalid_format_xyz" for that)`
  ).join('\n')}` : '';

  const contentTypeRules = ctx.contentType === 'text/plain' ? `
CONTENT TYPE RULES:
- This endpoint accepts text/plain — request_body must be a RAW STRING, not a JSON object
- The string content must match the source format specified in the path parameter` : '';

  return `You are an expert API test engineer. Generate comprehensive test cases for this endpoint.

ENDPOINT: ${ctx.method} ${ctx.path}
SUMMARY: ${ctx.summary}
${ctx.description ? `DESCRIPTION: ${ctx.description}` : ''}

${pathParamSection}
${queryParamSection}
${schemaSection}
${statusSection}
${enumWarning}
${contentTypeRules}

INSTRUCTIONS:
1. Generate between 6 and 12 test cases covering all important scenarios
2. For each path parameter with enum values, use DIFFERENT valid enum combinations across test cases
3. The "request_body" content must be semantically correct for the format — e.g. if testing json-to-csv, the input must be valid JSON
4. Use realistic data — not placeholder strings like "test_value" or "string"
5. Cover these test types:
   - positive: valid inputs, expect 2xx
   - negative: missing required fields, invalid values, expect 4xx
   - boundary: empty values, edge cases, expect 4xx
   - security: SQL injection, XSS, oversized input
6. expected_status must come from the KNOWN RESPONSE CODES if available, otherwise use standard HTTP codes
7. query_params must always be present (use {} if none)
8. path_params must always be present for every test case

OUTPUT FORMAT — return ONLY a raw JSON array, no markdown, no explanation:
[
  {
    "name": "descriptive name of what this test verifies",
    "test_type": "positive|negative|boundary|security",
    "path_params": { "paramName": "value" },
    "query_params": {},
    "request_body": "string or object or null",
    "expected_status": 200,
    "reasoning": "one sentence explaining why this status is expected"
  }
]`;
}


function validateTestCases(cases, ctx) {
  if (!Array.isArray(cases)) return false;
  if (cases.length === 0) return false;

  for (const tc of cases) {
    // Must have all required fields
    if (!tc.name) return false;
    if (!tc.test_type) return false;
    if (!tc.expected_status) return false;
    if (tc.path_params === undefined) return false;
    if (tc.query_params === undefined) return false;

    // test_type must be valid
    const validTypes = ['positive', 'negative', 'boundary', 'security'];
    if (!validTypes.includes(tc.test_type)) return false;

    // Path params must contain all required param names
    for (const p of ctx.pathParams) {
      if (p.required && tc.path_params?.[p.name] === undefined) return false;
    }

    // Enum values must be valid (except for negative/boundary tests
    // that intentionally use invalid values)
    if (tc.test_type === 'positive') {
      for (const [name, values] of Object.entries(ctx.pathEnums)) {
        const val = tc.path_params?.[name];
        if (val && !values.includes(val) && val !== 'invalid_format_xyz') {
          return false;
        }
      }
    }
  }

  return true;
}

export async function generateTestCases(ai, endpoint, fullSpec = {}, db = null, projectId = null, geminiKey = null) {
  if (!ai) throw new Error('AI binding missing in wrangler.toml');

  // Stage 1: Build rich context
  const ctx = buildEndpointContext(endpoint, fullSpec);

  console.log(`[TestGen] ${ctx.method} ${ctx.path} — contentType: ${ctx.contentType}, pathEnums: ${JSON.stringify(ctx.pathEnums)}`);

  // Stage 2: Build prompt
  const prompt = buildPrompt(ctx);

  // Stage 3: Call AI with retry
  // runAILogged already runs the full normalization pipeline internally —
  // fence-stripping, first-JSON extraction, parse, per-step validation, dedup.
  // It returns { steps, droppedInvalid, droppedDuplicates } on success,
  // or throws NormalizeError (with .stage) / a plain Error on AI failure.
  let cases = null;
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      console.log(`[TestGen] AI attempt ${attempt}`);

      const { steps, droppedInvalid, droppedDuplicates } = await runAILogged(
        ai, db, prompt, 400, 15000,
        { stage: 'test_generation', projectId, geminiKey }
      );

      if (droppedInvalid || droppedDuplicates) {
        console.log(`[TestGen] Cleaned: dropped ${droppedInvalid} invalid, ${droppedDuplicates} duplicate cases`);
      }

      // steps are already normalized to {name, path_params, query_params,
      // request_body, expected_status, reasoning, type} — just attach content_type
      cases = steps.map(s => ({
        name: s.name,
        test_type: s.type || 'positive',
        path_params: s.path_params,
        query_params: s.query_params,
        request_body: s.request_body,
        expected_status: s.expected_status,
        reasoning: s.reasoning,
        content_type: ctx.contentType,
      }));

      console.log(`[TestGen] ✓ ${cases.length} test cases generated on attempt ${attempt}`);
      break; // success — stop retrying

    } catch (err) {
      lastError = err;
      console.warn(`[TestGen] Attempt ${attempt} failed: ${err.message}`);
      // don't throw — let the loop try attempt 2, or fall through to fallback below
    }
  }

  // Stage 4: If AI failed both attempts, use minimal rule-based fallback
  // (keep it tiny — just enough to not crash, not a full replacement)
  if (!cases) {
    console.error(`[TestGen] AI failed after 2 attempts: ${lastError?.message} — using minimal fallback`);
    cases = minimalFallback(ctx);
  }

  return cases;
}

// Minimal fallback — only used if AI completely fails both attempts
// Not trying to be smart, just returning something rather than nothing
function minimalFallback(ctx) {
  const firstEnumValues = {};
  for (const [name, values] of Object.entries(ctx.pathEnums)) {
    firstEnumValues[name] = values[0];
  }

  return [
    {
      name: 'Valid request (fallback)',
      test_type: 'positive',
      path_params: firstEnumValues,
      query_params: {},
      request_body: ctx.hasBody ? { input: 'test' } : null,
      expected_status: ctx.method === 'POST' ? 200 : 200,
      reasoning: 'AI unavailable — minimal fallback',
      content_type: ctx.contentType,
    }
  ];
}


/**
 * Clean fallback test cases when AI fails or times out
 */

/**
 * analyzeFlowStepBug
 * Single Responsibility: analyze ONE failed flow step at a time.
 * Reuses existing analyzeBug prompt structure + adds flow context.
 * Called sequentially per failed step — not all at once.
 */
export async function analyzeFlowStepBug(ai, { step, result, endpoint, suiteContext }, db = null, projectId = null, geminiKey = null) {
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

    const response = await runAILogged(ai, db, prompt, maxTokens, timeoutMs, {
      stage: 'flow_step_analysis',
      projectId,
      geminiKey: geminiKey
    });
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

export async function analyzeBug(ai, { endpoint, testCase, result }, db = null, projectId = null, geminiKey = null) {
  if (!ai || result.status === 'passed') return null;
  try {
    const prompt = `Output ONLY a JSON object analyzing this failed API test:
${endpoint.method} ${endpoint.path} — expected ${testCase.expected_status} got ${result.actual_status}
Response: ${JSON.stringify(result.actual_body || {}).slice(0, 150)}

{"severity":"high|medium|low","title":"short","description":"what went wrong","root_cause":"why","suggested_fix":"how to fix"}

JSON only.`;

    const response = await runAILogged(ai, db, prompt, 300, 12000, {
      stage: 'bug_analysis',
      projectId,
      geminiKey: geminiKey
    });
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

export async function detectWorkflows(ai, endpoints, db = null, projectId = null, geminiKey = null) {
  if (!ai || !endpoints.length) return [];
  try {
    const list = endpoints.slice(0, 12).map(e => `${e.method} ${e.path}`).join('\n');
    const prompt = `Output ONLY a JSON array of API workflow chains from these endpoints:
${list}

[{"name":"workflow name","steps":[{"method":"GET","path":"/example","action":"description"}]}]

JSON only.`;

    const response = await runAILogged(ai, db, prompt, 300, 12000, {
      stage: 'workflow_detection',
      projectId,
      geminiKey: geminiKey
    });
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

export async function generateTestData(ai, schema, db = null, projectId = null, geminiKey = null) {
  if (!ai) return [];
  try {
    const prompt = `Output ONLY a JSON array of 3 realistic test data objects for schema: ${JSON.stringify(schema).slice(0, 200)}
JSON array only.`;
    const response = await runAILogged(ai, db, prompt, 300, 12000, {
      stage: 'test_data_generation',
      projectId,
      geminiKey: geminiKey
    });
    const text = extractText(response);
    if (!text) return [];
    return parseJSON(text);
  } catch { return []; }
}