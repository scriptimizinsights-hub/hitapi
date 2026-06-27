/**
 * HitAPI — Cloudflare Worker Entry Point
 * Deployable on Cloudflare Workers OR any platform with the Web Fetch API
 * (Node.js with @cloudflare/workers-types, Deno, Bun, etc.)
 */

import { handleCORS, json } from './middleware/cors.js';
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
  autoGenerateFlowSuite, updateFlowStep,
} from './routes/index.js';

// ─── Simple path router (no dependencies) ────────────────────────────────────

function router(method, path, handler) {
  return { method: method.toUpperCase(), pattern: path, handler };
}

const ROUTES = [
  // Flow Suites
  router('GET', '/api/projects/:id/flows', listFlowSuites),
  router('POST', '/api/projects/:id/flows', createFlowSuite),
  router('POST', '/api/projects/:id/flows/auto-generate', autoGenerateFlowSuite),
  router('GET', '/api/projects/:id/flows/:flowId', getFlowSuite),
  router('PUT', '/api/projects/:id/flows/:flowId', updateFlowSuite),
  router('DELETE', '/api/projects/:id/flows/:flowId', deleteFlowSuite),
  router('POST', '/api/projects/:id/flows/:flowId/run', runFlowSuiteRoute),
  router('GET', '/api/projects/:id/flows/:flowId/runs', listFlowRuns),
  router('GET', '/api/projects/:id/flows/:flowId/runs/:runId', getFlowRun),
  router('PATCH', '/api/projects/:id/flows/:flowId/steps/:stepId', updateFlowStep),

  // Health
  router('GET', '/health', healthCheck),

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
      if (matched) {
        return route.handler(request, env, { params, ctx });
      }
    }

    // 404
    return json({ error: 'Not found', path: urlPath }, 404, env);
  },

  /**
   * Queue consumer — handles async test execution
   */
  async queue(batch, env) {
    return handleQueue(batch, env);
  },

  // Scheduled handler — for monitors (Cloudflare Cron Triggers)
  // Configure in wrangler.toml under [triggers]: crons = ["*\/5 * * * *"]
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