/**
 * normalizeAIResponse.js
 * Pipeline: LLM response → clean, validated, deduplicated array of steps
 *
 * Stages:
 *   1. removeMarkdownFences
 *   2. extractFirstJsonValue
 *   3. JSON.parse
 *   4. deduplicateSteps
 *   5. validateStep (per item)
 *   6. processModelResponse (orchestrator)
 */

// ── Stage 1: strip markdown code fences ────────────────────────────────────────
function removeMarkdownFences(text) {
    if (!text) return '';
    return text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
}

// ── Stage 2: extract the FIRST complete JSON value (object or array) ──────────
// Scans character-by-character, tracking bracket depth and string state,
// so it correctly ignores brackets that appear inside string values
// (e.g. "html_body": "<p>Text</p>") and stops at the first balanced structure —
// this is what prevents the repetition bug from producing double-parsed data.
function extractFirstJsonValue(text) {
    if (!text) return null;

    const starts = ['[', '{']
        .map(c => text.indexOf(c))
        .filter(i => i >= 0);

    if (starts.length === 0) return null;
    const start = Math.min(...starts);

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const char = text[i];

        if (escaped) { escaped = false; continue; }
        if (char === '\\') { escaped = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        if (inString) continue;

        if (char === '[' || char === '{') depth++;
        if (char === ']' || char === '}') {
            depth--;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }

    return null; // never balanced — truncated response (e.g. timeout mid-generation)
}

// ── Stage 4: remove exact-duplicate steps ──────────────────────────────────────
// Compares actual test data (not just name) — two steps with the same name
// but different request_body are legitimately different tests and must both survive.
function deduplicateSteps(steps) {
    const seen = new Set();
    return steps.filter(step => {
        const key = JSON.stringify({
            name: step.name,
            path_params: step.path_params || {},
            query_params: step.query_params || {},
            request_body: step.request_body ?? null,
        });
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ── Stage 5: validate each step's shape ────────────────────────────────────────
// Kept hand-written (not Zod) — bundle size matters on Workers, and the shape
// is small and fixed. Coerces missing optional fields to safe defaults instead
// of rejecting, since AI models frequently omit query_params/reasoning even
// when the rest of the step is perfectly usable.
function validateStep(step) {
    if (!step || typeof step !== 'object') return null;
    if (typeof step.name !== 'string' || !step.name.trim()) return null;
    if (typeof step.expected_status !== 'number') return null;

    // request_body must be object or null — never a string, array, or primitive
    const bodyOk = step.request_body === null
        || step.request_body === undefined
        || (typeof step.request_body === 'object' && !Array.isArray(step.request_body));
    if (!bodyOk) return null;

    // path_params/query_params: must be flat {key: primitive} objects.
    // Coerces the whole object to {} if it's not an object at all, AND
    // strips any individual value that is itself an array/object — this is
    // exactly the enum-list bug (path_params.from returned as the full enum
    // array instead of one chosen value) that we found in earlier testing.
    function sanitizeParamMap(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
        const clean = {};
        for (const [k, v] of Object.entries(obj)) {
            if (v === null || v === undefined) continue;
            if (typeof v === 'object') continue; // drop arrays/objects — invalid param value
            clean[k] = v;
        }
        return clean;
    }

    const path_params = sanitizeParamMap(step.path_params);
    const query_params = sanitizeParamMap(step.query_params);

    return {
        name: step.name.trim(),
        path_params,
        query_params,
        request_body: step.request_body ?? null,
        expected_status: step.expected_status,
        reasoning: typeof step.reasoning === 'string' ? step.reasoning : '',
        // Optional — only present for test_generation stage, not flow_step_generation.
        // Accepts either field name the model might use, coerces to a known enum,
        // falls back to 'positive' rather than dropping the step entirely.
        type: (() => {
            const raw = step.type || step.test_type;
            const valid = ['positive', 'negative', 'boundary', 'security'];
            return valid.includes(raw) ? raw : (raw ? 'positive' : undefined);
        })(),
    };
}

// ── Stage 6: orchestrator ───────────────────────────────────────────────────────
// Runs all stages in order. Throws a NormalizeError with a `.stage` property
// so the caller (and ai_logs) can record exactly WHERE it failed, not just IF.
class NormalizeError extends Error {
    constructor(message, stage) {
        super(message);
        this.name = 'NormalizeError';
        this.stage = stage;
    }
}

function processModelResponse(rawText) {
    if (!rawText || !rawText.trim()) {
        throw new NormalizeError('Empty response from model', 'empty_input');
    }

    // Stage 1
    const cleaned = removeMarkdownFences(rawText);

    // Stage 2
    const jsonText = extractFirstJsonValue(cleaned);
    if (!jsonText) {
        throw new NormalizeError('No JSON value found in model response', 'extraction');
    }

    // Stage 3
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch (err) {
        throw new NormalizeError(`Extracted content is not valid JSON: ${err.message}`, 'json_parse');
    }

    if (!Array.isArray(parsed)) {
        throw new NormalizeError('Expected a JSON array of steps', 'json_parse');
    }

    // Stage 5 — validate each item, drop invalid ones (don't fail the whole batch
    // for one bad step — a 5/6 success rate is still useful, 0/6 is not)
    const validated = parsed
        .map(validateStep)
        .filter(Boolean);

    if (validated.length === 0) {
        throw new NormalizeError('No valid steps after validation', 'schema_validation');
    }

    // Stage 4 — dedupe AFTER validation, so normalized/coerced values are compared
    const deduped = deduplicateSteps(validated);

    return {
        steps: deduped,
        droppedInvalid: parsed.length - validated.length,
        droppedDuplicates: validated.length - deduped.length,
    };
}

// ── Variant: single-object responses (e.g. bug analysis) ──────────────────────
// Same fence-strip + extract + parse pipeline, but expects ONE object,
// not an array of steps — skips dedupe/step-validation which don't apply.
function validateBugAnalysis(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const required = ['severity', 'title', 'description', 'root_cause', 'suggested_fix'];
    for (const field of required) {
        if (typeof obj[field] !== 'string' || !obj[field].trim()) return null;
    }
    const t = obj.title.toLowerCase();
    if (t.includes('short title') || t.includes('under 60 chars') || obj.severity === 'high|medium|low') {
        return null;
    }
    return {
        severity: obj.severity,
        title: obj.title.trim(),
        description: obj.description.trim(),
        root_cause: obj.root_cause.trim(),
        suggested_fix: obj.suggested_fix.trim(),
    };
}

function processSingleObjectResponse(rawText) {
    if (!rawText || !rawText.trim()) {
        throw new NormalizeError('Empty response from model', 'empty_input');
    }
    const cleaned = removeMarkdownFences(rawText);
    const jsonText = extractFirstJsonValue(cleaned);
    if (!jsonText) {
        throw new NormalizeError('No JSON value found in model response', 'extraction');
    }
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch (err) {
        throw new NormalizeError(`Extracted content is not valid JSON: ${err.message}`, 'json_parse');
    }
    const validated = validateBugAnalysis(parsed);
    if (!validated) {
        throw new NormalizeError('Bug analysis response failed validation', 'schema_validation');
    }
    return validated;
}

export {
    removeMarkdownFences,
    extractFirstJsonValue,
    deduplicateSteps,
    validateStep,
    processModelResponse,
    processSingleObjectResponse,
    validateBugAnalysis,
    NormalizeError,
};