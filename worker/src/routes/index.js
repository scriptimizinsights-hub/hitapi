/**
 * API Routes — all endpoints for the HitAPI worker
 */

import { DatabaseAdapter, ProjectRepo, EndpointRepo, TestCaseRepo, ExecutionRepo, BugRepo } from '../db/adapter.js';
import { fetchAndParseSpec, extractEndpoints, extractSpecInfo } from '../services/swagger.js';
import { generateTestCases, analyzeBug, detectWorkflows, generateRecommendations } from '../services/ai.js';
import { executeAll } from '../services/executor.js';
import { storeReport, getReport } from '../services/reports.js';
import { json, error, parseBody, success } from '../middleware/cors.js';
import { encryptField, decryptField } from '../services/encryption.js';
import { logInternalError } from '../services/errorLogger.js';
import { runAI, extractText, parseJSON, runAILogged } from '../services/ai.js';
const { buildFlowStepPrompt } = require('../utils/promptBuilder.js'); // or inline the function

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

export async function listProjects(request, env, { user }) {
  const db = new DatabaseAdapter(env.DB);
  const data = await db.all(
    `SELECT p.*, (SELECT COUNT(*) FROM endpoints e WHERE e.project_id = p.id) as endpoint_count
     FROM projects p WHERE p.user_id = ? ORDER BY p.created_at DESC`,
    [user.sub]
  );
  return json(success(data));
}

export async function createProject(request, env, { user }) {
  const body = await parseBody(request);
  if (!body?.name || !body?.base_url) return error('name and base_url are required');
  const db = new DatabaseAdapter(env.DB);
  const id = db.uuid();
  await db.run(
    `INSERT INTO projects (id, user_id, name, description, swagger_url, base_url, environment, auth_type, auth_config)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, user.sub, body.name, body.description || null, body.swagger_url || null,
      body.base_url, body.environment || 'development', body.auth_type || 'none',
      body.auth_config ? JSON.stringify(body.auth_config) : null]
  );
  const project = await db.first('SELECT * FROM projects WHERE id = ?', [id]);
  return json(success(project), 201);
}

export async function getProject(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);
  const project = await db.first('SELECT * FROM projects WHERE id = ? AND user_id = ?', [params.id, user.sub]);
  if (!project) return error('Project not found', 404);
  return json(success(project));
}

export async function updateProject(request, env, { params, user }) {
  const body = await parseBody(request);
  const db = new DatabaseAdapter(env.DB);
  // Verify ownership before allowing update
  const existing = await db.first('SELECT id FROM projects WHERE id = ? AND user_id = ?', [params.id, user.sub]);
  if (!existing) return error('Project not found', 404);
  const { projects } = repos(env);
  const project = await projects.update(params.id, body);
  return json(success(project));
}

export async function deleteProject(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);
  const existing = await db.first('SELECT id FROM projects WHERE id = ? AND user_id = ?', [params.id, user.sub]);
  if (!existing) return error('Project not found', 404);
  await db.run('DELETE FROM projects WHERE id = ?', [params.id]);
  return json(success({ deleted: true }));
}

// ── Ownership guard: verify the authenticated user owns this project ──────────
// Use this at the top of every handler that operates on params.id (project id)
export async function assertProjectOwner(env, projectId, userId) {
  const db = new DatabaseAdapter(env.DB);
  const project = await db.first('SELECT id FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
  return !!project;
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


  let fullSpec = {};
  if (project.spec_url) {
    const res = await fetch(project.spec_url);
    fullSpec = await res.json();
  }

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



      const cases = await generateTestCases(env.AI, ep, fullSpec, r.db, params.id);
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

      await logInternalError(env.DB, {
        source: 'ai',
        severity: 'error',
        message: `AI call failed: ${err.message}`,
        stack: err.stack,
        projectId,
        context: { model: MODEL, prompt: prompt.slice(0, 500) },
      });
      errors.push({ endpoint: `${endpoint.method} ${endpoint.path}`, error: err.message });
      throw err;
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

  if (env.TEST_QUEUE || env.QUEUE) {
    await (env.TEST_QUEUE || env.QUEUE).send({ executionId, projectId: params.id });
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
        const bug = await analyzeBug(env.AI, { endpoint: ep, testCase: tc, result }, r.db, projectId);
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
        const analysis = await analyzeBug(env.AI, { endpoint, testCase, result: body }, r.db, params.id);
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
  const workflows = await detectWorkflows(env.AI, endpoints, epRepo.db, params.id);
  return json(success(workflows));
}

// ─── Reports ────────────────────────────────────────────────────────────────

export async function listReports(request, env, { params }) {
  const db = new DatabaseAdapter(env.DB);
  // Join with flow_runs and flow_suites to get rich report data
  const reports = await db.all(
    `SELECT r.*,
            fr.status       as run_status,
            fr.passed       as run_passed,
            fr.failed       as run_failed,
            fr.total_steps  as run_total,
            fr.started_at   as run_started,
            fr.finished_at  as run_finished,
            fr.bug_count    as run_bugs,
            fs.name         as suite_name
     FROM reports r
     LEFT JOIN flow_runs fr ON fr.id = COALESCE(r.flow_run_id, r.execution_id)
     LEFT JOIN flow_suites fs ON fs.id = fr.suite_id
     WHERE r.project_id = ?
     ORDER BY r.created_at DESC LIMIT 20`,
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
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  const queue = env.QUEUE || env.TEST_QUEUE;

  for (const message of batch.messages) {
    const msg = message.body;
    try {

      // ── Initial suite run — split into chunk jobs ──────────────────────────
      if (msg.type === 'flow_suite_run') {
        const { runId, suiteId, projectId, skipStepIds = [] } = msg;

        const suite = await db.first(`SELECT * FROM flow_suites WHERE id = ?`, [suiteId]);
        const rawAllSteps = await db.all(
          `SELECT fs.*, e.path as endpoint_path, e.method as endpoint_method, e.request_body as endpoint_request_body
           FROM flow_steps fs LEFT JOIN endpoints e ON e.id = fs.endpoint_id
           WHERE fs.suite_id = ? ORDER BY fs.step_order`, [suiteId]
        );
        const allSteps = await decryptSteps(env, rawAllSteps);
        const project = await db.first(`SELECT * FROM projects WHERE id = ?`, [projectId]);

        if (!suite || !project || !allSteps.length) { message.ack(); continue; }

        await db.run(`UPDATE flow_runs SET status = 'running' WHERE id = ?`, [runId]);

        // Push first chunk job — subsequent chunks push themselves
        await queue.send({
          type: 'flow_suite_chunk',
          runId, suiteId, projectId, skipStepIds,
          chunkIndex: 0,
          context: {},
          accPassed: 0,
          accFailed: 0,
        });

        message.ack();
        continue;
      }

      // ── Chunk execution — each chunk runs CHUNK_SIZE steps ────────────────
      if (msg.type === 'flow_suite_chunk') {
        const {
          runId, suiteId, projectId, skipStepIds = [],
          chunkIndex, context: prevContext,
          accPassed, accFailed
        } = msg;

        const suite = await db.first(`SELECT * FROM flow_suites WHERE id = ?`, [suiteId]);
        const rawAllSteps = await db.all(
          `SELECT fs.*, e.path as endpoint_path, e.method as endpoint_method, e.request_body as endpoint_request_body
           FROM flow_steps fs LEFT JOIN endpoints e ON e.id = fs.endpoint_id
           WHERE fs.suite_id = ? ORDER BY fs.step_order`, [suiteId]
        );
        const allSteps = await decryptSteps(env, rawAllSteps);
        const project = await db.first(`SELECT * FROM projects WHERE id = ?`, [projectId]);

        if (!suite || !project) { message.ack(); continue; }

        const { runFlowSuite } = await import('../services/flow.js');


        // Apply skip flags
        const steps = allSteps.map(s => ({
          ...s,
          _force_skip: skipStepIds.includes(s.id)
        }));

        // Get this chunk's slice
        const chunkStart = chunkIndex * CHUNK_SIZE;
        const chunk = steps.slice(chunkStart, chunkStart + CHUNK_SIZE);

        if (!chunk.length) {
          // No more steps — finalize
          await finalizeRun(db, env, suite, allSteps, runId, accPassed, accFailed, prevContext);
          message.ack();
          continue;
        }

        console.log(`[Queue] Chunk ${chunkIndex + 1}: steps ${chunkStart + 1}-${chunkStart + chunk.length} of ${steps.length}`);

        // Run this chunk — gets fresh subrequest budget
        const { results, context: newContext, summary } = await runFlowSuite(
          suite, chunk, project, prevContext
        );

        // Save chunk results to DB immediately
        for (const r of results) {
          const rid = db.uuid();
          await db.run(
            `INSERT OR IGNORE INTO flow_step_results
             (id, run_id, step_id, step_order, step_name, status, actual_status,
              request_url, request_method, request_headers, request_body,
              actual_body, actual_headers, response_time_ms, failure_reason, extracted_vars)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [rid, runId, r.step_id, r.step_order, r.step_name, r.status,
              r.actual_status ?? null, r.request_url ?? null, r.request_method ?? null,
              r.request_headers ? JSON.stringify(r.request_headers) : null,
              r.request_body ? JSON.stringify(r.request_body) : null,
              r.actual_body ? JSON.stringify(r.actual_body) : null,
              r.actual_headers ? JSON.stringify(r.actual_headers) : null,
              r.response_time_ms ?? null, r.failure_reason ?? null,
              r.extracted_vars ? JSON.stringify(r.extracted_vars) : null]
          );
        }

        const totalPassed = accPassed + summary.passed;
        const totalFailed = accFailed + summary.failed;

        // Merge context — pass token and all extracted vars to next chunk
        const mergedContext = { ...prevContext, ...newContext };

        // Update progress
        await db.run(
          `UPDATE flow_runs SET passed = ?, failed = ?, context = ? WHERE id = ?`,
          [totalPassed, totalFailed, JSON.stringify(mergedContext), runId]
        );

        const hasMoreSteps = chunkStart + CHUNK_SIZE < steps.length;

        if (hasMoreSteps) {
          // Push next chunk as a new queue job — fresh subrequest budget
          await queue.send({
            type: 'flow_suite_chunk',
            runId, suiteId, projectId, skipStepIds,
            chunkIndex: chunkIndex + 1,
            context: mergedContext,
            accPassed: totalPassed,
            accFailed: totalFailed,
          });
          console.log(`[Queue] Pushed chunk ${chunkIndex + 2}`);
        } else {
          // All chunks done — finalize
          await finalizeRun(db, env, suite, allSteps, runId, totalPassed, totalFailed, mergedContext);
        }

        message.ack();
        continue;
      }

      // ── Sub-check job — runs 4 checks for ONE step, pushes next step ──────
      if (msg.type === 'flow_sub_checks') {
        const { runId, projectId, stepIndex } = msg;

        const results = await db.all(
          `SELECT * FROM flow_step_results WHERE run_id = ? ORDER BY step_order`, [runId]
        ).catch(() => []);

        const activeResults = results.filter(r => r.status !== 'skipped' && r.request_url);

        if (stepIndex >= activeResults.length) {
          console.log(`[SubChecks] All steps done for run ${runId}`);
          message.ack();
          continue;
        }

        const result = activeResults[stepIndex];
        const suite = await db.first(`SELECT * FROM flow_suites WHERE id = (SELECT suite_id FROM flow_runs WHERE id = ?)`, [runId]);
        const project = await db.first(`SELECT * FROM projects WHERE id = ?`, [projectId]);
        const allSteps = suite ? await db.all(
          `SELECT fs.*, e.path as endpoint_path, e.method as endpoint_method
           FROM flow_steps fs LEFT JOIN endpoints e ON e.id = fs.endpoint_id
           WHERE fs.suite_id = ? ORDER BY fs.step_order`, [suite.id]
        ).catch(() => []) : [];

        // Build context from all results (token etc.)
        const context = {};
        for (const r of results) {
          if (r.extracted_vars) {
            try { Object.assign(context, JSON.parse(r.extracted_vars)); } catch { }
          }
        }

        const step = allSteps.find(s => s.id === result.step_id) || {};

        try {
          const { runSubChecks } = await import('../services/flow.js');
          const subChecks = await runSubChecks(step, result, context, project);

          if (subChecks.length > 0) {
            await db.run(
              `UPDATE flow_step_results SET sub_checks = ? WHERE run_id = ? AND step_order = ?`,
              [JSON.stringify(subChecks), runId, result.step_order]
            );
            const passed = subChecks.filter(c => c.status === 'passed').length;
            console.log(`[SubChecks] Step ${result.step_order}: ${passed}/${subChecks.length} passed`);
          }
        } catch (err) {
          console.error(`[SubChecks] Step ${result.step_order} error:`, err.message);
        }

        // Push next step as new queue job — fresh subrequest budget
        if (stepIndex + 1 < activeResults.length) {
          await queue.send({
            type: 'flow_sub_checks',
            runId,
            projectId,
            stepIndex: stepIndex + 1,
          });
        } else {
          console.log(`[SubChecks] All ${activeResults.length} steps completed for run ${runId}`);
        }

        message.ack();
        continue;
      }
      if (msg.executionId) {
        await runExecutionInline(msg.executionId, msg.projectId, env, null);
        message.ack();
        continue;
      }

      console.warn('[Queue] Unknown message type:', msg.type);
      message.ack();
    } catch (err) {
      console.error('[Queue] Job failed:', err.message);
      message.retry();
    }
  }
}

