/**
 * Test Executor
 * Supports: retries, timeouts, parallel batches, login-first auth flow
 */

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_RETRIES = 2;
const BATCH_SIZE = 5;

/**
 * Step 1 (optional): Login and extract a bearer token
 * auth_config shape for login flow:
 * {
 *   login_url: "https://api.example.com/auth/login",
 *   login_body: { "email": "test@test.com", "password": "secret" },
 *   token_path: "data.token"   // dot-path into the response JSON
 * }
 */
export async function performLogin(project) {
  const authConfig = project.auth_config ? JSON.parse(project.auth_config) : {};

  if (project.auth_type !== 'login_flow') return null;
  if (!authConfig.login_url || !authConfig.login_body) {
    throw new Error('login_flow requires login_url and login_body in auth_config');
  }

  console.log(`Auth: logging in at ${authConfig.login_url}`);

  const response = await fetch(authConfig.login_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(authConfig.login_body)
  });

  const data = await response.json().catch(() => ({}));

  console.log(`Auth login response: ${response.status}`, JSON.stringify(data).slice(0, 200));

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} — ${JSON.stringify(data).slice(0, 100)}`);
  }

  // Extract token from response using dot-path e.g. "data.token" or "access_token"
  const tokenPath = authConfig.token_path || 'token';
  const token = tokenPath.split('.').reduce((obj, key) => obj?.[key], data);

  if (!token) {
    throw new Error(`Could not find token at path "${tokenPath}" in login response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  console.log(`Auth: token extracted successfully (${String(token).length} chars)`);
  return String(token);
}

/**
 * Build the HTTP request for a test case
 * runtimeToken: token obtained from login flow (overrides static config)
 */
function buildRequest(testCase, endpoint, project, runtimeToken = null) {
  const params = testCase.input_params ? JSON.parse(testCase.input_params) : {};
  const headers = testCase.input_headers ? JSON.parse(testCase.input_headers) : {};
  const payload = testCase.input_payload ? JSON.parse(testCase.input_payload) : null;

  // Resolve path params
  let path = endpoint.path;
  for (const [key, val] of Object.entries(params)) {
    path = path.replace(`{${key}}`, encodeURIComponent(String(val)));
  }

  // Build query string from non-path params
  const queryParams = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (!endpoint.path.includes(`{${key}}`)) queryParams.set(key, val);
  }
  const qs = queryParams.toString();
  const url = `${project.base_url}${path}${qs ? '?' + qs : ''}`;

  // Auth — runtime token from login flow takes priority
  const authConfig = project.auth_config ? JSON.parse(project.auth_config) : {};
  const token = runtimeToken || authConfig.token;

  switch (project.auth_type) {
    case 'bearer':
    case 'login_flow':
      if (token) headers['Authorization'] = `Bearer ${token}`;
      break;
    case 'basic': {
      const encoded = btoa(`${authConfig.username || ''}:${authConfig.password || ''}`);
      headers['Authorization'] = `Basic ${encoded}`;
      break;
    }
    case 'apikey':
      headers[authConfig.header || 'X-API-Key'] = authConfig.key || '';
      break;
  }

  if (payload && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return { url, method: endpoint.method, headers, body: payload ? JSON.stringify(payload) : undefined };
}

/**
 * Execute a single test case with retries
 */
