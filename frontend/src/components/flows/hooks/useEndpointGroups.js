/**
 * useEndpointGroups
 * Single Responsibility: group endpoints by base path to detect CRUD sets.
 * 
 * Example:
 *   /admin/checklist-templates       POST, GET
 *   /admin/checklist-templates/{id}  PUT, DELETE
 *   → grouped as one CRUD set under "/admin/checklist-templates"
 *
 * Open/Closed: new grouping strategies can be added without 
 * modifying existing detection logic.
 */

import { useMemo, useState, useCallback } from 'react';

// ── Path utilities ────────────────────────────────────────────────────────────

/**
 * Strip trailing path params to get base resource path
 * /admin/checklist-templates/{id} → /admin/checklist-templates
 * /admin/users/{id}/roles         → /admin/users (strip from first {param})
 */
export function getBasePath(path) {
    return path.replace(/\/\{[^}]+\}.*$/, '');
}

/**
 * Convert path to camelCase variable prefix
 * /admin/checklist-templates → checklistTemplate
 * /admin/users               → adminUser
 * /api/v1/tasks              → task
 */
export function pathToVarName(basePath) {
    // Remove common API prefixes
    const clean = basePath
        .replace(/^\/api\/v\d+/, '')
        .replace(/^\/api/, '');

    // Split by / and - and _
    const parts = clean
        .split(/[\/\-_]/)
        .filter(Boolean)
        .filter(p => p !== 'admin' && p !== 'v1' && p !== 'api');

    if (!parts.length) return 'item';

    // camelCase: first part lowercase, rest capitalized
    return parts
        .map((p, i) => i === 0 ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1).toLowerCase())
        .join('');
}

/**
 * Generate context variable name from base path
 * /admin/checklist-templates → {{checklistTemplateId}}
 */
export function pathToContextVar(basePath) {
    return `{{${pathToVarName(basePath)}Id}}`;
}

/**
 * CRUD method order for correct execution sequence
 * POST first (creates resource), DELETE last (cleans up)
 */
const METHOD_ORDER = { POST: 0, GET: 1, PUT: 2, PATCH: 3, DELETE: 4 };

// ── Common id paths to try in POST response ───────────────────────────────────
export const COMMON_ID_PATHS = [
    'id',
    'data.id',
    'data.data.id',
    'result.id',
    'payload.id',
    '_id',
    'data._id',
];

// ── Group detection ───────────────────────────────────────────────────────────

/**
 * Group endpoints by base path into CRUD sets
 */
export function groupEndpointsByCrud(endpoints) {
    const groups = {};

    for (const ep of endpoints) {
        const base = getBasePath(ep.path);
        if (!groups[base]) {
            groups[base] = {
                basePath: base,
                varName: pathToVarName(base),
                contextVar: pathToContextVar(base),
                endpoints: [],
            };
        }
        groups[base].endpoints.push(ep);
    }

    // Sort endpoints within each group by CRUD order
    for (const g of Object.values(groups)) {
        g.endpoints.sort((a, b) =>
            (METHOD_ORDER[a.method] ?? 99) - (METHOD_ORDER[b.method] ?? 99)
        );

        // Detect if group has a creator (POST without path params)
        g.hasCreate = g.endpoints.some(e =>
            e.method === 'POST' && !e.path.includes('{')
        );

        // Detect if group has endpoints that need an id
        g.hasIdEndpoints = g.endpoints.some(e => e.path.includes('{'));

        // Is this a real CRUD group? (has create + at least one id endpoint)
        g.isCrud = g.hasCreate && g.hasIdEndpoints;
    }

    return Object.values(groups)
        .filter(g => g.endpoints.length > 0)
        .sort((a, b) => a.basePath.localeCompare(b.basePath));
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useEndpointGroups
 * Detects CRUD groups, manages id extraction config per group.
 */
export function useEndpointGroups(annotatedEndpoints) {
    const groups = useMemo(
        () => groupEndpointsByCrud(annotatedEndpoints),
        [annotatedEndpoints]
    );

    // Per-group config: idPath (where to find id in POST response)
    const [groupConfig, setGroupConfig] = useState({});

    // Toggle whether a group is included in the suite
    const [includedGroups, setIncludedGroups] = useState(() => {
        const init = {};
        groups.forEach(g => { init[g.basePath] = g.isCrud; });
        return init;
    });

    // Update id extraction path for a group
    const setIdPath = useCallback((basePath, idPath) => {
        setGroupConfig(prev => ({
            ...prev,
            [basePath]: { ...(prev[basePath] || {}), idPath }
        }));
    }, []);

    // Toggle group inclusion
    const toggleGroup = useCallback((basePath) => {
        setIncludedGroups(prev => ({
            ...prev,
            [basePath]: !prev[basePath]
        }));
    }, []);

    // Get config for a group with defaults
    const getGroupConfig = useCallback((basePath) => ({
        idPath: 'id',
        ...groupConfig[basePath],
        included: includedGroups[basePath] ?? false,
    }), [groupConfig, includedGroups]);

    // Build steps for all included CRUD groups
    const buildCrudSteps = useCallback((startOrder) => {
        const steps = [];
        let order = startOrder;

        for (const group of groups) {
            const config = getGroupConfig(group.basePath);
            if (!config.included) continue;

            const { contextVar, endpoints } = group;
            const idPath = config.idPath || 'id';

            for (const ep of endpoints) {
                const isCreator = ep.method === 'POST' && !ep.path.includes('{');
                const needsId = ep.path.includes('{');

                // Extract path param name from URL template
                const pathParams = (ep.path.match(/\{(\w+)\}/g) || [])
                    .map(p => p.slice(1, -1));

                steps.push({
                    step_order: order++,
                    name: `${ep.method} ${ep.path}`,
                    endpoint_id: ep.id,
                    method: ep.method,
                    // Creator extracts the id; others use it
                    extract_vars: isCreator
                        ? [{ var: `${group.varName}Id`, path: idPath }]
                        : [],
                    // Id endpoints inject the extracted var
                    input_params: needsId && pathParams.length
                        ? Object.fromEntries(pathParams.map(p => [p, contextVar.slice(2, -2)]))
                        : null,
                    input_payload: null, // filled by swagger example or AI
                    expected_status: ep.method === 'DELETE' ? 204 : ep.method === 'POST' ? 201 : 200,
                    skip_if_failed: isCreator ? 0 : 1,
                    requiresAuth: ep.requiresAuth,
                });
            }
        }
        return steps;
    }, [groups, getGroupConfig]);

    return {
        groups,
        groupConfig,
        includedGroups,
        setIdPath,
        toggleGroup,
        getGroupConfig,
        buildCrudSteps,
    };
}