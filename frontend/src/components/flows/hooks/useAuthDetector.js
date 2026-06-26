/**
 * useAuthDetector
 * Single Responsibility: detect which endpoints require authentication
 * from the Swagger security field stored in D1.
 * 
 * Returns endpoints annotated with requiresAuth boolean.
 * Allows user overrides without modifying source data.
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * Detect if an endpoint requires authentication
 * from its security field (stored as JSON string from Swagger import)
 */
export function detectEndpointAuth(endpoint) {
    if (!endpoint.security) return false;
    try {
        const security = typeof endpoint.security === 'string'
            ? JSON.parse(endpoint.security)
            : endpoint.security;
        // Empty array [] means public, non-empty means auth required
        return Array.isArray(security) && security.length > 0;
    } catch {
        return false;
    }
}

/**
 * useAuthDetector
 * Takes a list of endpoints, returns them annotated with auth status.
 * User can override individual endpoints.
 */
export function useAuthDetector(endpoints) {
    // Map of endpointId → boolean (user override)
    const [overrides, setOverrides] = useState({});

    // Reset overrides when endpoints change
    useEffect(() => {
        setOverrides({});
    }, [endpoints.length]);

    // Get auth status for an endpoint (override > detected)
    const requiresAuth = useCallback((endpoint) => {
        if (endpoint.id in overrides) return overrides[endpoint.id];
        return detectEndpointAuth(endpoint);
    }, [overrides]);

    // Toggle auth for a specific endpoint
    const toggleAuth = useCallback((endpointId) => {
        setOverrides(prev => {
            const endpoint = endpoints.find(e => e.id === endpointId);
            const current = endpointId in prev
                ? prev[endpointId]
                : detectEndpointAuth(endpoint);
            return { ...prev, [endpointId]: !current };
        });
    }, [endpoints]);

    // Get all endpoints with auth status applied
    const annotated = endpoints.map(ep => ({
        ...ep,
        requiresAuth: requiresAuth(ep),
        authOverridden: ep.id in overrides,
    }));

    // Summary counts
    const authCount = annotated.filter(e => e.requiresAuth).length;
    const publicCount = annotated.filter(e => !e.requiresAuth).length;

    return {
        annotated,
        requiresAuth,
        toggleAuth,
        overrides,
        authCount,
        publicCount,
    };
}