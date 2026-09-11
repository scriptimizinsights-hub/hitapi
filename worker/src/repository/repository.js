
import { DatabaseAdapter, ProjectRepo, TestCaseRepo, ExecutionRepo, BugRepo } from '../db/adapter.js';

import { json, success } from '../middleware/cors.js';
import { EndpointRepo } from '../db/EndpointRepo.js';

function repos(env) {
    const db = new DatabaseAdapter(env.DB);
    return {
        db,
        endpoints: new EndpointRepo(db)
    };
}

export async function listEndpoints(request, env, { params }) {
    const cacheKey = `endpoints:${params.id}`;
    if (env.CACHE) {

        const cached = await env.CACHE.get(cacheKey);

        if (cached) return json(success(JSON.parse(cached)));
    }

    const { endpoints: epRepo } = repos(env);
    const data = await epRepo.listByProject(params.id);
    const stats = await epRepo.stats(params.id);

    if (env.CACHE) {
        await env.CACHE.put(cacheKey, JSON.stringify({ endpoints: data, stats }), { expirationTtl: 300 });
    }

    return json(success({ endpoints: data, stats }));
}

export async function getEndpointStats(request, env, { params }) {
    const { endpoints: epRepo } = repos(env);
    const stats = await epRepo.stats(params.id);
    return json(success(stats));
}

export async function deleteEndpoint(request, env, { params }) {
    const { endpoints: epRepo } = repos(env);


    // Invalidate endpoint list cache
    if (env.CACHE) {
        const cacheKey = `endpoints:${params.id}`;
        await env.CACHE.delete(cacheKey);
    }

    const result = await epRepo.delete(params.id, params.endpointId);

    if (!result?.meta?.changes) {
        return json(
            { error: 'Endpoint not found' },
            { status: 404 }
        );
    }


    return json(success({
        success: true,
        id: params.endpointId
    }));
}