async function executeOne(testCase, endpoint, project, runtimeToken, retries = DEFAULT_RETRIES) {
  const req = buildRequest(testCase, endpoint, project, runtimeToken);
  const startTime = Date.now();

  console.log(`RUN [${endpoint.method}] ${req.url}`);
  if (req.body) console.log('Request body:', req.body.slice(0, 300));

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: controller.signal
      });
      clearTimeout(timeout);

      const responseTime = Date.now() - startTime;

      let actualBody = null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try { actualBody = await response.json(); } catch { actualBody = null; }
      } else {
        const text = await response.text();
        actualBody = text ? { _text: text.slice(0, 500) } : null;
      }

      const actualHeaders = {};
      for (const [k, v] of response.headers.entries()) actualHeaders[k] = v;

      console.log(`RESULT [${endpoint.method}] ${endpoint.path} → ${response.status} (${responseTime}ms)`);
      if (actualBody) console.log('Response body:', JSON.stringify(actualBody).slice(0, 300));

      // Validate status
      const expectedStatus = testCase.expected_status;
      const statusMatch = !expectedStatus || response.status === expectedStatus;

      // Validate schema
      let schemaValid = true, schemaError = null;
      if (testCase.expected_schema && actualBody) {
        try {
          const schema = JSON.parse(testCase.expected_schema);
          const validation = validateSchema(actualBody, schema);
          schemaValid = validation.valid;
          schemaError = validation.error;
        } catch { /* ignore schema parse errors */ }
      }

      const passed = statusMatch && schemaValid;

      return {
        test_case_id: testCase.id,
        endpoint_id: endpoint.id,
        status: passed ? 'passed' : 'failed',
        actual_status: response.status,
        actual_body: actualBody,
        actual_headers: actualHeaders,
        response_time_ms: responseTime,
        failure_reason: passed ? null
          : !statusMatch
            ? `Expected status ${expectedStatus}, got ${response.status}`
            : `Schema mismatch: ${schemaError}`
      };
    } catch (err) {
      if (attempt === retries) {
        console.error(`ERROR [${endpoint.method}] ${endpoint.path}:`, err.message);
        return {
          test_case_id: testCase.id,
          endpoint_id: endpoint.id,
          status: 'error',
          actual_status: null,
          actual_body: null,
          actual_headers: null,
          response_time_ms: Date.now() - startTime,
          failure_reason: err.name === 'AbortError' ? `Timeout after ${DEFAULT_TIMEOUT_MS}ms` : err.message
        };
      }
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
  }
}

function validateSchema(data, schema) {
  if (!schema?.type) return { valid: true };
  if (schema.type === 'object' && schema.properties) {
    if (typeof data !== 'object' || Array.isArray(data)) return { valid: false, error: 'Expected object' };
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (data[key] !== undefined) {
        const r = validateSchema(data[key], propSchema);
        if (!r.valid) return { valid: false, error: `${key}: ${r.error}` };
      } else if (schema.required?.includes(key)) {
        return { valid: false, error: `Missing required field: ${key}` };
      }
    }
  }
  if (schema.type === 'array' && !Array.isArray(data)) return { valid: false, error: 'Expected array' };
  if (schema.type === 'string' && typeof data !== 'string') return { valid: false, error: `Expected string, got ${typeof data}` };
  if (schema.type === 'number' && typeof data !== 'number') return { valid: false, error: `Expected number, got ${typeof data}` };
  return { valid: true };
}

/**
 * Main: run all test cases
 * Returns results + summary + runtimeToken (if login flow used)
 */
export async function executeAll(testCases, endpoints, project) {
  const endpointsMap = Object.fromEntries(endpoints.map(e => [e.id, e]));

  // Login flow — get token once, reuse for all requests
  let runtimeToken = null;
  let loginResult = null;
  if (project.auth_type === 'login_flow') {
    try {
      runtimeToken = await performLogin(project);
      loginResult = { success: true, message: `Login succeeded — token injected into all ${testCases.length} requests` };
    } catch (err) {
      loginResult = { success: false, message: err.message };
      console.error('Login flow failed:', err.message);
      // Don't abort — run tests without token so you can see which ones fail auth
    }
  }

  const results = [];
  for (let i = 0; i < testCases.length; i += BATCH_SIZE) {
    const batch = testCases.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(tc => {
        const endpoint = endpointsMap[tc.endpoint_id];
        if (!endpoint) return Promise.resolve({
          test_case_id: tc.id, endpoint_id: tc.endpoint_id,
          status: 'skipped', failure_reason: 'Endpoint not found'
        });
        return executeOne(tc, endpoint, project, runtimeToken);
      })
    );
    results.push(...batchResults);
    if (i + BATCH_SIZE < testCases.length) await new Promise(r => setTimeout(r, 200));
  }

  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const errors = results.filter(r => r.status === 'error').length;
  const skipped = results.filter(r => r.status === 'skipped').length;

  return {
    results,
    loginResult,
    summary: {
      total: results.length,
      passed,
      failed: failed + errors,
      skipped,
      pass_rate: results.length ? Math.round((passed / results.length) * 100) : 0
    }
  };
}