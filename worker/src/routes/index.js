/**
 * API Routes — all endpoints for the HitAPI worker
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

      // If AI inferred a payload, cache it on the endpoint for next time
      if (ep._ai_inferred_payload) {
        const r2 = repos(env);
        await r2.db?.run(
          `UPDATE endpoints SET request_body = ? WHERE id = ?`,
          [JSON.stringify({
            ...(endpoint.request_body ? JSON.parse(endpoint.request_body) : {}),
            _example: ep._ai_inferred_payload
          }), endpoint.id]
        ).catch(() => { }); // non-critical
      }

      // Delete existing test cases for this endpoint before inserting new ones
      await r.testCases.deleteByEndpoint(endpoint.id);

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
      actual_headers: r.actual_headers,
      response_time_ms: r.response_time_ms,
      failure_reason: r.failure_reason,
      actual_body: r.actual_body
    }))
  }));
}

// ─── Save single test result (from browser direct run) ───────────────────────

export async function runSingleResult(request, env, { params }) {
  const body = await parseBody(request);
  if (!body?.test_case_id) return error('test_case_id required');

  const r = repos(env);

  // Create a mini execution record for this single run
  const executionId = await r.executions.create(params.id, 'single');

  // Save the result
  await r.executions.saveResult(executionId, {
    test_case_id: body.test_case_id,
    endpoint_id: body.endpoint_id,
    status: body.status,
    actual_status: body.actual_status,
    actual_body: body.actual_body,
    actual_headers: body.actual_headers,
    response_time_ms: body.response_time_ms,
    failure_reason: body.failure_reason,
    ai_analysis: null
  });

  // Update execution summary
  const passed = body.status === 'passed' ? 1 : 0;
  await r.executions.complete(executionId, {
    total: 1, passed, failed: 1 - passed
  });

  // Auto-detect bug if failed
  if (body.status !== 'passed' && env.AI) {
    try {
      const testCase = await r.testCases.get(body.test_case_id);
      const endpoint = testCase ? await r.endpoints.get(testCase.endpoint_id) : null;
      if (testCase && endpoint) {
        const { analyzeBug } = await import('../services/ai.js');
        const analysis = await analyzeBug(env.AI, { endpoint, testCase, result: body });
        if (analysis) {
          await r.bugs.create({
            project_id: params.id,
            execution_id: executionId,
            endpoint_id: body.endpoint_id,
            severity: analysis.severity || 'medium',
            title: analysis.title || `${endpoint.method} ${endpoint.path} failed`,
            description: analysis.description || body.failure_reason,
            root_cause: analysis.root_cause || '',
            suggested_fix: analysis.suggested_fix || ''
          });
        }
      }
    } catch { /* non-critical */ }
  }

  return json(success({ execution_id: executionId, status: body.status }));
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

// ─── Flow Suites ─────────────────────────────────────────────────────────────

export async function listFlowSuites(request, env, { params }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  const suites = await db.all(
    `SELECT fs.*, COUNT(fst.id) as step_count
     FROM flow_suites fs
     LEFT JOIN flow_steps fst ON fst.suite_id = fs.id
     WHERE fs.project_id = ? GROUP BY fs.id ORDER BY fs.created_at DESC`,
    [params.id]
  );
  return json(success(suites));
}

