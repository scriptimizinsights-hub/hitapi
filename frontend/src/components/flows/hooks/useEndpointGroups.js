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
 * Supports: include/exclude groups, move endpoints between groups,
 * exclude individual endpoints from groups.
 */
export function useEndpointGroups(annotatedEndpoints) {
    const baseGroups = useMemo(
        () => groupEndpointsByCrud(annotatedEndpoints),
        [annotatedEndpoints]
    );

    // Per-group config: idPath
    const [groupConfig, setGroupConfig] = useState({});

    // Per-group inclusion
    const [includedGroups, setIncludedGroups] = useState(() => {
        const init = {};
        baseGroups.forEach(g => { init[g.basePath] = g.isCrud; });
        return init;
    });

    // Endpoint overrides: endpointId → basePath (which group it belongs to)
    // null means excluded from all groups
    const [endpointOverrides, setEndpointOverrides] = useState({});

    // Compute final groups with overrides applied
    const groups = useMemo(() => {
        const result = baseGroups.map(g => ({
            ...g,
            endpoints: g.endpoints.filter(ep => {
                if (ep.id in endpointOverrides) {
                    return endpointOverrides[ep.id] === g.basePath;
                }
                return true; // default: keep in original group
            })
        }));

        // Add endpoints moved to a different group
        for (const [epId, targetPath] of Object.entries(endpointOverrides)) {
            if (!targetPath) continue; // excluded
            const targetGroup = result.find(g => g.basePath === targetPath);
            if (!targetGroup) continue;
            // Check if already in target (from original grouping)
            if (targetGroup.endpoints.find(e => e.id === epId)) continue;
            // Find the endpoint in original groups
            const ep = annotatedEndpoints.find(e => e.id === epId);
            if (ep) targetGroup.endpoints.push(ep);
        }

        return result.filter(g => g.endpoints.length > 0);
    }, [baseGroups, endpointOverrides, annotatedEndpoints]);

    // Exclude an endpoint from its group
    const excludeEndpoint = useCallback((endpointId) => {
        setEndpointOverrides(prev => ({ ...prev, [endpointId]: null }));
    }, []);

    // Move an endpoint to a different group
    const moveEndpoint = useCallback((endpointId, targetBasePath) => {
        setEndpointOverrides(prev => ({ ...prev, [endpointId]: targetBasePath }));
    }, []);

    // Reset an endpoint to its original group
    const resetEndpoint = useCallback((endpointId) => {
        setEndpointOverrides(prev => {
            const next = { ...prev };
            delete next[endpointId];
            return next;
        });
    }, []);

    // Get excluded endpoints (not in any group)
    const excludedEndpoints = useMemo(() => {
        return annotatedEndpoints.filter(ep =>
            ep.id in endpointOverrides && endpointOverrides[ep.id] === null
        );
    }, [annotatedEndpoints, endpointOverrides]);

    const setIdPath = useCallback((basePath, idPath) => {
        setGroupConfig(prev => ({
            ...prev,
            [basePath]: { ...(prev[basePath] || {}), idPath }
        }));
    }, []);

    const toggleGroup = useCallback((basePath) => {
        setIncludedGroups(prev => ({ ...prev, [basePath]: !prev[basePath] }));
    }, []);

    const getGroupConfig = useCallback((basePath) => ({
        idPath: 'id',
        ...groupConfig[basePath],
        included: includedGroups[basePath] ?? false,
    }), [groupConfig, includedGroups]);

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
                const pathParams = (ep.path.match(/\{(\w+)\}/g) || []).map(p => p.slice(1, -1));

                steps.push({
                    step_order: order++,
                    name: `${ep.method} ${ep.path}`,
                    endpoint_id: ep.id,
                    method: ep.method,
                    extract_vars: isCreator ? [{ var: `${group.varName}Id`, path: idPath }] : [],
                    input_params: needsId && pathParams.length
                        ? Object.fromEntries(pathParams.map(p => [p, contextVar])) // keep {{varName}} intact
                        : null,
                    input_payload: null,
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
        baseGroups,
        groupConfig,
        includedGroups,
        excludedEndpoints,
        endpointOverrides,
        setIdPath,
        toggleGroup,
        getGroupConfig,
        buildCrudSteps,
        excludeEndpoint,
        moveEndpoint,
        resetEndpoint,
    };
}