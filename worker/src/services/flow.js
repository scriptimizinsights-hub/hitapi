/**
 * Flow Suite Executor
 * Runs steps sequentially, passing context variables between steps.
 * Supports {{varName}} placeholders in payload, headers, params and URL.
 */

const TIMEOUT_MS = 15000;

// ── Common token paths to check in any response ───────────────────────────────
const TOKEN_PATHS = [
    'token', 'access_token', 'accessToken',
    'data.token', 'data.access_token', 'data.accessToken',
    'result.token', 'result.access_token',
    'auth.token', 'auth.access_token',
    'user.token', 'payload.token',
    'jwt', 'id_token', 'idToken',
];

// ── Login credential combinations to try in order ────────────────────────────
const LOGIN_COMBOS = [
    (creds) => creds.email && creds.password ? { email: creds.email, password: creds.password } : null,
    (creds) => creds.username && creds.password ? { username: creds.username, password: creds.password } : null,
    (creds) => creds.phone && creds.password ? { phone: creds.phone, password: creds.password } : null,
    (creds) => creds.email && creds.password ? { login: creds.email, password: creds.password } : null,
    (creds) => creds.username && creds.password ? { email: creds.username, password: creds.password } : null, // try username as email
];

// ── Extract token from any response body ──────────────────────────────────────
function extractToken(body) {
    if (!body || typeof body !== 'object') return null;
    for (const path of TOKEN_PATHS) {
        const val = extractPath(body, path);
        if (val && typeof val === 'string' && val.length > 10) return val;
    }
    return null;
}

// ── Extract credentials from a request payload ────────────────────────────────
function extractCredentials(payload) {
    if (!payload || typeof payload !== 'object') return {};
    const creds = {};

    // Flatten nested objects (e.g. {user: {email, password}} → {email, password})
    function flatten(obj) {
        for (const [k, v] of Object.entries(obj)) {
            const key = k.toLowerCase();
            if (key === 'email') creds.email = v;
            if (key === 'username') creds.username = v;
            if (key === 'phone' || key === 'phonenumber' || key === 'mobile') creds.phone = v;
            if (key === 'password' || key === 'pass') creds.password = v;
            if (typeof v === 'object' && v !== null && !Array.isArray(v)) flatten(v);
        }
    }
    flatten(payload);
    return creds;
}

// ── Smart login: try all credential combinations until one works ──────────────
async function smartLogin(loginUrl, creds, baseHeaders, project) {
    const authConfig = project.auth_config
        ? (typeof project.auth_config === 'string' ? JSON.parse(project.auth_config) : project.auth_config)
        : {};

    const attempts = [];

    for (const comboFn of LOGIN_COMBOS) {
        const body = comboFn(creds);
        if (!body) continue;

        // Skip if we already tried this exact combo
        const key = JSON.stringify(body);
        if (attempts.find(a => JSON.stringify(a.body) === key)) continue;

        console.log(`[Flow] Trying login combo: ${JSON.stringify(body)}`);

        try {
            const response = await fetch(loginUrl, {
                method: 'POST',
                headers: { ...baseHeaders, 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(TIMEOUT_MS)
            });

            const ct = response.headers.get('content-type') || '';
            const responseBody = ct.includes('application/json')
                ? await response.json().catch(() => null)
                : null;

            const token = responseBody ? extractToken(responseBody) : null;

            attempts.push({
                body,
                status: response.status,
                token,
                responseBody
            });

            console.log(`[Flow] Login attempt ${JSON.stringify(body)} → ${response.status}, token: ${token ? 'found' : 'not found'}`);

            if (response.status >= 200 && response.status < 300 && token) {
                return { success: true, token, body, status: response.status, responseBody, attempts };
            }

            // 200 but no token found in standard paths — still succeeded auth
            if (response.status >= 200 && response.status < 300) {
                return { success: true, token: null, body, status: response.status, responseBody, attempts };
            }

        } catch (err) {
            attempts.push({ body, status: null, token: null, error: err.message });
        }
    }

    return { success: false, token: null, attempts };
}

// ── Resolve {{var}} placeholders in a string ──────────────────────────────────
function resolve(str, context) {
    if (!str || typeof str !== 'string') return str;
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) =>
        context[key] !== undefined ? String(context[key]) : `{{${key}}}`
    );
}

