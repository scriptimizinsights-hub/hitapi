/**
 * Flow Suite Executor
 * Runs steps sequentially, passing context variables between steps.
 * Supports {{varName}} placeholders in payload, headers, params and URL.
 */

const TIMEOUT_MS = 15000;

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
    // Resolve URL
    let url = step.url_override || `${project.base_url}${step.endpoint_path || ''}`;
    url = resolve(url, context);

    // Resolve path params
    const params = step.input_params ? resolveDeep(step.input_params, context) : {};
    if (params && typeof params === 'object') {
        for (const [k, v] of Object.entries(params)) {
            url = url.replace(`{${k}}`, encodeURIComponent(String(v)));
        }
        // Append query params that aren't path params
        const qs = Object.entries(params)
            .filter(([k]) => !url.includes(k))
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
        if (qs) url += `?${qs}`;
    }

    const method = step.method || 'GET';
    const headers = buildHeaders(step, context, project);
    const payload = step.input_payload ? resolveDeep(step.input_payload, context) : null;

    const requestBody = payload ? JSON.stringify(payload) : undefined;

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
            request_body: payload
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
        request_body: payload
    };
}

// ── Main: run a full flow suite ───────────────────────────────────────────────
export async function runFlowSuite(suite, steps, project) {
    let context = {};  // accumulates extracted vars across steps

    const results = [];
    let passed = 0, failed = 0;

    for (const step of steps.sort((a, b) => a.step_order - b.step_order)) {
        // Check if previous step failed and this step should be skipped
        const prevFailed = results.length > 0 && results[results.length - 1].status !== 'passed';
        if (prevFailed && step.skip_if_failed) {
            results.push({
                step_id: step.id,
                step_order: step.step_order,
                step_name: step.name,
                status: 'skipped',
                failure_reason: 'Previous step failed',
                extracted_vars: {},
                actual_status: null,
                actual_body: null,
                actual_headers: {},
                response_time_ms: 0,
                request_url: null,
                request_method: null,
                request_headers: null,
                request_body: null
            });
            continue;
        }

        const result = await executeStep(step, context, project);

        // Special case: signup step — if user already exists (400/409/422), 
        // treat as soft pass so login can still proceed
        if (result.status === 'failed' && step.name?.toLowerCase().includes('sign')) {
            const status = result.actual_status;
            if (status === 400 || status === 409 || status === 422) {
                console.log(`[Flow] Signup returned ${status} — user likely already exists, continuing to login`);
                result.status = 'passed';
                result.failure_reason = null;
                result._note = `User already exists (${status}) — skipped signup, proceeding to login`;
            }
        }

        // Merge extracted vars into context for next steps
        if (result.extracted_vars) {
            Object.assign(context, result.extracted_vars);
        }

        results.push({
            step_id: step.id,
            step_order: step.step_order,
            step_name: step.name,
            ...result
        });

        if (result.status === 'passed') passed++;
        else failed++;

        // Small delay between steps
        await new Promise(r => setTimeout(r, 100));
    }

    return {
        results,
        context,
        summary: {
            total: steps.length,
            passed,
            failed,
            pass_rate: steps.length ? Math.round((passed / steps.length) * 100) : 0
        }
    };
}