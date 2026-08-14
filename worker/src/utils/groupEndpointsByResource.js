/**
 * groupEndpointsByResource.js
 * Groups endpoints by their base resource path, then orders operations
 * within each group in a logical CRUD lifecycle: POST → GET (list) →
 * GET (by id) → PUT → PATCH → DELETE.
 *
 * e.g. /api/v1/customers + /api/v1/customers/{id} → one group "customers"
 *      with steps ordered: create → list → get one → update → delete
 */

// Strip path params to get the resource identity
// /api/v1/customers/{id}           → /api/v1/customers
// /api/v1/customers/{id}/orders    → /api/v1/customers/{id}/orders  (nested resource, own group)
// /api/v1/customers                → /api/v1/customers
function getResourceBase(path) {
    // Remove trailing {param} segments only — keeps nested resources distinct
    return path.replace(/\/\{[^}]+\}\/?$/, '');
}

// Operation priority WITHIN a resource group — proper CRUD lifecycle order
const OP_ORDER = {
    'POST-collection': 0,   // POST /customers          (create)
    'GET-collection': 1,   // GET  /customers           (list)
    'GET-item': 2,   // GET  /customers/{id}      (read one)
    'PUT-item': 3,   // PUT  /customers/{id}      (full update)
    'PATCH-item': 4,   // PATCH /customers/{id}     (partial update)
    'POST-item': 5,   // POST /customers/{id}/...  (sub-actions, e.g. /reset)
    'DELETE-item': 6,   // DELETE /customers/{id}    (delete — always last)
};

function classifyOperation(endpoint, resourceBase) {
    const isItemPath = endpoint.path !== resourceBase; // has a {id} suffix or is deeper
    const key = `${endpoint.method}-${isItemPath ? 'item' : 'collection'}`;
    return OP_ORDER[key] ?? 99; // unknown combos sort last, not dropped
}

/**
 * groupEndpointsByResource(endpoints)
 * Returns an array of { resourceBase, endpoints: [...ordered] }
 * sorted so that:
 *   - groups are ordered by first-appearance in the input
 *   - within each group, endpoints follow CRUD lifecycle order
 */
function groupEndpointsByResource(endpoints) {
    const groups = new Map();

    for (const ep of endpoints) {
        const base = getResourceBase(ep.path);
        if (!groups.has(base)) groups.set(base, []);
        groups.get(base).push(ep);
    }

    const result = [];
    for (const [resourceBase, groupEndpoints] of groups) {
        const ordered = [...groupEndpoints].sort(
            (a, b) => classifyOperation(a, resourceBase) - classifyOperation(b, resourceBase)
        );
        result.push({ resourceBase, endpoints: ordered });
    }

    return result;
}

// Flatten groups back into a single ordered list — groups stay contiguous,
// CRUD order preserved within each group. This is what actually feeds
// the step-building loop.
function flattenGroupedEndpoints(groups) {
    return groups.flatMap(g => g.endpoints);
}

export { getResourceBase, groupEndpointsByResource, flattenGroupedEndpoints, classifyOperation };

// ── Build steps for one group, chaining the created resource's ID ─────────────
// After the POST (create) step, extract the response's id and inject it
// as {{resourceBase_id}} into every subsequent item-level step in the group,
// instead of falling back to a hardcoded "1".
function buildGroupSteps(group, buildPayloadFromSchema, buildPathParams) {
    const steps = [];
    const groupVarName = group.resourceBase
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/^_+|_+$/g, '') + '_id'; // e.g. "/api/v1/customers" → "api_v1_customers_id"

    let createdInThisGroup = false;

    for (const ep of group.endpoints) {
        const isCreate = ep.method === 'POST' && ep.path === group.resourceBase;
        const pathParams = buildPathParams(ep);

        // If this step targets {id} and we already created one in this group,
        // point it at the ID we just created instead of a generic fallback.
        if (pathParams && createdInThisGroup) {
            for (const key of Object.keys(pathParams)) {
                if (key.toLowerCase().includes('id')) {
                    pathParams[key] = `{{${groupVarName}}}`;
                }
            }
        }

        const step = {
            name: `${ep.method} ${ep.path}`,
            endpoint_id: ep.id,
            method: ep.method,
            input_payload: buildPayloadFromSchema(ep),
            input_params: pathParams,
            expected_status: ep.method === 'DELETE' ? 204 : ep.method === 'POST' ? 201 : 200,
            extract_vars: isCreate ? [
                { var: groupVarName, path: 'data.id' },
                { var: groupVarName, path: 'id' },
                { var: groupVarName, path: 'data._id' },
                { var: groupVarName, path: '_id' },
            ] : [],
            skip_if_failed: isCreate ? 0 : 1, // if create fails, skip the rest of this group
        };

        steps.push(step);
        if (isCreate) createdInThisGroup = true;
    }

    return steps;
}

export { buildGroupSteps };