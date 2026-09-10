/**
 * v2 — restores format/min-max/query-params without re-adding generic bloat.
 * Every added detail is still inline, field-specific, and only appears
 * when that field actually has that constraint.
 */

function describeField(field, def, required) {
    const parts = [`${field}: ${def.type || 'string'}`];

    if (required) parts.push('[required]');
    if (def.enum) parts.push(`enum:${JSON.stringify(def.enum)}`);
    if (def.format) parts.push(`format:${def.format}`);              // RESTORED
    if (def.minLength !== undefined) parts.push(`minLen:${def.minLength}`);   // RESTORED
    if (def.maxLength !== undefined) parts.push(`maxLen:${def.maxLength}`);   // RESTORED
    if (def.minimum !== undefined) parts.push(`min:${def.minimum}`);          // RESTORED
    if (def.maximum !== undefined) parts.push(`max:${def.maximum}`);          // RESTORED
    if (def.pattern) parts.push(`pattern:${def.pattern}`);                    // RESTORED
    if (def.default !== undefined) parts.push(`default:${JSON.stringify(def.default)}`);

    return '  ' + parts.join(' ');
}
function buildFlowStepPrompt(
    endpoint,
    pathParams,
    queryParams,
    requestBody,
    knownStatusCodes
) {
    const hasPathParams = pathParams.length > 0;
    const hasQueryParams = queryParams.length > 0;

    const hasBody =
        requestBody &&
        typeof requestBody === 'object' &&
        requestBody.content &&
        Object.keys(requestBody.content).length > 0;

    const pathParamLines = hasPathParams
        ? pathParams
            .map(p =>
                describeField(
                    p.name,
                    p.schema || {},
                    p.required
                )
            )
            .join('\n')
        : null;

    const queryParamLines = hasQueryParams
        ? queryParams
            .map(p =>
                describeField(
                    p.name,
                    p.schema || {},
                    p.required
                )
            )
            .join('\n')
        : null;

    // Keep the complete requestBody exactly as received.
    const requestBodyJson = hasBody
        ? JSON.stringify(requestBody, null, 2)
        : null;

    return `Design 4-6 test steps for this API endpoint.

            ${endpoint.method} ${endpoint.path}
            ${endpoint.summary || ''}

            ${hasPathParams
            ? `PATH PARAMETERS:
            ${pathParamLines}
            ` : ''}${hasQueryParams
            ? `QUERY PARAMETERS:
            ${queryParamLines}
            ` : ''}${hasBody
            ? `REQUEST BODY:
            ${requestBodyJson}
            `: 'REQUEST BODY: none\n'}${knownStatusCodes?.length
            ? `VALID RESPONSE CODES: ${knownStatusCodes.join(', ')}
            `: ''}
RULES:
- Match each field's type, format, enum, min/max, and pattern exactly.
- format:email → real email. format:date-time → ISO 8601. format:uri → real URL.
- Never use a value outside a listed enum, or outside min/max bounds.
- Vary the data across all steps — no duplicate request bodies.
- Include query_params in each step if QUERY PARAMETERS are listed above.
- If REQUEST BODY is "none", set request_body to null.

Return ONLY a JSON array, no markdown:
[{"name":"...","path_params":{},"query_params":{},"request_body":{},"expected_status":200,"reasoning":"..."}]`;
}

module.exports = { buildFlowStepPrompt };