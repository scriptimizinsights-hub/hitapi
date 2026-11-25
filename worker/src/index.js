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
  generateTests, listTestCases,
  runExecution, runSingleResult, getExecution, listExecutions,
  listBugs, dismissBug,
  detectApiWorkflows,
  listReports, downloadReport,
  handleQueue,
  healthCheck,
  publicRequest, publicInfo,
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
  listAiLogs, pollAgentJobs, submitAgentJobResult, agentStatus,
}
  from './routes/index.js';

import { listEndpoints, getEndpointStats, deleteEndpoint, createEndpoint } from './repository/repository.js';
import {
  getMockServer, generateMockServer, updateMockServer, deleteMockServer,
  aiImproveMockBatch, updateMockRoute, aiMockRoute,
} from './routes/mock.js';
import { handleMockRequest } from './services/mock/serve.js';
import { withRequestLog, trackPageView } from './services/requestLog.js';
import { isDailyLimit, limitResponse, checkLimit, simulateLimit } from './services/dailyLimit.js';
import { adminTraffic } from './routes/traffic.js';
import { getExtensionSync, putExtensionSync, deleteExtensionSync } from './routes/extensionSync.js';
import { listApiKeys, createApiKey, deleteApiKey } from './routes/apiKeys.js';
import { listSchedules, createSchedule, updateSchedule, deleteSchedule, runScheduleNow, listScheduleRuns, getScheduleRun } from './routes/schedules.js';
import { createPlaygroundMock, updatePlaygroundMock, generateMockData, importSpecRoutes } from './routes/mockPlayground.js';
import { adminStats, adminListUsers, adminListProjects, adminActivity, isSuperAdmin, getProjectOwnerId, redactResponse } from './routes/admin.js';

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
  router('GET', '/api/public', publicInfo),
  router('POST', '/api/public/request', publicRequest),

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
  router('DELETE', '/api/projects/:id/endpoints/:endpointId', deleteEndpoint),
  router('GET', '/api/projects/:id/endpoints/stats', getEndpointStats),
  router('POST', '/api/projects/:id/endpoints', createEndpoint),
  // AI Test Generation
  router('POST', '/api/projects/:id/generate', generateTests),
  router('GET', '/api/projects/:id/tests', listTestCases),
  // Mock server (management; the public mock itself is served from /mock/<slug>/...)
  router('GET', '/api/projects/:id/mock', getMockServer),
  router('POST', '/api/projects/:id/mock', generateMockServer),
  router('PUT', '/api/projects/:id/mock', updateMockServer),
  router('DELETE', '/api/projects/:id/mock', deleteMockServer),
  router('POST', '/api/projects/:id/mock/ai', aiImproveMockBatch),
  router('PUT', '/api/projects/:id/mock/responses/:rid', updateMockRoute),
  router('POST', '/api/projects/:id/mock/responses/:rid/ai', aiMockRoute),
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
  // Super admin
  router('GET', '/api/admin/stats', adminStats),
  router('GET', '/api/admin/users', adminListUsers),
  router('GET', '/api/admin/projects', adminListProjects),
  router('GET', '/api/admin/activity', adminActivity),
  router('GET', '/api/admin/traffic', adminTraffic),
  // Website page views (public; logged-in visitors send their token)
  router('POST', '/api/public/track', trackPageView),
  // Mock Playground (hitapi.dev/mock-playground): temporary mocks without an account
  router('POST', '/api/public/mocks', createPlaygroundMock),
  router('PUT', '/api/public/mocks/:id', updatePlaygroundMock),
  router('POST', '/api/public/mock-tools/generate', generateMockData),
  router('POST', '/api/public/mock-tools/import', importSpecRoutes),

  router('GET', '/api/projects/:id/ai-logs', listAiLogs),
  router('GET', '/api/agent/jobs', pollAgentJobs),
  router('POST', '/api/agent/jobs/:jobId/result', submitAgentJobResult),
  router('GET', '/api/agent/status', agentStatus),
  // Browser extension: Workbench sync across devices
  router('GET', '/api/extension/sync', getExtensionSync),
  router('PUT', '/api/extension/sync/:kind', putExtensionSync),
  router('DELETE', '/api/extension/sync', deleteExtensionSync),

  // Personal API keys (CI, scripts)
  router('GET', '/api/keys', listApiKeys),
  router('POST', '/api/keys', createApiKey),
  router('DELETE', '/api/keys/:id', deleteApiKey),

  // Cloud schedules for Workbench collections, folders and scenarios (website W9)
  router('GET', '/api/schedules', listSchedules),
  router('POST', '/api/schedules', createSchedule),
  router('PATCH', '/api/schedules/:id', updateSchedule),
  router('DELETE', '/api/schedules/:id', deleteSchedule),
  router('POST', '/api/schedules/:id/run', runScheduleNow),
  router('GET', '/api/schedules/:id/runs', listScheduleRuns),
  router('GET', '/api/schedules/:id/runs/:runId', getScheduleRun),
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
async function handleFetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      // Public mock servers: no login, open CORS, any method
      if (url.pathname.startsWith('/mock/')) return await handleMockRequest(request, env);
      if (url.pathname === '/api/public' || url.pathname.startsWith('/api/public/')) {
        env = { ...env, CORS_ORIGIN: '*' };
      }

      // Handle CORS preflight requests
      const corsResponse = handleCORS(request, env);
      if (corsResponse) return corsResponse;
      const method = request.method.toUpperCase();
      let urlPath = url.pathname.replace(/\/$/, '') || '/';

      // Find matching route
      for (const route of ROUTES) {
        if (route.method !== method) continue;
        const { matched, params } = matchRoute(route.pattern, urlPath);
        if (!matched) continue;

        const PUBLIC = ['/api/auth/signup', '/api/auth/login', '/api/auth/accept-terms', '/health', '/api/health', '/api/public'];
        const isPublic = PUBLIC.some(p => urlPath === p || urlPath.startsWith(p));

        let authUser = null;
        if (!isPublic && urlPath.startsWith('/api/')) {
          authUser = await requireAuth(request, env);
          if (!authUser) {
            return json({ success: false, error: 'Unauthorized — please log in to HitAPI' }, 401, env);
          }
          // API keys act as their user, but never as a super admin
          if (authUser.via === 'api_key' && urlPath.startsWith('/api/admin')) {
            return json({ success: false, error: 'API keys can\'t use admin routes. Sign in instead.' }, 403, env);
          }

          if (params?.id && urlPath.startsWith('/api/projects/')) {
            const { assertProjectOwner } = await import('./routes/index.js');
            const owns = await assertProjectOwner(env, params.id, authUser.sub);
            if (!owns) {
              // Super admins may VIEW any project (read-only), seen as its owner
              const ownerId = await getProjectOwnerId(env, params.id);
              if (!ownerId || authUser.via === 'api_key' || !(await isSuperAdmin(env, authUser))) {
                return json({ success: false, error: 'Project not found' }, 404, env);
              }
              if (method !== 'GET') {
                return json({ success: false, error: 'Read-only: super admins can view but not change another user\'s project' }, 403, env);
              }
              const res = await route.handler(request, env, {
                params, ctx, user: { ...authUser, sub: ownerId, admin_viewer: authUser.sub },
              });
              return redactResponse(res); // never expose stored credentials
            }
          }
        }

        return await route.handler(request, env, { params, ctx, user: authUser });
      }

      return json({ error: 'Not found', path: urlPath }, 404, env);

    } catch (err) {
      // D1's daily free limit: say so clearly (logging it would fail too)
      if (isDailyLimit(err?.message)) return limitResponse(err.message);
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
}