// ── Finalize run after all chunks complete ────────────────────────────────────
async function finalizeRun(db, env, suite, allSteps, runId, passed, failed, context) {
  const total = allSteps.length;
  await db.run(
    `UPDATE flow_runs SET status = ?, passed = ?, failed = ?, context = ?, finished_at = unixepoch() WHERE id = ?`,
    [failed === 0 ? 'done' : 'failed', passed, failed, JSON.stringify(context), runId]
  );

  console.log(`[Queue] Run ${runId} complete: ${passed}/${total} passed`);

  // Report record — written FIRST so it always exists even if bug analysis
  // below runs long and the worker gets cut off by Cloudflare's time limit.
  const reportId = db.uuid();
  await db.run(
    `INSERT OR IGNORE INTO reports (id, flow_run_id, project_id, format, r2_key, size_bytes)
     VALUES (?, ?, ?, 'json', ?, ?)`,
    [reportId, runId, suite.project_id, `flow-runs/${runId}.json`,
      JSON.stringify({ run_id: runId, passed, failed }).length]
  ).catch(err => console.error('[Report] Failed to create report record:', err.message));

  // Load all results for post-processing
  const results = await db.all(
    `SELECT * FROM flow_step_results WHERE run_id = ? ORDER BY step_order`, [runId]
  ).catch(() => []);

  // AI bug analysis for failed steps — AWAITED so it completes before worker exits.
  // Runs AFTER the report is saved so a slow/long analysis can't starve report creation.
  if (failed > 0 && env?.AI) {
    await analyzeFlowRunBugs(db, env, suite, allSteps, results, runId).catch(err =>
      console.error('[BugAnalysis] Failed:', err.message)
    );
  }

  // Sub-checks — push as separate queue job to get fresh subrequest budget
  // Each step needs 4 sub-checks, so we process one step per queue job
  const queue = env.QUEUE || env.TEST_QUEUE;
  if (queue) {
    await queue.send({
      type: 'flow_sub_checks',
      runId,
      projectId: suite.project_id,
      stepIndex: 0,  // start from first step
    });
  } else {
    // Fallback: run inline (may hit limits)
    const project = await db.first(`SELECT * FROM projects WHERE id = ?`, [suite.project_id]).catch(() => null);
    runAllSubChecks(db, env, suite, allSteps, results, runId, project)
      .catch(err => console.error('[SubChecks] Failed:', err.message));
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

  // Enforce max 100 steps per suite (queue handles chunking)
  const MAX_STEPS = 100;
  if (body.steps?.length > MAX_STEPS) {
    return error(`Suite cannot have more than ${MAX_STEPS} steps. You have ${body.steps.length} — remove ${body.steps.length - MAX_STEPS} step(s) and try again.`, 400);
  }

  // Deduplicate steps by endpoint_id + method (keep first occurrence)
  const seen = new Set();
  const dedupedSteps = (body.steps || []).filter(s => {
    const key = `${s.endpoint_id}-${s.method}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((s, i) => ({ ...s, step_order: i + 1 })); // re-number after dedup

  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  const id = db.uuid();
  await db.run(
    `INSERT INTO flow_suites (id, project_id, name, description, auth_type, static_token) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, params.id, body.name, body.description || '', body.auth_type || null, body.static_token || null]
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
          step.input_payload ? await encryptField(env, JSON.stringify(step.input_payload)) : null,
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

// ── Decrypt flow step payloads after reading from DB ──────────────────────────
async function decryptSteps(env, steps) {
  return Promise.all(steps.map(async step => {
    if (!step.input_payload) return step;
    try {
      const plain = await decryptField(env, step.input_payload);
      return { ...step, input_payload: plain };
    } catch {
      return step; // return as-is if decryption fails (legacy unencrypted row)
    }
  }));
}

export async function getFlowSuite(request, env, { params }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  const suite = await db.first(`SELECT * FROM flow_suites WHERE id = ? AND project_id = ?`, [params.flowId, params.id]);
  if (!suite) return error('Suite not found', 404);
  const rawSteps = await db.all(
    `SELECT fs.*, e.path as endpoint_path, e.method as endpoint_method, e.summary
     FROM flow_steps fs LEFT JOIN endpoints e ON e.id = fs.endpoint_id
     WHERE fs.suite_id = ? ORDER BY fs.step_order`,
    [params.flowId]
  );
  const steps = await decryptSteps(env, rawSteps);
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
          step.input_payload ? await encryptField(env, JSON.stringify(step.input_payload)) : null,
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

export async function deleteFlowRun(request, env, { params }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  // Verify run belongs to this project via suite
  const run = await db.first(
    `SELECT fr.id FROM flow_runs fr
     JOIN flow_suites fs ON fs.id = fr.suite_id
     WHERE fr.id = ? AND fs.project_id = ?`,
    [params.runId, params.id]
  );
  if (!run) return error('Run not found', 404);
  await db.run(`DELETE FROM flow_step_results WHERE run_id = ?`, [params.runId]);
  await db.run(`DELETE FROM bugs WHERE flow_run_id = ?`, [params.runId]);
  await db.run(`DELETE FROM reports WHERE flow_run_id = ?`, [params.runId]);
  await db.run(`DELETE FROM flow_runs WHERE id = ?`, [params.runId]);
  console.log(`[Delete] Run ${params.runId} deleted from project ${params.id}`);
  return json(success({ deleted: true }));
}

export async function deleteAllFlowRuns(request, env, { params }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  // Verify suite belongs to project
  const suite = await db.first(`SELECT id FROM flow_suites WHERE id = ? AND project_id = ?`, [params.flowId, params.id]);
  if (!suite) return error('Suite not found', 404);
  const runs = await db.all(`SELECT id FROM flow_runs WHERE suite_id = ?`, [params.flowId]);
  for (const run of runs) {
    await db.run(`DELETE FROM flow_step_results WHERE run_id = ?`, [run.id]);
    await db.run(`DELETE FROM bugs WHERE flow_run_id = ?`, [run.id]);
    await db.run(`DELETE FROM reports WHERE flow_run_id = ?`, [run.id]);
  }
  await db.run(`DELETE FROM flow_runs WHERE suite_id = ?`, [params.flowId]);
  return json(success({ deleted: runs.length }));
}

export async function runFlowSuiteRoute(request, env, { params, ctx }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);

  const body = await parseBody(request).catch(() => ({}));
  const skipStepIds = body?.skip_step_ids || [];

  const suite = await db.first(`SELECT * FROM flow_suites WHERE id = ? AND project_id = ?`, [params.flowId, params.id]);
  if (!suite) return error('Suite not found', 404);

  const allSteps = await db.all(
    `SELECT fs.*, e.path as endpoint_path, e.method as endpoint_method, e.request_body as endpoint_request_body
     FROM flow_steps fs LEFT JOIN endpoints e ON e.id = fs.endpoint_id
     WHERE fs.suite_id = ? ORDER BY fs.step_order`,
    [params.flowId]
  );
  if (!allSteps.length) return error('Suite has no steps');

  const project = await db.first(`SELECT * FROM projects WHERE id = ?`, [params.id]);
  if (!project) return error('Project not found', 404);

  // Create run record with queued status
  const runId = db.uuid();
  await db.run(
    `INSERT INTO flow_runs (id, suite_id, project_id, status, total_steps) VALUES (?, ?, ?, 'queued', ?)`,
    [runId, params.flowId, params.id, allSteps.length]
  );

  // Option 1: Use Cloudflare Queue if available (binding may be TEST_QUEUE or QUEUE)
  const queueBinding = env.TEST_QUEUE || env.QUEUE;
  if (queueBinding) {
    await queueBinding.send({
      type: 'flow_suite_run',
      runId,
      suiteId: params.flowId,
      projectId: params.id,
      skipStepIds,
    });
    console.log(`[Flow] Queued run ${runId}`);
    return json(success({ run_id: runId, status: 'queued', total_steps: allSteps.length }));
  }

  // Option 2: Use ctx.waitUntil — runs after response, no subrequest limit on response
  if (ctx?.waitUntil) {
    console.log(`[Flow] Using waitUntil for run ${runId}`);
    ctx.waitUntil(
      runFlowSuiteInline(db, env, suite, allSteps, project, runId, skipStepIds)
        .catch(err => console.error('[Flow] waitUntil run failed:', err.message))
    );
    return json(success({ run_id: runId, status: 'queued', total_steps: allSteps.length }));
  }

  // Option 3: Fallback inline (dev only)
  console.log(`[Flow] Running inline (no queue, no ctx) for run ${runId}`);
  return runFlowSuiteInline(db, env, suite, allSteps, project, runId, skipStepIds);
}


// ── Chunked runner — splits 80+ steps into batches of 40 ─────────────────────
const CHUNK_SIZE = 45; // safe: 1 subrequest per step, no inline sub-checks

export async function runFlowSuiteInline(db, env, suite, allSteps, project, runId, skipStepIds = []) {
  const { runFlowSuite } = await import('../services/flow.js');

  const steps = allSteps.map(s => ({
    ...s,
    _force_skip: skipStepIds.includes(s.id)
  }));

  await db.run(`UPDATE flow_runs SET status = 'running' WHERE id = ?`, [runId]);

  try {
    let results = [], context = {}, passed = 0, failed = 0;
    const activeCount = steps.filter(s => !s._force_skip).length;

    if (activeCount <= CHUNK_SIZE) {
      // Small suite — single run
      const run = await runFlowSuite(suite, steps, project, {});
      results = run.results;
      context = run.context;
      passed = run.summary.passed;
      failed = run.summary.failed;
    } else {
      // Large suite — run in chunks, each chunk gets fresh subrequest budget
      // by saving partial results to DB and continuing in next iteration
      console.log(`[Flow] Chunking ${steps.length} steps into batches of ${CHUNK_SIZE}`);
      for (let i = 0; i < steps.length; i += CHUNK_SIZE) {
        const chunk = steps.slice(i, i + CHUNK_SIZE);
        console.log(`[Flow] Running chunk ${Math.floor(i / CHUNK_SIZE) + 1}: steps ${i + 1}-${Math.min(i + CHUNK_SIZE, steps.length)}, context keys: ${Object.keys(context).join(',')}`);
        const run = await runFlowSuite(suite, chunk, project, context);
        results.push(...run.results);
        // Pass extracted vars (token, IDs) to next chunk
        Object.assign(context, run.context);
        passed += run.summary.passed;
        failed += run.summary.failed;

        // Save partial results to DB so polling shows progress
        for (const r of run.results) {
          const rid = db.uuid();
          await db.run(
            `INSERT OR IGNORE INTO flow_step_results (id, run_id, step_id, step_order, step_name, status, actual_status, request_url, request_method, request_headers, request_body, actual_body, actual_headers, response_time_ms, failure_reason, extracted_vars, sub_checks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [rid, runId, r.step_id, r.step_order, r.step_name, r.status, r.actual_status ?? null,
              r.request_url ?? null, r.request_method ?? null,
              r.request_headers ? JSON.stringify(r.request_headers) : null,
              r.request_body ? JSON.stringify(r.request_body) : null,
              r.actual_body ? JSON.stringify(r.actual_body) : null,
              r.actual_headers ? JSON.stringify(r.actual_headers) : null,
              r.response_time_ms ?? null, r.failure_reason ?? null,
              r.extracted_vars ? JSON.stringify(r.extracted_vars) : null,
              r.sub_checks ? JSON.stringify(r.sub_checks) : null]
          );
        }
        // Update progress after each chunk
        await db.run(
          `UPDATE flow_runs SET passed = ?, failed = ?, context = ? WHERE id = ?`,
          [passed, failed, JSON.stringify(context), runId]
        );
      }
    }

    const summary = {
      total: steps.length,
      passed,
      failed,
      pass_rate: steps.length ? Math.round((passed / steps.length) * 100) : 0
    };

    // Save step results (only for non-chunked — chunked saves per chunk above)
    if (activeCount <= CHUNK_SIZE) {
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
    }

    await db.run(
      `UPDATE flow_runs SET status = ?, passed = ?, failed = ?, context = ?, finished_at = unixepoch() WHERE id = ?`,
      [summary.failed === 0 ? 'done' : 'failed', summary.passed, summary.failed, JSON.stringify(context), runId]
    );

    if (summary.failed > 0 && env?.AI) {
      await analyzeFlowRunBugs(db, env, suite, allSteps, results, runId).catch(err =>
        console.error('[BugAnalysis] Failed:', err.message)
      );
    }

    // Run sub-checks AFTER all steps complete — one step at a time
    // This avoids multiplying subrequests during the main run
    runAllSubChecks(db, env, suite, allSteps, results, runId, project).catch(err =>
      console.error('[SubChecks] Failed:', err.message)
    );

    const reportId = db.uuid();
    await db.run(
      `INSERT OR IGNORE INTO reports (id, flow_run_id, project_id, format, r2_key, size_bytes)
       VALUES (?, ?, ?, 'json', ?, ?)`,
      [reportId, runId, suite.project_id, `flow-runs/${runId}.json`,
        JSON.stringify({ run_id: runId, summary }).length]
    ).catch(() => { });

    return json(success({ run_id: runId, summary, results, context }));
  } catch (err) {
    await db.run(`UPDATE flow_runs SET status = 'failed', finished_at = unixepoch() WHERE id = ?`, [runId]);
    throw err;
  }
}


/**
 * analyzeFlowRunBugs
 * Processes failed steps one by one after suite run.
 * Calls AI sequentially — one step at a time.
 */

/**
 * runAllSubChecks
 * Runs security/validation sub-checks for each step AFTER the main suite completes.
 * Processes ONE step at a time to stay under subrequest limits.
 * Each step gets its own mini-invocation via queue if available.
 */
async function runAllSubChecks(db, env, suite, allSteps, results, runId, project) {
  const { runSubChecks } = await import('../services/flow.js');

  console.log(`[SubChecks] Starting sub-checks for ${results.length} steps`);

  const context = {};
  for (const r of results) {
    if (r.extracted_vars) {
      const vars = typeof r.extracted_vars === 'string'
        ? JSON.parse(r.extracted_vars) : r.extracted_vars;
      Object.assign(context, vars);
    }
  }

  for (const result of results) {
    if (result.status === 'skipped') continue;
    const step = allSteps.find(s => s.id === result.step_id) || {};

    try {
      const subChecks = await runSubChecks(step, result, context, project);
      if (subChecks.length === 0) continue;

      await db.run(
        `UPDATE flow_step_results SET sub_checks = ? WHERE run_id = ? AND step_order = ?`,
        [JSON.stringify(subChecks), runId, result.step_order]
      );

      const passed = subChecks.filter(c => c.status === 'passed').length;
      console.log(`[SubChecks] Step ${result.step_order}: ${passed}/${subChecks.length} passed`);

      // Save bugs for failed sub-checks
      for (const check of subChecks.filter(c => c.status === 'failed')) {
        const bugId = db.uuid();
        const severity = check.check_type === 'auth' ? 'high'
          : check.check_type === 'security' ? 'high' : 'medium';
        const title = `${step.method || ''} ${step.endpoint_path || result.request_url || ''} — ${check.label}`;
        await db.run(
          `INSERT OR IGNORE INTO bugs (id, project_id, flow_run_id, flow_step_id, endpoint_id, severity, title, description, root_cause, suggested_fix, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
          [
            bugId,
            suite.project_id,
            runId,
            result.step_id || null,
            step.endpoint_id || null,
            severity,
            title.slice(0, 200),
            `Security check failed: ${check.label}. Expected ${check.expected_status}, got ${check.actual_status}.`,
            check.check_type === 'auth' ? 'Endpoint does not require authentication — returns non-401/403 without token'
              : check.check_type === 'security' ? 'Endpoint does not reject SQL injection payload'
                : check.check_type === 'validation' ? 'Endpoint accepts empty body without validation error'
                  : 'Wrong HTTP method not properly rejected',
            check.check_type === 'auth' ? 'Add authentication middleware to this endpoint'
              : check.check_type === 'security' ? 'Add input validation/sanitization for SQL injection'
                : check.check_type === 'validation' ? 'Add required field validation returning 400/422'
                  : 'Ensure unsupported methods return 404 or 405',
          ]
        ).catch(() => { });
      }

      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`[SubChecks] Step ${result.step_order} failed:`, err.message);
    }
  }

  console.log(`[SubChecks] Done`);
}

async function analyzeFlowRunBugs(db, env, suite, allSteps, results, runId) {

  const { analyzeFlowStepBug } = await import('../services/ai.js');

  const failedResults = results.filter(r => r.status === 'failed' || r.status === 'error');
  console.log(`[BugAnalysis] Analyzing ${failedResults.length} failed steps for run ${runId}`);

  await db.run(`DELETE FROM bugs WHERE flow_run_id = ?`, [runId]).catch(() => { });

  let analyzed = 0;
  for (const result of failedResults) {
    try {
      const step = allSteps.find(s => s.id === result.step_id) || {};
      const endpoint = step.endpoint_id
        ? await db.first(`SELECT * FROM endpoints WHERE id = ?`, [step.endpoint_id]).catch(() => null)
        : null;

      const stepIndex = results.findIndex(r => r.step_id === result.step_id);
      const prevResult = stepIndex > 0 ? results[stepIndex - 1] : null;
      const suiteContext = {
        token: null,
        previousPassed: prevResult?.status === 'passed',
      };

      console.log(`[BugAnalysis] Step ${result.step_order}: ${step.method} ${step.endpoint_path}`);

      const bug = await analyzeFlowStepBug(env.AI, { step, result, endpoint, suiteContext }, db, suite.project_id);
      if (!bug) continue;

      const bugId = db.uuid();
      await db.run(
        `INSERT INTO bugs (id, project_id, endpoint_id, severity, title, description, root_cause, suggested_fix, flow_run_id, flow_step_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
        [
          bugId,
          suite.project_id,
          endpoint?.id || step.endpoint_id || null,
          bug.severity || 'medium',
          (bug.title || `${step.method} ${step.endpoint_path} failed`).slice(0, 200),
          bug.description || '',
          bug.root_cause || '',
          bug.suggested_fix || '',
          runId,
          result.step_id || null,
        ]
      ).then(() => {
        console.log(`[BugAnalysis] ✓ Saved bug ${bugId}: ${bug.title}`);
      }).catch(err => {
        console.error(`[BugAnalysis] ✗ Failed to save bug:`, err.message);
      });

      analyzed++;
      console.log(`[BugAnalysis] Saved bug ${bugId} — ${bug.severity}: ${bug.title}`);
      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      await logInternalError(db, {
        source: 'ai',
        severity: 'error',
        message: `AI call failed: ${err.message}`,
        stack: err.stack,
        projectId,
        context: { model: MODEL, prompt: prompt.slice(0, 500) },
      });

      console.error(`[BugAnalysis] Step ${result.step_order} failed:`, err.message);
      throw err;
    }
  }
  console.log(`[BugAnalysis] Done — ${analyzed}/${failedResults.length} bugs saved`);
}

export async function listFlowRuns(request, env, { params }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  const runs = await db.all(
    `SELECT * FROM flow_runs WHERE suite_id = ? ORDER BY started_at DESC LIMIT 20`,
    [params.flowId]
  );
  return json(success(runs));
}

// ── Add a single step to an existing flow suite (used by browser extension) ──
// ── Quick-create from a browser-extension captured request ───────────────────
// Always creates a real endpoint record (visible in Endpoints tab), then either
// adds it as a step to an existing suite or creates a brand-new suite for it.
export async function quickCreateFromCapture(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);
  const project = await db.first('SELECT id FROM projects WHERE id = ? AND user_id = ?', [params.id, user.sub]);
  if (!project) return error('Project not found', 404);

  const body = await parseBody(request);
  const { method, url, headers, requestBody, suiteId, newSuiteName, stepName } = body;

  if (!method || !url) return error('method and url are required', 400);
  if (!suiteId && !newSuiteName) return error('Either suiteId or newSuiteName is required', 400);

  let path;
  try { path = new URL(url).pathname; } catch { path = url; }

  // 1. Create the endpoint record — visible in Endpoints tab, tagged as extension-sourced
  const endpointId = db.uuid();
  await db.run(
    `INSERT INTO endpoints (id, project_id, path, method, summary, request_body, tags, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    [
      endpointId, params.id, path, method.toUpperCase(),
      `Captured via browser extension`,
      requestBody ? JSON.stringify(typeof requestBody === 'string' ? safeParse(requestBody) : requestBody) : null,
      JSON.stringify(['extension-captured']),
    ]
  );

  // 2. Resolve target suite — either existing or newly created
  let targetSuiteId = suiteId;
  let suiteCreated = false;
  if (!targetSuiteId) {
    targetSuiteId = db.uuid();
    await db.run(
      `INSERT INTO flow_suites (id, project_id, name, description) VALUES (?, ?, ?, ?)`,
      [targetSuiteId, params.id, newSuiteName, 'Created from browser extension capture']
    );
    suiteCreated = true;
  } else {
    const suite = await db.first(`SELECT id FROM flow_suites WHERE id = ? AND project_id = ?`, [targetSuiteId, params.id]);
    if (!suite) return error('Flow suite not found', 404);
  }

  // 3. Add step referencing the new endpoint
  const maxOrder = await db.first(`SELECT MAX(step_order) as m FROM flow_steps WHERE suite_id = ?`, [targetSuiteId]);
  const nextOrder = (maxOrder?.m ?? -1) + 1;
  const stepId = db.uuid();
  await db.run(
    `INSERT INTO flow_steps (id, suite_id, step_order, name, endpoint_id, method, url_override, input_payload, input_headers, expected_status, skip_if_failed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      stepId, targetSuiteId, nextOrder,
      stepName || `${method.toUpperCase()} ${path}`,
      endpointId, method.toUpperCase(), url,
      requestBody ? await encryptField(env, typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody)) : null,
      headers ? JSON.stringify(sanitizeExtHeaders(headers)) : null,
      null, 0,
    ]
  );

  console.log(`[Extension] Quick-created endpoint ${endpointId} + step in suite ${targetSuiteId} (new suite: ${suiteCreated})`);

  return json(success({
    endpoint_id: endpointId,
    suite_id: targetSuiteId,
    step_id: stepId,
    suite_created: suiteCreated,
  }), 201);
}

function safeParse(str) {
  try { return JSON.parse(str); } catch { return str; }
}

function sanitizeExtHeaders(headers) {
  const skip = ['cookie', 'host', 'content-length', 'connection', 'origin', 'referer'];
  const result = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (!skip.includes(k.toLowerCase())) result[k] = v;
  }
  return result;
}

export async function addFlowStep(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);
  const suite = await db.first(
    `SELECT fs.id FROM flow_suites fs JOIN projects p ON p.id = fs.project_id
     WHERE fs.id = ? AND p.id = ? AND p.user_id = ?`,
    [params.flowId, params.id, user.sub]
  );
  if (!suite) return error('Flow suite not found', 404);

  const body = await parseBody(request);
  if (!body.method || !body.name) return error('name and method are required', 400);

  const maxOrder = await db.first(`SELECT MAX(step_order) as m FROM flow_steps WHERE suite_id = ?`, [params.flowId]);
  const nextOrder = (maxOrder?.m ?? -1) + 1;

  const sid = db.uuid();
  await db.run(
    `INSERT INTO flow_steps (id, suite_id, step_order, name, method, url_override, input_payload, input_headers, input_params, expected_status, skip_if_failed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sid, params.flowId, nextOrder, body.name, body.method,
      body.url_override || null,
      body.input_payload ? await encryptField(env, JSON.stringify(body.input_payload)) : null,
      body.input_headers ? JSON.stringify(body.input_headers) : null,
      body.input_params ? JSON.stringify(body.input_params) : null,
      body.expected_status || null,
      0,
    ]
  );

  const step = await db.first('SELECT * FROM flow_steps WHERE id = ?', [sid]);
  console.log(`[Extension] Step added to suite ${params.flowId} via browser extension`);
  return json(success(step), 201);
}

// ── Manual bug report (used by browser extension "Report bug" action) ────────
export async function createManualBug(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);
  const project = await db.first('SELECT id FROM projects WHERE id = ? AND user_id = ?', [params.id, user.sub]);
  if (!project) return error('Project not found', 404);

  const body = await parseBody(request);
  if (!body.title) return error('title is required', 400);

  const bugId = db.uuid();
  await db.run(
    `INSERT INTO bugs (id, project_id, severity, title, description, status)
     VALUES (?, ?, ?, ?, ?, 'open')`,
    [bugId, params.id, body.severity || 'medium', body.title.slice(0, 200), body.description || '']
  );

  const bug = await db.first('SELECT * FROM bugs WHERE id = ?', [bugId]);
  console.log(`[Extension] Manual bug reported for project ${params.id} via browser extension`);
  return json(success(bug), 201);
}

// ── Delete a single flow step ─────────────────────────────────────────────────
export async function deleteFlowStep(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);
  // Verify step belongs to a suite owned by this user's project
  const step = await db.first(
    `SELECT fs.id, fs.suite_id, fs.step_order FROM flow_steps fs
     JOIN flow_suites fsu ON fsu.id = fs.suite_id
     WHERE fs.id = ? AND fsu.id = ? AND fsu.project_id = ?`,
    [params.stepId, params.flowId, params.id]
  );
  if (!step) return error('Step not found', 404);

  await db.run('DELETE FROM flow_steps WHERE id = ?', [params.stepId]);

  // Renumber remaining steps to keep order contiguous
  const remaining = await db.all(
    'SELECT id FROM flow_steps WHERE suite_id = ? ORDER BY step_order ASC',
    [params.flowId]
  );
  for (let i = 0; i < remaining.length; i++) {
    await db.run('UPDATE flow_steps SET step_order = ? WHERE id = ?', [i + 1, remaining[i].id]);
  }

  console.log(`[Suite] Step ${params.stepId} deleted from suite ${params.flowId}`);
  return json(success({ deleted: true }));
}

// ── Reorder flow steps ────────────────────────────────────────────────────────
// Body: { order: ["stepId1", "stepId2", ...] } — full ordered array of step IDs
export async function reorderFlowSteps(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);
  const suite = await db.first(
    'SELECT id FROM flow_suites WHERE id = ? AND project_id = ?',
    [params.flowId, params.id]
  );
  if (!suite) return error('Suite not found', 404);

  const body = await parseBody(request);
  const { order } = body; // array of step IDs in the new desired order
  if (!Array.isArray(order) || order.length === 0) return error('order array is required', 400);

  for (let i = 0; i < order.length; i++) {
    await db.run(
      'UPDATE flow_steps SET step_order = ? WHERE id = ? AND suite_id = ?',
      [i + 1, order[i], params.flowId]
    );
  }

  const steps = await db.all(
    'SELECT * FROM flow_steps WHERE suite_id = ? ORDER BY step_order ASC',
    [params.flowId]
  );
  console.log(`[Suite] Reordered ${steps.length} steps in suite ${params.flowId}`);
  return json(success({ steps }));
}

export async function updateFlowStep(request, env, { params }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  const body = await parseBody(request);

  const fields = [];
  const values = [];

  if (body.input_payload !== undefined) {
    fields.push('input_payload = ?');
    values.push(body.input_payload ? await encryptField(env, JSON.stringify(body.input_payload)) : null);
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

export async function autoGenerateFlowSuite(request, env, { params }) {
  const db = new (await import('../db/adapter.js')).DatabaseAdapter(env.DB);
  const body = await parseBody(request);
  const endpoints = await db.all(
    `SELECT * FROM endpoints WHERE project_id = ? ORDER BY path, method`,
    [params.id]
  );
  if (!endpoints.length) return error('No endpoints found. Import Swagger first.');

  const project = await db.first(`SELECT * FROM projects WHERE id = ?`, [params.id]);

  // Detect auth endpoints
  const signupEp = endpoints.find(e =>
    e.method === 'POST' && (
      e.path.toLowerCase().includes('signup') ||
      e.path.toLowerCase().includes('register') ||
      e.summary?.toLowerCase().includes('sign up')
    )
  );
  const loginEp = endpoints.find(e =>
    e.method === 'POST' && (
      e.path.toLowerCase().includes('login') ||
      e.path.toLowerCase().includes('signin') ||
      e.summary?.toLowerCase().includes('login') ||
      e.summary?.toLowerCase().includes('authenticate')
    )
  );

  const isAuthAPI = !!(signupEp || loginEp);
  const steps = [];
  let order = 1;

  if (isAuthAPI) {
    // ── Auth flow — existing logic works fine ──────────────────────────────
    if (signupEp) {
      steps.push({
        step_order: order++,
        name: 'Sign up',
        endpoint_id: signupEp.id,
        method: 'POST',
        input_payload: buildPayloadFromSchema(signupEp),
        input_params: null,
        expected_status: 201,
        extract_vars: [{ var: 'userId', path: 'data.id' }, { var: 'userId', path: 'id' }],
        skip_if_failed: 0,
      });
    }
    if (loginEp) {
      steps.push({
        step_order: order++,
        name: 'Login',
        endpoint_id: loginEp.id,
        method: 'POST',
        input_payload: buildPayloadFromSchema(loginEp),
        input_params: null,
        expected_status: 200,
        extract_vars: [
          { var: 'token', path: 'token' },
          { var: 'token', path: 'data.token' },
          { var: 'token', path: 'access_token' },
        ],
        skip_if_failed: 0,
      });
    }

    const skipIds = new Set([signupEp?.id, loginEp?.id].filter(Boolean));
    const secured = endpoints.filter(e => !skipIds.has(e.id)).slice(0, 28);

    for (const ep of secured) {
      const epSteps = await generateStepsForEndpoint(env, ep, project);
      for (const s of epSteps) {
        steps.push({
          step_order: order++,
          name: s.name,
          endpoint_id: ep.id,
          method: ep.method,
          input_payload: s.request_body,
          input_params: s.path_params,
          expected_status: s.expected_status,
          extract_vars: [],
          skip_if_failed: 1,
        });
      }
    }

  } else {
    // ── No-auth flow — AI decides everything ───────────────────────────────

    // GET endpoints first — no AI needed, just run them
    const getEndpoints = endpoints.filter(e => e.method === 'GET');
    for (const ep of getEndpoints) {
      steps.push({
        step_order: order++,
        name: ep.summary || `${ep.method} ${ep.path}`,
        endpoint_id: ep.id,
        method: 'GET',
        input_payload: null,
        input_params: buildPathParams(ep),
        expected_status: 200,
        extract_vars: [],
        skip_if_failed: 0,
      });
    }

    // Write endpoints — AI generates meaningful combinations
    const writeEndpoints = endpoints.filter(e =>
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(e.method)
    );

    for (const ep of writeEndpoints) {
      const aiSteps = await generateStepsForEndpoint(env, ep, project);
      for (const s of aiSteps) {
        steps.push({
          step_order: order++,
          name: s.name,
          endpoint_id: ep.id,
          method: ep.method,
          input_payload: s.request_body,
          input_params: { ...s.path_params, ...s.query_params },
          expected_status: s.expected_status || 200,
          extract_vars: [],
          skip_if_failed: 1,
        });
      }
    }
  }

  if (!steps.length) return error('Could not generate any steps.');

  // Persist
  const suiteId = db.uuid();
  await db.run(
    `INSERT INTO flow_suites (id, project_id, name, description, auth_type, static_token) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      suiteId, params.id,
      `${project?.name || 'API'} — ${isAuthAPI ? 'Auth Flow' : 'Functional Coverage'}`,
      `Auto-generated: ${steps.length} steps`,
      body.auth_type || null,
      body.static_token || null

    ]
  );

  for (const step of steps) {
    await db.run(
      `INSERT INTO flow_steps
         (id, suite_id, step_order, name, endpoint_id, method,
          input_payload, input_params, expected_status,
          extract_vars, skip_if_failed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        db.uuid(), suiteId, step.step_order, step.name,
        step.endpoint_id || null, step.method,
        step.input_payload ? JSON.stringify(step.input_payload) : null,
        step.input_params ? JSON.stringify(step.input_params) : null,
        step.expected_status ?? null,
        step.extract_vars?.length ? JSON.stringify(step.extract_vars) : null,
        step.skip_if_failed ? 1 : 0,
      ]
    );
  }

  const suite = await db.first(`SELECT * FROM flow_suites WHERE id = ?`, [suiteId]);
  const createdSteps = await db.all(
    `SELECT fs.*, e.path as endpoint_path
     FROM flow_steps fs
     LEFT JOIN endpoints e ON e.id = fs.endpoint_id
     WHERE fs.suite_id = ? ORDER BY fs.step_order`,
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
      queue: !!(env.QUEUE || env.TEST_QUEUE),
      queue_binding: env.QUEUE ? 'QUEUE' : env.TEST_QUEUE ? 'TEST_QUEUE' : 'none',
      r2: !!env.REPORTS,
      ai: !!env.AI
    }
  });
}

// ─── Helper: AI generates meaningful steps for one endpoint ──────────────────
async function generateStepsForEndpoint(env, ep, project) {
  const r = repos(env);
  const parameters = ep.parameters ? JSON.parse(ep.parameters) : [];
  const pathParams = parameters.filter(p => p.in === 'path');
  const schema = ep.request_body ? JSON.parse(ep.request_body) : null;

  const prompt = `You are an API test engineer designing a functional test flow.

ENDPOINT: ${ep.method} ${ep.path}
SUMMARY: ${ep.summary || ''}
DESCRIPTION: ${ep.description || ''}

PATH PARAMETERS:
${pathParams.length ? pathParams.map(p => `
  name: "${p.name}"
  description: "${p.description || ''}"
  ${p.schema?.enum ? `valid values: ${JSON.stringify(p.schema.enum)}` : `type: ${p.schema?.type || 'string'}`}
`).join('') : 'none'}

REQUEST BODY SCHEMA:
${schema ? JSON.stringify(schema, null, 2) : 'none'}

YOUR TASK:
Generate 4-6 meaningful test steps for a flow suite.
Each step should use DIFFERENT parameter combinations that make real-world sense.
The request body must contain realistic data that matches what the endpoint expects.

Infer what the API does from the path, summary, description and parameter names/values.
Examples of good thinking:
- Path has {{from}} and {{to}} with format enum → use different format pairs, input must match source format
- Path has {{from}} and {{to}} with currency codes → use real currency amounts as input
- Path has {{lang}} with language codes → use real text in that language as input
- Path has {{unit}} with measurement units → use numeric values as input

Return ONLY a raw JSON array, no markdown:
[
  {
    "name": "descriptive step name explaining what this tests",
    "path_params": { "paramName": "value" },
    "query_params": {},
    "request_body": { "field": "value" } or null,
    "expected_status": 200,
    "reasoning": "why this combination makes sense"
  }
]`;

  try {
    const aiResponse = await runAILogged(env.AI, r.db, prompt, 1000, 20000, {
      stage: 'flow_step_generation',
      projectId: project?.id || null
    });

    const text = extractText(aiResponse);
    if (!text) throw new Error('Empty AI response');

    const parsed = parseJSON(text);
    if (Array.isArray(parsed) && parsed.length) {
      console.log(`[Flow] AI generated ${parsed.length} steps for ${ep.method} ${ep.path}`);
      return parsed;
    }
    throw new Error('AI did not return a valid array');
  } catch (err) {
    console.warn(`[Flow] AI failed for ${ep.path}: ${err.message} — using fallback`);

    // Fallback — one step using first enum value of each path param
    const fallbackParams = {};
    for (const p of pathParams) {
      fallbackParams[p.name] = p.example
        || p.schema?.example
        || p.schema?.enum?.[0]
        || (p.name.toLowerCase().includes('id') ? '{{userId}}' : '1');
    }

    return [{
      name: `${ep.method} ${ep.path}`,
      path_params: fallbackParams,
      query_params: {},
      request_body: buildPayloadFromSchema(ep),
      expected_status: ep.method === 'POST' ? 201 : 200,
      reasoning: 'Fallback — AI unavailable',
    }];
  }
}

// ─── Helper: build payload from schema properties ────────────────────────────
function buildPayloadFromSchema(ep) {
  try {
    const schema = ep.request_body ? JSON.parse(ep.request_body) : null;
    if (!schema?.properties) return null;
    const payload = {};
    for (const [f, fSchema] of Object.entries(schema.properties)) {
      const n = f.toLowerCase();
      if (fSchema?.example !== undefined) payload[f] = fSchema.example;
      else if (fSchema?.enum) payload[f] = fSchema.enum[0];
      else if (n.includes('email')) payload[f] = 'test@example.com';
      else if (n.includes('password')) payload[f] = 'Test@123456';
      else if (n.includes('name')) payload[f] = 'Test User';
      else if (n.includes('id')) payload[f] = '{{userId}}';
      else if (fSchema?.type === 'boolean') payload[f] = fSchema.default ?? true;
      else if (fSchema?.type === 'integer') payload[f] = 1;
      else payload[f] = 'test_value';
    }
    return payload;
  } catch { return null; }
}

// ─── Helper: build path params using enum/example, never hardcoded "1" ───────
function buildPathParams(ep) {
  try {
    const parameters = ep.parameters ? JSON.parse(ep.parameters) : [];
    const pathParams = parameters.filter(p => p.in === 'path');
    if (!pathParams.length) return null;
    const result = {};
    for (const p of pathParams) {
      result[p.name] = p.example
        || p.schema?.example
        || p.schema?.enum?.[0]
        || (p.name.toLowerCase().includes('id') ? '{{userId}}' : '1');
    }
    return result;
  } catch { return null; }
}

export async function generateFlowStep(request, env, { params }) {
  const db = new DatabaseAdapter(env.DB);

  const endpoint = await db.first(
    `SELECT * FROM endpoints WHERE id = ? AND project_id = ?`,
    [params.endpointId, params.id]
  );
  if (!endpoint) return error('Endpoint not found', 404);

  const parameters = endpoint.parameters ? JSON.parse(endpoint.parameters) : [];
  const pathParams = parameters.filter(p => p.in === 'path');
  const queryParams = parameters.filter(p => p.in === 'query');
  const schema = endpoint.request_body ? JSON.parse(endpoint.request_body) : null;
  const knownStatusCodes = endpoint.responses
    ? Object.keys(JSON.parse(endpoint.responses)).map(Number).filter(n => !isNaN(n))
    : [];

  const prompt = buildFlowStepPrompt(endpoint, pathParams, queryParams, schema, knownStatusCodes);

  try {
    const { steps, droppedInvalid, droppedDuplicates } = await runAILogged(env.AI, db, prompt, 600, 40000, {
      stage: 'flow_step_generation',
      projectId: params.id
    });

    if (droppedInvalid || droppedDuplicates) {
      console.log(`[GenerateStep] Cleaned response: dropped ${droppedInvalid} invalid, ${droppedDuplicates} duplicate steps`);
    }

    // console.log(`[Flow] AI generated step for ${endpoint.method} ${endpoint.path}: ${JSON.stringify(response)} `);
    // const text = extractText(response);
    // const parsed = parseJSON(text);

    // if (!parsed) return error('AI could not generate step');

    // // Map to consistent field names
    // return json(success({
    //   name: parsed.name || `${endpoint.method} ${endpoint.path}`,
    //   input_params: parsed.path_params || parsed.input_params || null,
    //   input_payload: parsed.request_body || parsed.input_payload || null,
    //   expected_status: parsed.expected_status || (endpoint.method === 'POST' ? 201 : 200),
    //   extract_vars: parsed.extract_vars || [],
    //   reasoning: parsed.reasoning || '',
    // }));

    // Return just the first (best) step — this route generates ONE step for the form
    const best = steps[0];
    return json(success({
      name: best.name,
      input_params: Object.keys(best.path_params).length ? best.path_params : null,
      input_payload: best.request_body || best.input_payload || null,
      expected_status: best.expected_status,
      extract_vars: [],
      reasoning: best.reasoning,
    }));
  } catch (err) {
    // Log WHY we're falling back — distinguishes "AI never responded" from
    // "AI responded but every step failed validation"
    const stage = err instanceof NormalizeError ? err.stage : 'ai_call';
    console.warn(`[GenerateStep] AI failed at stage=${stage}: ${err.message} — using rule-based fallback`);

    // ── Existing rule-based fallback — unchanged ──────────────────────────
    const fallbackParams = {};
    for (const p of pathParams) {
      fallbackParams[p.name] = p.schema?.enum?.[0] || p.example || '1';
    }
    const fallbackBody = {};
    if (schema?.properties) {
      for (const [k, v] of Object.entries(schema.properties)) {
        if (v.type === 'boolean') fallbackBody[k] = v.default ?? true;
        else if (v.type === 'integer') fallbackBody[k] = 1;
        else if (v.enum) fallbackBody[k] = v.enum[0];
        else if (k === 'input') fallbackBody[k] = '[{"id":1,"name":"test"}]';
        else fallbackBody[k] = 'test_value';
      }
    }

    return json(success({
      name: `${endpoint.method} ${endpoint.path}`,
      input_params: Object.keys(fallbackParams).length ? fallbackParams : null,
      input_payload: Object.keys(fallbackBody).length ? fallbackBody : null,
      expected_status: endpoint.method === 'POST' ? 201 : 200,
      extract_vars: [],
      reasoning: 'Rule-based fallback — AI unavailable',
    }));
  }
}


// ── Admin whitelist ───────────────────────────────────────────────────────────
async function requireAdmin(user, db) {
  if (!user) throw new Error('Admin access required');
  const admin = await db.first(
    'SELECT id FROM admins WHERE email = ?',
    [user.email]
  );
  if (!admin) throw new Error('Admin access required');
}

// ── GET /api/admin/errors — all errors (admin only) ───────────────────────────
export async function listAdminErrors(request, env, { user }) {
  const db = new DatabaseAdapter(env.DB);
  requireAdmin(user, db);

  const url = new URL(request.url);

  const scope = url.searchParams.get('scope');    // 'internal' | 'external' | null (all)
  const source = url.searchParams.get('source');   // filter by source
  const severity = url.searchParams.get('severity'); // filter by severity
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  let where = 'WHERE 1=1';
  const args = [];

  if (scope) { where += ' AND scope = ?'; args.push(scope); }
  if (source) { where += ' AND source = ?'; args.push(source); }
  if (severity) { where += ' AND severity = ?'; args.push(severity); }

  const [errors, countRow] = await Promise.all([
    db.all(
      `SELECT pe.*, p.name as project_name
       FROM platform_errors pe
       LEFT JOIN projects p ON p.id = pe.project_id
       ${where}
       ORDER BY pe.created_at DESC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    ),
    db.first(
      `SELECT COUNT(*) as total FROM platform_errors ${where}`,
      args
    ),
  ]);

  // Parse context JSON
  const parsed = errors.map(e => ({
    ...e,
    context: e.context ? JSON.parse(e.context) : null,
  }));

  return json(success({
    errors: parsed,
    total: countRow?.total || 0,
    limit,
    offset,
  }));
}

// ── GET /api/projects/:id/errors — project errors only ───────────────────────
export async function listProjectErrors(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);
  const url = new URL(request.url);

  // Verify project ownership
  const project = await db.first(
    'SELECT id FROM projects WHERE id = ? AND user_id = ?',
    [params.id, user.sub]
  );
  if (!project) return error('Project not found', 404);

  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const [errors, countRow] = await Promise.all([
    db.all(
      `SELECT * FROM platform_errors
       WHERE project_id = ? AND scope = 'external'
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [params.id, limit, offset]
    ),
    db.first(
      `SELECT COUNT(*) as total FROM platform_errors
       WHERE project_id = ? AND scope = 'external'`,
      [params.id]
    ),
  ]);

  return json(success({
    errors: errors.map(e => ({ ...e, context: e.context ? JSON.parse(e.context) : null })),
    total: countRow?.total || 0,
  }));
}

// ── GET /api/admin/errors/stats — summary counts ─────────────────────────────
export async function adminErrorStats(request, env, { user }) {
  requireAdmin(user);
  const db = new DatabaseAdapter(env.DB);

  const stats = await db.all(
    `SELECT
       scope,
       source,
       severity,
       COUNT(*) as count,
       MAX(created_at) as last_seen
     FROM platform_errors
     GROUP BY scope, source, severity
     ORDER BY count DESC`
  );

  const critical = await db.first(
    `SELECT COUNT(*) as count FROM platform_errors
     WHERE severity = 'critical' AND created_at > unixepoch() - 86400`
  );

  return json(success({ stats, critical_last_24h: critical?.count || 0 }));
}

// List admins
export async function listAdmins(request, env, { user }) {
  const db = new DatabaseAdapter(env.DB);
  await requireAdmin(user, db);
  const admins = await db.all('SELECT id, email, name, added_by, created_at FROM admins ORDER BY created_at DESC');
  return json(success(admins));
}

// Add admin
export async function addAdmin(request, env, { user }) {
  const db = new DatabaseAdapter(env.DB);
  await requireAdmin(user, db);
  const { email, name } = await parseBody(request);
  if (!email) return error('Email required', 400);
  await db.run(
    'INSERT INTO admins (email, name, added_by) VALUES (?, ?, ?)',
    [email, name || '', user.email]
  );
  return json(success({ message: `${email} added as admin` }));
}

// Remove admin
export async function removeAdmin(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);
  await requireAdmin(user, db);
  // Prevent removing yourself
  const target = await db.first('SELECT email FROM admins WHERE id = ?', [params.adminId]);
  if (target?.email === user.email) return error('Cannot remove yourself', 400);
  await db.run('DELETE FROM admins WHERE id = ?', [params.adminId]);
  return json(success({ message: 'Admin removed' }));
}

export async function checkAdmin(request, env, { user }) {
  const db = new DatabaseAdapter(env.DB);
  const admin = await db.first(
    'SELECT id FROM admins WHERE email = ?',
    [user.email]
  );
  return json(success({ isAdmin: !!admin }));
}


/**
 * ADD THIS to worker/src/routes/index.js
 */

export async function listAiLogs(request, env, { params, user }) {
  const db = new DatabaseAdapter(env.DB);

  const project = await db.first(
    'SELECT id FROM projects WHERE id = ? AND user_id = ?',
    [params.id, user.sub]
  );
  if (!project) return error('Project not found', 404);

  const url = new URL(request.url);
  const stage = url.searchParams.get('stage');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);

  const where = stage ? 'WHERE project_id = ? AND stage = ?' : 'WHERE project_id = ?';
  const params_ = stage ? [params.id, stage] : [params.id];

  const logs = await db.all(
    `SELECT id, stage, model, prompt, response, parsed_ok, duration_ms, error, created_at
     FROM ai_logs ${where}
     ORDER BY created_at DESC
     LIMIT ?`,
    [...params_, limit]
  );

  return json(success(logs));
}

/**
 * Register in worker/src/index.js:
 * router('GET', '/api/projects/:id/ai-logs', listAiLogs),
 */