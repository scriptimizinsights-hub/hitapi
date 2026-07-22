/**
 * HitAPI Platform Error Logger
 * Captures both internal (HitAPI) and external (user API) errors
 * Never throws — logging must never break the main flow
 */

export async function logInternalError(db, {
    source,        // 'worker' | 'queue' | 'ai' | 'db' | 'swagger_import'
    message,
    stack,
    severity = 'error',
    projectId = null,
    userId = null,
    context = null,
}) {
    try {
        await db.run(
            `INSERT INTO platform_errors
         (scope, source, severity, project_id, user_id, message, stack, context)
       VALUES ('internal', ?, ?, ?, ?, ?, ?, ?)`,
            [
                source,
                severity,
                projectId || null,
                userId || null,
                message?.slice(0, 2000) || 'Unknown error',
                stack?.slice(0, 5000) || null,
                context ? JSON.stringify(context) : null,
            ]
        );
    } catch (e) {
        // Never let error logging break anything
        console.error('[ErrorLogger] Failed to log internal error:', e.message);
    }
}

export async function logExternalError(db, {
    projectId,
    userId = null,
    runId = null,
    stepId = null,
    requestUrl,
    requestMethod,
    expectedStatus,
    actualStatus,
    context = null,
}) {
    // Only log when actual status is unexpected
    // e.g. expected 200 got 500 — not expected 400 got 400
    if (actualStatus === expectedStatus) return;

    // Only log server errors and unexpected failures
    // Don't log intentional negative test cases (expected 400, got 400 = pass)
    const isUnexpected = actualStatus >= 500 ||
        (expectedStatus < 400 && actualStatus >= 400);

    if (!isUnexpected) return;

    const severity = actualStatus >= 500 ? 'critical' : 'error';
    const message = `${requestMethod} ${requestUrl} — expected ${expectedStatus}, got ${actualStatus}`;

    try {
        await db.run(
            `INSERT INTO platform_errors
         (scope, source, severity, project_id, user_id, run_id, step_id,
          message, request_url, request_method, expected_status, actual_status, context)
       VALUES ('external', 'test_run', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                severity,
                projectId || null,
                userId || null,
                runId || null,
                stepId || null,
                message,
                requestUrl?.slice(0, 2000) || null,
                requestMethod || null,
                expectedStatus || null,
                actualStatus || null,
                context ? JSON.stringify(context) : null,
            ]
        );
    } catch (e) {
        console.error('[ErrorLogger] Failed to log external error:', e.message);
    }
}