export default {

  // Every request is recorded in request_logs (Super Admin → Traffic)
  async fetch(request, env, ctx) {
    env = simulateLimit(env);   // local development only
    try {
      // a handler that reported D1's daily limit as a 5xx → 503 DAILY_LIMIT (docs/platform/usage-limits.md)
      return await checkLimit(await withRequestLog(request, env, ctx, handleFetch));
    } catch (err) {
      if (isDailyLimit(err?.message)) return limitResponse(err.message);
      throw err;
    }
  },

  async queue(batch, env) {
    // cloud schedule runs (website W9); everything else as before
    const mine = batch.messages.filter(m => m.body?.type === 'schedule_run');
    if (mine.length) {
      const { handleScheduleMessages } = await import('./services/schedules/runner.js');
      await handleScheduleMessages(mine, env);
      if (mine.length === batch.messages.length) return;
      return handleQueue({ ...batch, messages: batch.messages.filter(m => m.body?.type !== 'schedule_run') }, env);
    }
    return handleQueue(batch, env);
  },

  async scheduled(event, env, ctx) {
    // hourly (free plan): Workbench schedules that are due (website W9) and old Local Agent jobs.
    // '* * * * *' is still accepted, in case wrangler.toml wasn't updated yet.
    if (event.cron === '0 * * * *' || event.cron === '* * * * *') {
      const { runDueSchedules, cleanupLocalJobs } = await import('./services/schedules/runner.js');
      await runDueSchedules(env, ctx);
      if (event.cron === '0 * * * *') ctx.waitUntil(cleanupLocalJobs(env));
      return;
    }
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