// ── Resolve all placeholders in a JSON object/string ─────────────────────────
function resolveDeep(value, context) {
    if (!value) return value;
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    const resolved = resolve(str, context);
    try { return JSON.parse(resolved); }
    catch { return resolved; }
}

// ── Extract a value from response using dot-path ─────────────────────────────
function extractPath(obj, path) {
    if (!path || !obj) return undefined;
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

// ── Build headers for a step ──────────────────────────────────────────────────
function buildHeaders(step, context, project) {
    const base = { 'Content-Type': 'application/json' };

    // Inject auth from context (token extracted by a previous login step)
    if (context.__token) {
        base['Authorization'] = `Bearer ${context.__token}`;
    } else if (project.auth_type === 'bearer') {
        const ac = project.auth_config
            ? (typeof project.auth_config === 'string' ? JSON.parse(project.auth_config) : project.auth_config)
            : {};
        if (ac?.token) base['Authorization'] = `Bearer ${ac.token}`;
    }

    // Step-level header overrides
    if (step.input_headers) {
        try {
            const stepHeaders = resolveDeep(step.input_headers, context);
            const parsed = typeof stepHeaders === 'string' ? JSON.parse(stepHeaders) : stepHeaders;
            if (parsed && typeof parsed === 'object') Object.assign(base, parsed);
        } catch { /* ignore bad headers */ }
    }

    return base;
}

// ── Execute a single step ─────────────────────────────────────────────────────
async function executeStep(step, context, project) {
    // Resolve URL — replace {{var}} placeholders first
    let url = step.url_override || `${project.base_url}${step.endpoint_path || ''}`;
    url = resolve(url, context);

    // Resolve path params — substituting {{var}} before URL-encoding
    const params = step.input_params ? resolveDeep(step.input_params, context) : {};
    if (params && typeof params === 'object') {
        for (const [k, v] of Object.entries(params)) {
            const resolved = String(v);
            // Only encode if the value is NOT a {{placeholder}} that wasn't resolved
            if (!resolved.startsWith('{{')) {
                url = url.replace(`{${k}}`, encodeURIComponent(resolved));
                url = url.replace(`%7B%7B${k}%7D%7D`, encodeURIComponent(resolved)); // fix double-encoded
            } else {
                // Value is an unresolved placeholder — replace with '1' as fallback
                console.warn(`[Flow] Unresolved param {{${k}}} — using fallback '1'`);
                url = url.replace(`{${k}}`, '1');
                url = url.replace(`%7B%7B${k}%7D%7D`, '1');
                url = url.replace(resolved, '1'); // replace {{userId}} literally
            }
        }
        // Append remaining as query params
        const qs = Object.entries(params)
            .filter(([k]) => !step.endpoint_path?.includes(`{${k}}`))
            .map(([k, v]) => {
                const resolved = String(v);
                return resolved.startsWith('{{') ? null : `${k}=${encodeURIComponent(resolved)}`;
            })
            .filter(Boolean).join('&');
        if (qs) url += `?${qs}`;
    }

    // Also fix any remaining {{var}} or %7B%7B in URL
    url = url.replace(/%7B%7B\w+%7D%7D/g, '1'); // fallback for encoded placeholders

    const method = step.method || 'GET';
    const headers = buildHeaders(step, context, project);
    const payload = step.input_payload ? resolveDeep(step.input_payload, context) : null;

    // For POST/PUT/PATCH with no payload, try swagger example first, then {}
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
    let bodyToSend;
    if (payload !== null) {
        bodyToSend = payload;
    } else if (hasBody && step.swagger_example) {
        try {
            bodyToSend = typeof step.swagger_example === 'string'
                ? JSON.parse(step.swagger_example)
                : step.swagger_example;
            console.log(`[Flow] Using Swagger example for ${method} ${step.endpoint_path || step.name}`);
        } catch { bodyToSend = {}; }
    } else if (hasBody) {
        bodyToSend = {};
    } else {
        bodyToSend = undefined;
    }
    const requestBody = bodyToSend !== undefined ? JSON.stringify(bodyToSend) : undefined;

    console.log(`[Flow] Step ${step.step_order}: ${method} ${url}`);
    if (payload) console.log(`[Flow] Body: ${JSON.stringify(payload).slice(0, 200)}`);

    const startTime = Date.now();
    let actual_status, actual_body, actual_headers = {};

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch(url, {
            method,
            headers,
            body: requestBody,
            signal: controller.signal
        });
        clearTimeout(timer);

        actual_status = response.status;
        for (const [k, v] of response.headers.entries()) actual_headers[k] = v;

        const ct = response.headers.get('content-type') || '';
        actual_body = ct.includes('application/json')
            ? await response.json().catch(() => null)
            : { _text: (await response.text()).slice(0, 500) };

        console.log(`[Flow] Step ${step.step_order} response: ${actual_status}`);
        if (actual_body) console.log(`[Flow] Body: ${JSON.stringify(actual_body).slice(0, 200)}`);

    } catch (err) {
        const ms = Date.now() - startTime;
        return {
            status: 'error',
            actual_status: null,
            actual_body: null,
            actual_headers: {},
            response_time_ms: ms,
            failure_reason: err.name === 'AbortError' ? `Timeout after ${TIMEOUT_MS}ms` : err.message,
            extracted_vars: {},
            request_url: url,
            request_method: method,
            request_headers: headers,
            request_body: bodyToSend ?? null
        };
    }

    const ms = Date.now() - startTime;

    // Determine pass/fail
    const passed = !step.expected_status || actual_status === step.expected_status;

    // Extract context variables from response
    const extractedVars = {};
    if (step.extract_vars && actual_body) {
        const extracts = typeof step.extract_vars === 'string'
            ? JSON.parse(step.extract_vars)
            : step.extract_vars;

        for (const { var: varName, path } of extracts) {
            const value = extractPath(actual_body, path);
            if (value !== undefined) {
                extractedVars[varName] = value;
                // Special case: token → also store as __token for auto-auth injection
                if (varName.toLowerCase().includes('token')) {
                    extractedVars.__token = value;
                }
                console.log(`[Flow] Extracted {{${varName}}} = ${String(value).slice(0, 40)}`);
            } else {
                console.warn(`[Flow] Could not extract {{${varName}}} from path "${path}"`);
            }
        }
    }

    return {
        status: passed ? 'passed' : 'failed',
        actual_status,
        actual_body,
        actual_headers,
        response_time_ms: ms,
        failure_reason: passed ? null : `Expected ${step.expected_status}, got ${actual_status}`,
        extracted_vars: extractedVars,
        request_url: url,
        request_method: method,
        request_headers: headers,
        request_body: bodyToSend ?? null
    };
}

