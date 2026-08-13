/**
 * HitAPI — Cloudflare Worker Entry Point
 * Deployable on Cloudflare Workers OR any platform with the Web Fetch API
 * (Node.js with @cloudflare/workers-types, Deno, Bun, etc.)
 */

import { handleCORS, json } from './middleware/cors.js';
import { hitapiSignup, hitapiLogin, hitapiMe, hitapiAcceptTerms, hitapiTermsHistory, requireAuth } from './services/auth.js';
import {
  listProjects, createProject, getProject, updateProject, deleteProject,
  importSwagger,
  listEndpoints, getEndpointStats,
  generateTests, listTestCases,
  runExecution, runSingleResult, getExecution, listExecutions,
  listBugs, dismissBug,
  detectApiWorkflows,
  listReports, downloadReport,
  handleQueue,
  healthCheck,
  testLoginProxy,
  // Flow suites
  listFlowSuites, createFlowSuite, getFlowSuite, updateFlowSuite, deleteFlowSuite,
  runFlowSuiteRoute, runFlowSuiteInline, listFlowRuns, getFlowRun,
  autoGenerateFlowSuite, updateFlowStep, deleteFlowRun, deleteAllFlowRuns,
  addFlowStep, createManualBug, quickCreateFromCapture,
  deleteFlowStep, reorderFlowSteps,
  generateFlowStep,
  adminErrorStats,
  listAdminErrors, listProjectErrors,
  addAdmin, listAdmins, removeAdmin,
  checkAdmin,
  listAiLogs
}
  from './routes/index.js';

// ─── Simple path router (no dependencies) ────────────────────────────────────

function router(method, path, handler) {
  return { method: method.toUpperCase(), pattern: path, handler };
}

const ROUTES = [
  // ── HitAPI Platform Auth ──────────────────────────────────────────────────
  router('POST', '/api/auth/signup', hitapiSignup),
  router('POST', '/api/auth/login', hitapiLogin),
  router('GET', '/api/auth/me', hitapiMe),
  router('POST', '/api/auth/accept-terms', hitapiAcceptTerms),
  router('GET', '/api/auth/terms-history', hitapiTermsHistory),
  // Flow Suites
  router('GET', '/api/projects/:id/flows', listFlowSuites),
  router('POST', '/api/projects/:id/flows', createFlowSuite),
  router('POST', '/api/projects/:id/flows/auto-generate', autoGenerateFlowSuite),
  router('GET', '/api/projects/:id/flows/:flowId', getFlowSuite),
  router('PUT', '/api/projects/:id/flows/:flowId', updateFlowSuite),
  router('DELETE', '/api/projects/:id/flows/:flowId', deleteFlowSuite),
  router('DELETE', '/api/projects/:id/flows/:flowId/runs', deleteAllFlowRuns),
  router('DELETE', '/api/projects/:id/runs/:runId', deleteFlowRun),
  router('POST', '/api/projects/:id/flows/:flowId/run', runFlowSuiteRoute),
  router('GET', '/api/projects/:id/flows/:flowId/runs', listFlowRuns),
  router('GET', '/api/projects/:id/flows/:flowId/runs/:runId', getFlowRun),
  router('PATCH', '/api/projects/:id/flows/:flowId/steps/:stepId', updateFlowStep),
  router('DELETE', '/api/projects/:id/flows/:flowId/steps/:stepId', deleteFlowStep),
  router('PUT', '/api/projects/:id/flows/:flowId/steps/reorder', reorderFlowSteps),
  router('POST', '/api/projects/:id/flows/:flowId/steps', addFlowStep),
  router('POST', '/api/projects/:id/flows/quick-create', quickCreateFromCapture),
  router('POST', '/api/projects/:id/bugs/manual', createManualBug),

  // Health
  router('GET', '/health', healthCheck),
  router('GET', '/api/health', healthCheck),

  // Projects
  router('GET', '/api/projects', listProjects),
  router('POST', '/api/projects', createProject),
  router('GET', '/api/projects/:id', getProject),
  router('PUT', '/api/projects/:id', updateProject),
  router('DELETE', '/api/projects/:id', deleteProject),

  // Test login (proxied through Worker to avoid browser CORS)
  router('POST', '/api/projects/:id/test-login', testLoginProxy),

  // Swagger Import
  router('POST', '/api/projects/:id/import', importSwagger),

  // Endpoints
  router('GET', '/api/projects/:id/endpoints', listEndpoints),
  router('GET', '/api/projects/:id/endpoints/stats', getEndpointStats),

  // AI Test Generation
  router('POST', '/api/projects/:id/generate', generateTests),
  router('GET', '/api/projects/:id/tests', listTestCases),
  router('POST', '/api/projects/:id/endpoints/:endpointId/generate-step', generateFlowStep),
  // Executions
  router('POST', '/api/projects/:id/run', runExecution),
  router('POST', '/api/projects/:id/run-single', runSingleResult),
  router('GET', '/api/projects/:id/executions', listExecutions),
  router('GET', '/api/projects/:id/executions/:execId', getExecution),

  // Bugs
  router('GET', '/api/projects/:id/bugs', listBugs),
  router('DELETE', '/api/projects/:id/bugs/:bugId', dismissBug),

  // Workflows
  router('GET', '/api/projects/:id/workflows', detectApiWorkflows),

  // Reports
  router('GET', '/api/projects/:id/reports', listReports),
  router('GET', '/api/reports/:reportId/download', downloadReport),

  router('GET', '/api/admin/errors', listAdminErrors),
  router('GET', '/api/admin/errors/stats', adminErrorStats),
  router('GET', '/api/projects/:id/errors', listProjectErrors),

  router('GET', '/api/admin/admins', listAdmins),
  router('POST', '/api/admin/admins', addAdmin),
  router('DELETE', '/api/admin/admins/:adminId', removeAdmin),
  router('GET', '/api/admin/check', checkAdmin),
  router('GET', '/api/projects/:id/ai-logs', listAiLogs),
];

