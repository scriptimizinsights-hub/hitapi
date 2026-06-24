/**
 * API Routes — all endpoints for the APIForge worker
 */

import { DatabaseAdapter, ProjectRepo, EndpointRepo, TestCaseRepo, ExecutionRepo, BugRepo } from '../db/adapter.js';
import { fetchAndParseSpec, extractEndpoints, extractSpecInfo } from '../services/swagger.js';
import { generateTestCases, analyzeBug, detectWorkflows, generateRecommendations } from '../services/ai.js';
import { executeAll } from '../services/executor.js';
import { storeReport, getReport } from '../services/reports.js';
import { json, error, parseBody, success } from '../middleware/cors.js';

function repos(env) {
  const db = new DatabaseAdapter(env.DB);
  return {
    db,
    projects: new ProjectRepo(db),
    endpoints: new EndpointRepo(db),
    testCases: new TestCaseRepo(db),
    executions: new ExecutionRepo(db),
    bugs: new BugRepo(db)
  };
}

// ─── Projects ────────────────────────────────────────────────────────────────

export async function listProjects(request, env) {
  const { projects } = repos(env);
  const data = await projects.list();
  return json(success(data));
}

export async function createProject(request, env) {
  const body = await parseBody(request);
  if (!body?.name || !body?.base_url) return error('name and base_url are required');
  const { projects } = repos(env);
  const project = await projects.create(body);
  return json(success(project), 201);
}

export async function getProject(request, env, { params }) {
  const { projects } = repos(env);
  const project = await projects.get(params.id);
  if (!project) return error('Project not found', 404);
  return json(success(project));
}

export async function updateProject(request, env, { params }) {
  const body = await parseBody(request);
  const { projects } = repos(env);
  const project = await projects.update(params.id, body);
  return json(success(project));
}

export async function deleteProject(request, env, { params }) {
  const { projects } = repos(env);
  await projects.delete(params.id);
  return json(success({ deleted: true }));
}

// ─── Swagger Import ──────────────────────────────────────────────────────────