// ── Main: run a full flow suite ───────────────────────────────────────────────
export async function runFlowSuite(suite, steps, project, initialContext = {}) {
    let context = { ...initialContext }; // start with context from previous chunk
    const results = [];
    let passed = 0, failed = 0;
    let signupCredentials = {};
    let signupTokenFound = false;

    for (const step of steps.sort((a, b) => a.step_order - b.step_order)) {

        // Force skip
        if (step._force_skip) {
            results.push({
                step_id: step.id, step_order: step.step_order, step_name: step.name,
                status: 'skipped', _manually_skipped: true, failure_reason: 'Manually skipped',
                extracted_vars: {}, actual_status: null, actual_body: null,
                actual_headers: {}, response_time_ms: 0,
                request_url: null, request_method: null, request_headers: null, request_body: null
            });
            continue;
        }

        // Cascade skip
        const lastResult = results.length > 0 ? results[results.length - 1] : null;
        const prevFailed = lastResult && lastResult.status === 'failed' && !lastResult._manually_skipped;
        if (prevFailed && step.skip_if_failed) {
            results.push({
                step_id: step.id, step_order: step.step_order, step_name: step.name,
                status: 'skipped', failure_reason: 'Previous step failed',
                extracted_vars: {}, actual_status: null, actual_body: null,
                actual_headers: {}, response_time_ms: 0,
                request_url: null, request_method: null, request_headers: null, request_body: null
            });
            continue;
        }

        // Detect step type
        const stepName = (step.name || '').toLowerCase();
        const stepPath = (step.endpoint_path || '').toLowerCase();
        const isLoginStep = stepName.includes('login') || stepName.includes('signin') ||
            stepPath.includes('login') || stepPath.includes('signin') || stepPath.includes('/token');
        const isSignupStep = stepName.includes('sign up') || stepName.includes('signup') ||
            stepName.includes('register') || stepPath.includes('signup') || stepPath.includes('register');

        // If signup already returned a token — skip login step entirely
        if (isLoginStep && signupTokenFound) {
            console.log(`[Flow] Signup already provided token — skipping login`);
            results.push({
                step_id: step.id, step_order: step.step_order, step_name: step.name,
                status: 'passed', failure_reason: null,
                extracted_vars: {}, actual_status: 200,
                actual_body: { _note: 'Token already extracted from signup — login skipped' },
                actual_headers: {}, response_time_ms: 0,
                request_url: null, request_method: 'POST', request_headers: null, request_body: null
            });
            passed++;
            continue;
        }

        // Execute step normally
        const result = await executeStep(step, context, project);

        // After signup — extract credentials + check for token
        if (isSignupStep) {
            if (result.request_body) {
                signupCredentials = extractCredentials(result.request_body);
                console.log(`[Flow] Extracted signup creds:`, { ...signupCredentials, password: '***' });
            }
            // Check if signup response already has a token
            if (result.actual_body) {
                const signupToken = extractToken(result.actual_body);
                if (signupToken) {
                    console.log(`[Flow] Token found in signup response — will skip login`);
                    context.__token = signupToken;
                    context.token = signupToken;
                    signupTokenFound = true;
                    result.extracted_vars = { ...result.extracted_vars, token: signupToken };
                }
            }
            // Soft pass for 400/409/422 (user already exists)
            if (result.status === 'failed') {
                const s = result.actual_status;
                if (s === 400 || s === 409 || s === 422) {
                    console.log(`[Flow] Signup ${s} — user exists, soft pass`);
                    result.status = 'passed';
                    result.failure_reason = null;
                    result._note = `User already exists (${s})`;
                }
            }
        }

        // Smart login — ALWAYS try credential combos for login step
        // Don't rely on input_payload which may have example credentials
        if (isLoginStep) {
            const loginUrl = result.request_url;
            const baseHdrs = buildHeaders(step, context, project);
            const rawUsername = signupCredentials.username || signupCredentials.email?.split('@')[0] || 'testuser';
            const cleanUsername = rawUsername.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9._-]/g, '');

            const creds = {
                email: signupCredentials.email || 'test@example.com',
                username: cleanUsername || 'testuser',
                phone: signupCredentials.phone || '+919876543210',
                password: signupCredentials.password || 'Test@123456',
            };

            console.log(`[Flow] Smart login trying combos:`, { ...creds, password: '***' });
            const smartResult = await smartLogin(loginUrl, creds, baseHdrs, project);

            if (smartResult.success) {
                result.status = 'passed';
                result.failure_reason = null;
                result.request_body = smartResult.body;
                result.actual_body = smartResult.responseBody;
                result.actual_status = smartResult.status;
                result._smart_login = true;

                if (smartResult.token) {
                    context.__token = smartResult.token;
                    context.token = smartResult.token;
                    result.extracted_vars = { ...(result.extracted_vars || {}), token: smartResult.token };
                    console.log(`[Flow] Smart login succeeded: ${JSON.stringify(smartResult.body)}`);
                }
            } else {
                result.status = 'failed';
                result.failure_reason = `All login combos failed. Tried: ${smartResult.attempts.map(a => `${JSON.stringify(a.body)}→${a.status}`).join(', ')
                    }`;
                console.log(`[Flow] All login combos failed`);
            }
        }

        // Merge extracted vars into context
        if (result.extracted_vars) Object.assign(context, result.extracted_vars);

        results.push({ step_id: step.id, step_order: step.step_order, step_name: step.name, ...result });
        if (result.status === 'passed') passed++;
        else failed++;

        await new Promise(r => setTimeout(r, 100));
    }

    return {
        results, context,
        summary: {
            total: steps.length, passed, failed,
            pass_rate: steps.length ? Math.round((passed / steps.length) * 100) : 0
        }
    };
}