export async function createFlowSuite(request, env, { params }) {
  const body = await parseBody(request);
  if (!body?.name) return error('name is required');
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  const id = db.uuid();
  await db.run(
    `INSERT INTO flow_suites (id, project_id, name, description) VALUES (?, ?, ?, ?)`,
    [id, params.id, body.name, body.description || '']
  );
  // Insert steps if provided
  if (body.steps?.length) {
    for (const step of body.steps) {
      const sid = db.uuid();
      await db.run(
        `INSERT INTO flow_steps (id, suite_id, step_order, name, endpoint_id, method, url_override, input_payload, input_headers, input_params, expected_status, extract_vars, skip_if_failed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sid, id, step.step_order, step.name, step.endpoint_id || null, step.method || null,
          step.url_override || null,
          step.input_payload ? JSON.stringify(step.input_payload) : null,
          step.input_headers ? JSON.stringify(step.input_headers) : null,
          step.input_params ? JSON.stringify(step.input_params) : null,
          step.expected_status || null,
          step.extract_vars ? JSON.stringify(step.extract_vars) : null,
          step.skip_if_failed ? 1 : 0]
      );
    }
  }
  const suite = await db.first(`SELECT * FROM flow_suites WHERE id = ?`, [id]);
  return json(success(suite), 201);
}

export async function getFlowSuite(request, env, { params }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  const suite = await db.first(`SELECT * FROM flow_suites WHERE id = ? AND project_id = ?`, [params.flowId, params.id]);
  if (!suite) return error('Suite not found', 404);
  const steps = await db.all(
    `SELECT fs.*, e.path as endpoint_path, e.method as endpoint_method, e.summary
     FROM flow_steps fs LEFT JOIN endpoints e ON e.id = fs.endpoint_id
     WHERE fs.suite_id = ? ORDER BY fs.step_order`,
    [params.flowId]
  );
  return json(success({ suite, steps }));
}

export async function updateFlowSuite(request, env, { params }) {
  const body = await parseBody(request);
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  if (body.name || body.description !== undefined) {
    await db.run(
      `UPDATE flow_suites SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = unixepoch() WHERE id = ?`,
      [body.name || null, body.description ?? null, params.flowId]
    );
  }
  // Replace steps if provided
  if (body.steps) {
    await db.run(`DELETE FROM flow_steps WHERE suite_id = ?`, [params.flowId]);
    for (const step of body.steps) {
      const sid = db.uuid();
      await db.run(
        `INSERT INTO flow_steps (id, suite_id, step_order, name, endpoint_id, method, url_override, input_payload, input_headers, input_params, expected_status, extract_vars, skip_if_failed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sid, params.flowId, step.step_order, step.name, step.endpoint_id || null, step.method || null,
          step.url_override || null,
          step.input_payload ? JSON.stringify(step.input_payload) : null,
          step.input_headers ? JSON.stringify(step.input_headers) : null,
          step.input_params ? JSON.stringify(step.input_params) : null,
          step.expected_status || null,
          step.extract_vars ? JSON.stringify(step.extract_vars) : null,
          step.skip_if_failed ? 1 : 0]
      );
    }
  }
  const suite = await db.first(`SELECT * FROM flow_suites WHERE id = ?`, [params.flowId]);
  return json(success(suite));
}

export async function deleteFlowSuite(request, env, { params }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  await db.run(`DELETE FROM flow_suites WHERE id = ? AND project_id = ?`, [params.flowId, params.id]);
  return json(success({ deleted: true }));
}