export async function importSwagger(request, env, { params }) {
  const body = await parseBody(request);
  const { projects, endpoints: epRepo } = repos(env);

  const project = await projects.get(params.id);
  if (!project) return error('Project not found', 404);

  // Use provided URL/content or fall back to project swagger_url
  const source = body?.swagger_url || body?.content || project.swagger_url;
  if (!source) return error('Provide swagger_url or content');

  const spec = await fetchAndParseSpec(source, env.CACHE);
  const info = extractSpecInfo(spec);
  const extracted = extractEndpoints(spec);

  await epRepo.upsertMany(params.id, extracted);
  const stats = await epRepo.stats(params.id);

  // Invalidate cache for this project's endpoints
  if (env.CACHE) {
    await env.CACHE.delete(`endpoints:${params.id}`);
  }

  return json(success({
    spec_info: info,
    imported: extracted.length,
    stats
  }));
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

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

// ─── AI Test Generation ──────────────────────────────────────────────────────

export async function generateTests(request, env, { params }) {
  const body = await parseBody(request);
  const r = repos(env);

  const project = await r.projects.get(params.id);
  if (!project) return error('Project not found', 404);

  // ── Flexible selection: single, multiple IDs, tag, method, or all ──
  let endpointsList = await r.endpoints.listByProject(params.id);

  if (body?.endpoint_id) {
    // Single endpoint
    endpointsList = endpointsList.filter(e => e.id === body.endpoint_id);
  } else if (body?.endpoint_ids?.length) {
    // Explicit list of IDs
    const ids = new Set(body.endpoint_ids);
    endpointsList = endpointsList.filter(e => ids.has(e.id));
  } else if (body?.tag) {
    // Filter by OpenAPI tag
    endpointsList = endpointsList.filter(e => {
      const tags = e.tags ? JSON.parse(e.tags) : [];
      return tags.includes(body.tag);
    });
  } else if (body?.method) {
    // Filter by HTTP method
    endpointsList = endpointsList.filter(e =>
      e.method === body.method.toUpperCase()
    );
  }
  // else: all endpoints (default)

  if (!endpointsList.length) return error('No endpoints found matching the filter.');

  const limit = body?.limit || 5;
  const generated = [];
  const errors = [];

  for (const endpoint of endpointsList.slice(0, limit)) {
    try {
      const ep = {
        ...endpoint,
        parameters: endpoint.parameters ? JSON.parse(endpoint.parameters) : [],
        request_body: endpoint.request_body ? JSON.parse(endpoint.request_body) : null,
        responses: endpoint.responses ? JSON.parse(endpoint.responses) : {},
        security: endpoint.security ? JSON.parse(endpoint.security) : []
      };

      const cases = await generateTestCases(env.AI, ep);
      if (!cases?.length) continue;

      const suiteId = await r.testCases.createSuite(
        params.id, endpoint.id,
        `AI Suite — ${endpoint.method} ${endpoint.path}`
      );
      await r.testCases.insertMany(suiteId, endpoint.id, cases);
      generated.push({ endpoint: `${endpoint.method} ${endpoint.path}`, count: cases.length });
    } catch (err) {
      errors.push({ endpoint: `${endpoint.method} ${endpoint.path}`, error: err.message });
    }
  }

  if (env.CACHE) await env.CACHE.delete(`endpoints:${params.id}`);

  return json(success({
    generated,
    errors,
    total: generated.reduce((s, g) => s + g.count, 0),
    skipped: endpointsList.length - generated.length - errors.length
  }));
}

// ─── Test Cases ──────────────────────────────────────────────────────────────

export async function listTestCases(request, env, { params }) {
  const url = new URL(request.url);
  const endpointId = url.searchParams.get('endpoint_id');
  const r = repos(env);

  let cases;
  if (endpointId) {
    cases = await r.testCases.listByEndpoint(endpointId);
  } else {
    cases = await r.testCases.listByProject(params.id);
  }

  return json(success(cases));
}

// ─── Executions ──────────────────────────────────────────────────────────────

export async function runExecution(request, env, { params }) {
  const body = await parseBody(request);
  const r = repos(env);

  const project = await r.projects.get(params.id);
  if (!project) return error('Project not found', 404);

  // Queue it if queue is available, otherwise run inline
  const executionId = await r.executions.create(params.id, body?.triggered || 'manual');

  if (env.TEST_QUEUE) {
    await env.TEST_QUEUE.send({ executionId, projectId: params.id });
    return json(success({ execution_id: executionId, status: 'queued' }));
  }

  // Fallback: run inline (for dev / platforms without queue)
  return runExecutionInline(executionId, params.id, env, r);
}

export async function runExecutionInline(executionId, projectId, env, r) {
  if (!r) r = repos(env);

  const project = await r.projects.get(projectId);
  const endpoints = await r.endpoints.listByProject(projectId);
  const testCases = await r.testCases.listByProject(projectId);

  if (!testCases.length) {
    await r.executions.update(executionId, { status: 'failed', started_at: Math.floor(Date.now() / 1000), finished_at: Math.floor(Date.now() / 1000) });
    return json(error('No test cases found. Generate tests first.'));
  }

  await r.executions.update(executionId, { status: 'running', started_at: Math.floor(Date.now() / 1000), total: testCases.length });

  const { results, summary, loginResult } = await executeAll(testCases, endpoints, project);

  // Save results and detect bugs
  const bugsList = [];
  for (const result of results) {
    await r.executions.saveResult(executionId, result);

    if (result.status === 'failed' || result.status === 'error') {
      const tc = testCases.find(t => t.id === result.test_case_id);
      const ep = endpoints.find(e => e.id === result.endpoint_id);
      if (tc && ep) {
        const bug = await analyzeBug(env.AI, { endpoint: ep, testCase: tc, result });
        if (bug) {
          await r.bugs.create({ project_id: projectId, execution_id: executionId, endpoint_id: ep.id, ...bug });
          bugsList.push(bug);
        }
      }
    }
  }

  await r.executions.update(executionId, {
    status: 'done',
    finished_at: Math.floor(Date.now() / 1000),
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped
  });

  // Generate and store HTML report in R2
  if (env.REPORTS) {
    const execution = await r.executions.get(executionId);
    const fullResults = await r.executions.getResults(executionId);
    const reportMeta = await storeReport(env.REPORTS, {
      execution, results: fullResults, bugs: bugsList, project, format: 'html'
    });
    const db = new DatabaseAdapter(env.DB);
    await db.run(
      'INSERT INTO reports (id, execution_id, project_id, format, r2_key, size_bytes) VALUES (?, ?, ?, ?, ?, ?)',
      [db.uuid(), executionId, projectId, 'html', reportMeta.key, reportMeta.size_bytes]
    );
  }

  return json(success({
    execution_id: executionId,
    summary,
    login: loginResult,
    bugs: bugsList.length,
    results: results.map(r => ({
      test_case_id: r.test_case_id,
      endpoint_id: r.endpoint_id,
      status: r.status,
      actual_status: r.actual_status,
      response_time_ms: r.response_time_ms,
      failure_reason: r.failure_reason,
      actual_body: r.actual_body
    }))
  }));
}

export async function getExecution(request, env, { params }) {
  const r = repos(env);
  const execution = await r.executions.get(params.execId);
  if (!execution) return error('Execution not found', 404);
  const results = await r.executions.getResults(params.execId);
  return json(success({ execution, results }));
}

export async function listExecutions(request, env, { params }) {
  const r = repos(env);
  const data = await r.executions.listByProject(params.id);
  return json(success(data));
}

// ─── Bugs ───────────────────────────────────────────────────────────────────

export async function listBugs(request, env, { params }) {
  const { bugs } = repos(env);
  const data = await bugs.listByProject(params.id);
  return json(success(data));
}

export async function dismissBug(request, env, { params }) {
  const { bugs } = repos(env);
  await bugs.dismiss(params.bugId);
  return json(success({ dismissed: true }));
}

// ─── Workflows (AI) ─────────────────────────────────────────────────────────

export async function detectApiWorkflows(request, env, { params }) {
  const { endpoints: epRepo } = repos(env);
  const endpoints = await epRepo.listByProject(params.id);
  const workflows = await detectWorkflows(env.AI, endpoints);
  return json(success(workflows));
}

// ─── Reports ────────────────────────────────────────────────────────────────

export async function listReports(request, env, { params }) {
  const db = new DatabaseAdapter(env.DB);
  const reports = await db.all(
    'SELECT * FROM reports WHERE project_id = ? ORDER BY created_at DESC LIMIT 10',
    [params.id]
  );
  return json(success(reports));
}

export async function downloadReport(request, env, { params }) {
  if (!env.REPORTS) return error('R2 storage not configured', 503);
  const db = new DatabaseAdapter(env.DB);
  const report = await db.first('SELECT * FROM reports WHERE id = ?', [params.reportId]);
  if (!report) return error('Report not found', 404);

  const file = await getReport(env.REPORTS, report.r2_key);
  if (!file) return error('Report file not found in storage', 404);

  return new Response(file.body, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `inline; filename="report.${report.format}"`,
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

// ─── Queue consumer ─────────────────────────────────────────────────────────

export async function handleQueue(batch, env) {
  for (const message of batch.messages) {
    const { executionId, projectId } = message.body;
    try {
      await runExecutionInline(executionId, projectId, env, null);
      message.ack();
    } catch (err) {
      console.error('Queue execution failed:', err);
      message.retry();
    }
  }
}

// ─── Test login proxy (avoids browser CORS) ──────────────────────────────────

export async function testLoginProxy(request, env, { params }) {
  const body = await parseBody(request);
  if (!body?.login_url) return error('login_url is required');
  if (!body?.login_body) return error('login_body is required');

  let loginBody;
  try {
    loginBody = typeof body.login_body === 'string' ? JSON.parse(body.login_body) : body.login_body;
  } catch {
    return error('login_body must be valid JSON');
  }

  const tokenPath = body.token_path || 'token';

  try {
    const res = await fetch(body.login_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginBody)
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return json(success({
        success: false,
        message: `HTTP ${res.status} from login endpoint — ${JSON.stringify(data).slice(0, 150)}`
      }));
    }

    // Extract token using dot-path
    const token = tokenPath.split('.').reduce((obj, k) => obj?.[k], data);

    if (token) {
      return json(success({
        success: true,
        token_path: tokenPath,
        token_preview: String(token).slice(0, 40) + (String(token).length > 40 ? '…' : ''),
        message: `Token found at "${tokenPath}"`
      }));
    } else {
      return json(success({
        success: false,
        message: `Login returned ${res.status} but no token found at path "${tokenPath}". Response keys: ${Object.keys(data).join(', ')}`
      }));
    }
  } catch (err) {
    return json(success({
      success: false,
      message: `Request failed: ${err.message}`
    }));
  }
}

// ─── Health ──────────────────────────────────────────────────────────────────

export async function healthCheck(request, env) {
  return json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    services: {
      db: !!env.DB,
      cache: !!env.CACHE,
      queue: !!env.TEST_QUEUE,
      r2: !!env.REPORTS,
      ai: !!env.AI
    }
  });
}