/**
 * Match a URL path against a route pattern
 * Returns { matched: true, params: {} } or { matched: false }
 */
function matchRoute(pattern, urlPath) {
  const patternParts = pattern.split('/');
  const urlParts = urlPath.split('/');
  if (patternParts.length !== urlParts.length) return { matched: false };

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(urlParts[i]);
    } else if (patternParts[i] !== urlParts[i]) {
      return { matched: false };
    }
  }
  return { matched: true, params };
}

/**
 * Main fetch handler
 */
export default {

  async fetch(request, env, ctx) {
    try {
      // CORS preflight
      const corsResponse = handleCORS(request, env);
      if (corsResponse) return corsResponse;

      const url = new URL(request.url);
      const method = request.method.toUpperCase();
      let urlPath = url.pathname.replace(/\/$/, '') || '/';

      // Find matching route
      for (const route of ROUTES) {
        if (route.method !== method) continue;
        const { matched, params } = matchRoute(route.pattern, urlPath);
        if (!matched) continue;

        const PUBLIC = ['/api/auth/signup', '/api/auth/login', '/api/auth/accept-terms', '/health', '/api/health'];
        const isPublic = PUBLIC.some(p => urlPath === p || urlPath.startsWith(p));

        let authUser = null;
        if (!isPublic && urlPath.startsWith('/api/')) {
          authUser = await requireAuth(request, env);
          if (!authUser) {
            return json({ success: false, error: 'Unauthorized — please log in to HitAPI' }, 401, env);
          }

          if (params?.id && urlPath.startsWith('/api/projects/')) {
            const { assertProjectOwner } = await import('./routes/index.js');
            const owns = await assertProjectOwner(env, params.id, authUser.sub);
            if (!owns) {
              return json({ success: false, error: 'Project not found' }, 404, env);
            }
          }
        }

        return route.handler(request, env, { params, ctx, user: authUser });
      }

      return json({ error: 'Not found', path: urlPath }, 404, env);

    } catch (err) {
      // Log critical internal error — never let this break the response
      try {
        const { DatabaseAdapter } = await import('./db/adapter.js');
        const db = new DatabaseAdapter(env.DB);
        const { logInternalError } = await import('./services/errorLogger.js');
        await logInternalError(db, {
          source: 'worker',
          severity: 'critical',
          message: err.message,
          stack: err.stack,
          context: { url: request.url, method: request.method },
        });
      } catch { /* never let logging break the response */ }

      return new Response(JSON.stringify({
        success: false,
        error: 'Internal server error',
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  },

  async queue(batch, env) {
    return handleQueue(batch, env);
  },

  async scheduled(event, env, ctx) {
    const db = new (await import('./db/adapter.js')).DatabaseAdapter(env.DB);
    const monitors = await db.all(
      "SELECT * FROM monitors WHERE enabled = 1 AND schedule = ?",
      [cronToLabel(event.cron)]
    );

    for (const monitor of monitors) {
      if (env.TEST_QUEUE) {
        const { ExecutionRepo } = await import('./db/adapter.js');
        const execRepo = new ExecutionRepo(db);
        const execId = await execRepo.create(monitor.project_id, 'schedule');
        await env.TEST_QUEUE.send({ executionId: execId, projectId: monitor.project_id });
      }
    }
  }
};

function cronToLabel(cron) {
  const map = {
    '*/5 * * * *': '*/5 * * * *',
    '0 * * * *': 'hourly',
    '0 0 * * *': 'daily'
  };
  return map[cron] || cron;
}