export async function runFlowSuiteRoute(request, env, { params }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  const { runFlowSuite } = await import('../services/flow.js');

  const body = await parseBody(request).catch(() => ({}));
  const skipStepIds = body?.skip_step_ids || [];

  const suite = await db.first(`SELECT * FROM flow_suites WHERE id = ? AND project_id = ?`, [params.flowId, params.id]);
  if (!suite) return error('Suite not found', 404);

  const allSteps = await db.all(
    `SELECT fs.*, e.path as endpoint_path, e.method as endpoint_method
     FROM flow_steps fs LEFT JOIN endpoints e ON e.id = fs.endpoint_id
     WHERE fs.suite_id = ? ORDER BY fs.step_order`,
    [params.flowId]
  );
  if (!allSteps.length) return error('Suite has no steps');

  // Mark steps as skipped if in skipStepIds
  const steps = allSteps.map(s => ({
    ...s,
    _force_skip: skipStepIds.includes(s.id)
  }));

  const project = await db.first(`SELECT * FROM projects WHERE id = ?`, [params.id]);
  if (!project) return error('Project not found', 404);

  // Create run record — count only non-skipped steps
  const activeSteps = steps.filter(s => !s._force_skip);
  const runId = db.uuid();
  await db.run(
    `INSERT INTO flow_runs (id, suite_id, project_id, status, total_steps) VALUES (?, ?, ?, 'running', ?)`,
    [runId, params.flowId, params.id, steps.length]
  );

  // Execute the suite
  const { results, context, summary } = await runFlowSuite(suite, steps, project);

  // Save step results
  for (const r of results) {
    const rid = db.uuid();
    await db.run(
      `INSERT INTO flow_step_results (id, run_id, step_id, step_order, step_name, status, actual_status, request_url, request_method, request_headers, request_body, actual_body, actual_headers, response_time_ms, failure_reason, extracted_vars)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [rid, runId, r.step_id, r.step_order, r.step_name, r.status, r.actual_status ?? null,
        r.request_url ?? null, r.request_method ?? null,
        r.request_headers ? JSON.stringify(r.request_headers) : null,
        r.request_body ? JSON.stringify(r.request_body) : null,
        r.actual_body ? JSON.stringify(r.actual_body) : null,
        r.actual_headers ? JSON.stringify(r.actual_headers) : null,
        r.response_time_ms ?? null, r.failure_reason ?? null,
        r.extracted_vars ? JSON.stringify(r.extracted_vars) : null]
    );
  }

  // Update run record
  await db.run(
    `UPDATE flow_runs SET status = ?, passed = ?, failed = ?, context = ?, finished_at = unixepoch() WHERE id = ?`,
    [summary.failed === 0 ? 'done' : 'failed', summary.passed, summary.failed,
    JSON.stringify(context), runId]
  );

  return json(success({ run_id: runId, summary, results, context }));
}

export async function listFlowRuns(request, env, { params }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  const runs = await db.all(
    `SELECT * FROM flow_runs WHERE suite_id = ? ORDER BY started_at DESC LIMIT 20`,
    [params.flowId]
  );
  return json(success(runs));
}

export async function updateFlowStep(request, env, { params }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  const body = await parseBody(request);

  const fields = [];
  const values = [];

  if (body.input_payload !== undefined) {
    fields.push('input_payload = ?');
    values.push(body.input_payload ? JSON.stringify(body.input_payload) : null);
  }
  if (body.input_params !== undefined) {
    fields.push('input_params = ?');
    values.push(body.input_params ? JSON.stringify(body.input_params) : null);
  }
  if (body.expected_status !== undefined) {
    fields.push('expected_status = ?');
    values.push(body.expected_status || null);
  }
  if (body.extract_vars !== undefined) {
    fields.push('extract_vars = ?');
    values.push(body.extract_vars?.length ? JSON.stringify(body.extract_vars) : null);
  }
  if (body.name !== undefined) {
    fields.push('name = ?');
    values.push(body.name);
  }

  if (!fields.length) return error('Nothing to update');

  values.push(params.stepId);
  await db.run(`UPDATE flow_steps SET ${fields.join(', ')} WHERE id = ?`, values);

  const updated = await db.first(`SELECT * FROM flow_steps WHERE id = ?`, [params.stepId]);
  return json(success(updated));
}

export async function getFlowRun(request, env, { params }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  const run = await db.first(`SELECT * FROM flow_runs WHERE id = ?`, [params.runId]);
  if (!run) return error('Run not found', 404);
  const stepResults = await db.all(
    `SELECT * FROM flow_step_results WHERE run_id = ? ORDER BY step_order`,
    [params.runId]
  );
  return json(success({ run, stepResults }));
}

// ─── Auto-generate a flow suite from project endpoints ───────────────────────
export async function autoGenerateFlowSuite(request, env, { params }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);

  // Get all endpoints for this project
  const endpoints = await db.all(
    `SELECT * FROM endpoints WHERE project_id = ? ORDER BY path, method`,
    [params.id]
  );

  if (!endpoints.length) return error('No endpoints found. Import Swagger first.');

  console.log(`[Flow] Auto-generate: ${endpoints.length} endpoints found`);
  console.log(`[Flow] Paths:`, endpoints.map(e => `${e.method} ${e.path}`).join(', '));

  // Find signup endpoint — flexible matching
  const signupEp = endpoints.find(e =>
    e.method === 'POST' && (
      e.path.toLowerCase().includes('signup') ||
      e.path.toLowerCase().includes('register') ||
      e.summary?.toLowerCase().includes('sign up') ||
      e.summary?.toLowerCase().includes('register')
    )
  );

  // Find login endpoint — flexible matching
  const loginEp = endpoints.find(e =>
    e.method === 'POST' && (
      e.path.toLowerCase().includes('login') ||
      e.path.toLowerCase().includes('signin') ||
      e.path.toLowerCase().includes('sign-in') ||
      e.path.toLowerCase().includes('token') ||
      e.path.toLowerCase().includes('auth/login') ||
      e.summary?.toLowerCase().includes('login') ||
      e.summary?.toLowerCase().includes('sign in') ||
      e.summary?.toLowerCase().includes('authenticate')
    )
  );

  console.log(`[Flow] signupEp: ${signupEp ? signupEp.path : 'NOT FOUND'}`);
  console.log(`[Flow] loginEp: ${loginEp ? loginEp.path : 'NOT FOUND'}`);

  // Find secured endpoints — try security field first, fall back to all non-auth endpoints
  let securedEndpoints = endpoints.filter(e => {
    if (!e.security) return false;
    try {
      const sec = JSON.parse(e.security);
      return Array.isArray(sec) && sec.length > 0;
    } catch { return false; }
  }).filter(e => e.id !== loginEp?.id && e.id !== signupEp?.id);

  console.log(`[Flow] securedEndpoints (from security field): ${securedEndpoints.length}`);

  // If no endpoints have security field set, include ALL non-auth endpoints
  if (securedEndpoints.length === 0) {
    securedEndpoints = endpoints.filter(e => {
      const path = e.path.toLowerCase();
      const isAuthEndpoint = path.includes('login') || path.includes('signup') ||
        path.includes('register') || path.includes('signin') || path.includes('token') ||
        path.includes('/auth/') || path.includes('password/reset') || path.includes('logout');
      return !isAuthEndpoint && e.id !== loginEp?.id && e.id !== signupEp?.id;
    });
    console.log(`[Flow] securedEndpoints (fallback — all non-auth): ${securedEndpoints.length}`);
  }

  const steps = [];
  let order = 1;

  // Step 1: Signup (if found)
  if (signupEp) {
    const schema = signupEp.request_body ? JSON.parse(signupEp.request_body) : null;
    const fields = schema?.properties ? Object.keys(schema.properties) : ['email', 'password', 'name'];
    const payload = {};
    fields.forEach(f => {
      const n = f.toLowerCase();
      if (n.includes('email')) payload[f] = 'test@example.com';
      else if (n.includes('password')) payload[f] = 'Test@123456';
      else if (n.includes('name')) payload[f] = 'Test User';
      else payload[f] = 'test_value';
    });

    steps.push({
      step_order: order++,
      name: 'Sign up',
      endpoint_id: signupEp.id,
      method: 'POST',
      input_payload: payload,
      expected_status: 201,
      extract_vars: [{ var: 'userId', path: 'data.id' }, { var: 'userId', path: 'id' }],
      skip_if_failed: 0
    });
  }

  // Step 2: Login (required)
  if (loginEp) {
    const schema = loginEp.request_body ? JSON.parse(loginEp.request_body) : null;
    const fields = schema?.properties ? Object.keys(schema.properties) : ['email', 'password'];
    const payload = {};
    fields.forEach(f => {
      const n = f.toLowerCase();
      if (n.includes('email')) payload[f] = 'test@example.com';
      else if (n.includes('password') || n.includes('pass')) payload[f] = 'Test@123456';
      else if (n.includes('username') || n.includes('user')) payload[f] = 'testuser';
      else payload[f] = 'test_value';
    });

    steps.push({
      step_order: order++,
      name: 'Login',
      endpoint_id: loginEp.id,
      method: 'POST',
      input_payload: payload,
      expected_status: 200,
      // Extract token — try multiple common paths
      extract_vars: [
        { var: 'token', path: 'token' },
        { var: 'token', path: 'data.token' },
        { var: 'token', path: 'access_token' },
        { var: 'token', path: 'data.access_token' },
        { var: 'token', path: 'result.token' }
      ],
      skip_if_failed: 0
    });
  }

  // Step 3+: Secured endpoints (up to 10)
  for (const ep of securedEndpoints.slice(0, 10)) {
    const schema = ep.request_body ? JSON.parse(ep.request_body) : null;
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(ep.method);
    let payload = null;
    if (hasBody && schema?.properties) {
      payload = {};
      Object.keys(schema.properties).forEach(f => {
        const n = f.toLowerCase();
        if (n.includes('id')) payload[f] = '{{userId}}';
        else if (n.includes('title') || n.includes('name')) payload[f] = 'Test Item';
        else if (n.includes('desc')) payload[f] = 'Test description';
        else payload[f] = 'test_value';
      });
    }

    // Extract path params from URL template
    const pathParams = (ep.path.match(/\{(\w+)\}/g) || []).map(p => p.slice(1, -1));
    const inputParams = pathParams.length
      ? Object.fromEntries(pathParams.map(p => [p, p.toLowerCase().includes('id') ? '{{userId}}' : '1']))
      : null;

    steps.push({
      step_order: order++,
      name: `${ep.method} ${ep.path}`,
      endpoint_id: ep.id,
      method: ep.method,
      input_payload: payload,
      input_params: inputParams,
      swagger_example: !payload && ep.request_body
        ? (() => { try { const rb = JSON.parse(ep.request_body); return rb._example || null; } catch { return null; } })()
        : null,
      expected_status: ep.method === 'DELETE' ? 204 : ep.method === 'POST' ? 201 : 200,
      extract_vars: [],
      skip_if_failed: 1
    });
  }

  if (!steps.length) return error(
    `Could not generate steps. Found: signup=${signupEp?.path || 'none'}, login=${loginEp?.path || 'none'}, secured=${securedEndpoints.length} endpoints. Total endpoints: ${endpoints.length}. Paths: ${endpoints.slice(0, 5).map(e => e.method + ' ' + e.path).join(', ')}`
  );

  // Create the suite
  const project = await db.first(`SELECT * FROM projects WHERE id = ?`, [params.id]);
  const suiteId = db.uuid();
  await db.run(
    `INSERT INTO flow_suites (id, project_id, name, description) VALUES (?, ?, ?, ?)`,
    [suiteId, params.id, `${project?.name || 'API'} — Full Auth Flow`, `Auto-generated: signup → login → ${securedEndpoints.length} secured endpoints`]
  );

  for (const step of steps) {
    const sid = db.uuid();
    await db.run(
      `INSERT INTO flow_steps (id, suite_id, step_order, name, endpoint_id, method, input_payload, input_params, expected_status, extract_vars, skip_if_failed, swagger_example)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sid, suiteId, step.step_order, step.name, step.endpoint_id || null, step.method,
        step.input_payload ? JSON.stringify(step.input_payload) : null,
        step.input_params ? JSON.stringify(step.input_params) : null,
        step.expected_status || null,
        step.extract_vars?.length ? JSON.stringify(step.extract_vars) : null,
        step.skip_if_failed ? 1 : 0,
        step.swagger_example ? JSON.stringify(step.swagger_example) : null]
    );
  }

  const suite = await db.first(`SELECT * FROM flow_suites WHERE id = ?`, [suiteId]);
  const createdSteps = await db.all(
    `SELECT fs.*, e.path as endpoint_path FROM flow_steps fs LEFT JOIN endpoints e ON e.id = fs.endpoint_id WHERE fs.suite_id = ? ORDER BY fs.step_order`,
    [suiteId]
  );

  return json(success({ suite, steps: createdSteps }), 201);
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