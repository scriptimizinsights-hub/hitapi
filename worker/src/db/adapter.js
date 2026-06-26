/**
 * Database Adapter — abstracts Cloudflare D1
 * To swap to Postgres/MySQL: replace this file's implementation.
 * The interface (query, run, first, all) stays identical.
 */

export class DatabaseAdapter {
  constructor(binding) {
    this.db = binding;
    this.type = 'D1'; // change to 'PG' | 'MYSQL' when swapping
  }

  /** Run a SELECT, return all rows */
  async all(sql, params = []) {
    const stmt = this.db.prepare(sql).bind(...params);
    const result = await stmt.all();
    return result.results;
  }

  /** Run a SELECT, return first row */
  async first(sql, params = []) {
    return this.db.prepare(sql).bind(...params).first();
  }

  /** Run INSERT/UPDATE/DELETE */
  async run(sql, params = []) {
    return this.db.prepare(sql).bind(...params).run();
  }

  /** Run multiple statements in a batch */
  async batch(statements) {
    const stmts = statements.map(({ sql, params = [] }) =>
      this.db.prepare(sql).bind(...params)
    );
    return this.db.batch(stmts);
  }

  /** Generate a UUID (D1/SQLite compatible) */
  uuid() {
    return crypto.randomUUID();
  }

  /** Current unix timestamp */
  now() {
    return Math.floor(Date.now() / 1000);
  }
}

// ─── Repository helpers ────────────────────────────────────────────────────

export class ProjectRepo {
  constructor(db) { this.db = db; }

  async list() {
    return this.db.all(
      `SELECT p.*, 
        (SELECT COUNT(*) FROM endpoints WHERE project_id = p.id) AS endpoint_count,
        (SELECT COUNT(*) FROM test_cases tc JOIN test_suites ts ON tc.suite_id = ts.id WHERE ts.project_id = p.id) AS test_count
       FROM projects p ORDER BY p.created_at DESC`
    );
  }

  async get(id) {
    return this.db.first('SELECT * FROM projects WHERE id = ?', [id]);
  }

  async create(data) {
    const id = this.db.uuid();
    await this.db.run(
      `INSERT INTO projects (id, name, description, swagger_url, base_url, environment, auth_type, auth_config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.name, data.description, data.swagger_url, data.base_url,
        data.environment || 'development', data.auth_type || 'none',
        data.auth_config ? JSON.stringify(data.auth_config) : null]
    );
    return this.get(id);
  }

  async update(id, data) {
    const fields = [];
    const vals = [];
    const allowed = ['name', 'description', 'swagger_url', 'base_url', 'environment', 'auth_type', 'auth_config'];
    for (const k of allowed) {
      if (data[k] !== undefined) {
        fields.push(`${k} = ?`);
        vals.push(k === 'auth_config' ? JSON.stringify(data[k]) : data[k]);
      }
    }
    if (!fields.length) return this.get(id);
    fields.push('updated_at = ?');
    vals.push(this.db.now(), id);
    await this.db.run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, vals);
    return this.get(id);
  }

  async delete(id) {
    return this.db.run('DELETE FROM projects WHERE id = ?', [id]);
  }
}

export class EndpointRepo {
  constructor(db) { this.db = db; }

  async listByProject(projectId) {
    return this.db.all('SELECT * FROM endpoints WHERE project_id = ? ORDER BY path, method', [projectId]);
  }

  async get(id) {
    return this.db.first('SELECT * FROM endpoints WHERE id = ?', [id]);
  }

  async upsertMany(projectId, endpoints) {
    const n = v => (v === undefined ? null : v);

    const stmts = endpoints.map(ep => {
      console.log("=================================");
      console.log("Path:", ep.path);
      console.log("Method:", ep.method);
      console.log("Request Body:", ep.requestBody);
      console.log("Request Body (JSON):", JSON.stringify(ep.requestBody, null, 2));
      console.log("=================================");

      return {
        sql: `INSERT INTO endpoints (
              id, project_id, path, method, summary, description,
              parameters, request_body, responses, tags, security
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING`,
        params: [
          this.db.uuid(),
          projectId,
          ep.path,
          ep.method.toUpperCase(),
          n(ep.summary),
          n(ep.description),
          JSON.stringify(ep.parameters || []),
          JSON.stringify(ep.requestBody || null),
          JSON.stringify(ep.responses || {}),
          JSON.stringify(ep.tags || []),
          JSON.stringify(ep.security || [])
        ]
      };
    });

    return this.db.batch(stmts);
  }

  // async upsertMany(projectId, endpoints) {
  //   const n = v => (v === undefined ? null : v); // D1 rejects undefined, needs null
  //   const stmts = endpoints.map(ep => (
  //     {
  //     sql: `INSERT INTO endpoints (id, project_id, path, method, summary, description, parameters, request_body, responses, tags, security)
  //           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  //           ON CONFLICT(id) DO NOTHING`,
  //     params: [
  //       this.db.uuid(), projectId, ep.path, ep.method.toUpperCase(),
  //       n(ep.summary), n(ep.description),
  //       JSON.stringify(ep.parameters || []),
  //       JSON.stringify(ep.requestBody || null),
  //       JSON.stringify(ep.responses || {}),
  //       JSON.stringify(ep.tags || []),
  //       JSON.stringify(ep.security || [])
  //     ]
  //   }));
  //   return this.db.batch(stmts);
  // }

  async stats(projectId) {
    return this.db.first(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN method='GET' THEN 1 ELSE 0 END) as get_count,
        SUM(CASE WHEN method='POST' THEN 1 ELSE 0 END) as post_count,
        SUM(CASE WHEN method='PUT' THEN 1 ELSE 0 END) as put_count,
        SUM(CASE WHEN method='DELETE' THEN 1 ELSE 0 END) as delete_count,
        SUM(CASE WHEN method='PATCH' THEN 1 ELSE 0 END) as patch_count
       FROM endpoints WHERE project_id = ?`,
      [projectId]
    );
  }
}

export class TestCaseRepo {
  constructor(db) { this.db = db; }

  async listByEndpoint(endpointId) {
    return this.db.all(
      `SELECT tc.* FROM test_cases tc
       JOIN test_suites ts ON tc.suite_id = ts.id
       WHERE tc.endpoint_id = ? ORDER BY tc.type, tc.name`,
      [endpointId]
    );
  }

  async listByProject(projectId) {
    return this.db.all(
      `SELECT tc.*, e.path, e.method FROM test_cases tc
       JOIN test_suites ts ON tc.suite_id = ts.id
       JOIN endpoints e ON tc.endpoint_id = e.id
       WHERE ts.project_id = ? ORDER BY e.path, tc.type`,
      [projectId]
    );
  }

  async createSuite(projectId, endpointId, name) {
    const id = this.db.uuid();
    await this.db.run(
      'INSERT INTO test_suites (id, project_id, endpoint_id, name, generated) VALUES (?, ?, ?, ?, 1)',
      [id, projectId, endpointId, name]
    );
    return id;
  }

  async insertMany(suiteId, endpointId, cases) {
    const n = v => (v === undefined ? null : v);
    const stmts = cases.map(tc => ({
      sql: `INSERT INTO test_cases (id, suite_id, endpoint_id, name, type, input_payload, input_headers, input_params, expected_status, expected_schema, ai_reasoning)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [
        this.db.uuid(), suiteId, endpointId,
        n(tc.name), n(tc.type),
        tc.input_payload ? JSON.stringify(tc.input_payload) : null,
        tc.input_headers ? JSON.stringify(tc.input_headers) : null,
        tc.input_params ? JSON.stringify(tc.input_params) : null,
        n(tc.expected_status) ?? null,
        tc.expected_schema ? JSON.stringify(tc.expected_schema) : null,
        n(tc.ai_reasoning)
      ]
    }));
    return this.db.batch(stmts);
  }

  async countByProject(projectId) {
    return this.db.first(
      `SELECT COUNT(*) as total FROM test_cases tc
       JOIN test_suites ts ON tc.suite_id = ts.id
       WHERE ts.project_id = ?`,
      [projectId]
    );
  }

  async deleteByEndpoint(endpointId) {
    // Delete test cases first, then suites
    await this.db.run(
      `DELETE FROM test_cases WHERE endpoint_id = ?`,
      [endpointId]
    );
    await this.db.run(
      `DELETE FROM test_suites WHERE endpoint_id = ?`,
      [endpointId]
    );
  }

  async deleteByProject(projectId) {
    await this.db.run(
      `DELETE FROM test_cases WHERE endpoint_id IN (
         SELECT id FROM endpoints WHERE project_id = ?
       )`,
      [projectId]
    );
    await this.db.run(
      `DELETE FROM test_suites WHERE project_id = ?`,
      [projectId]
    );
  }
}

export class ExecutionRepo {
  constructor(db) { this.db = db; }

  async create(projectId, triggered = 'manual') {
    const id = this.db.uuid();
    await this.db.run(
      'INSERT INTO executions (id, project_id, triggered) VALUES (?, ?, ?)',
      [id, projectId, triggered]
    );
    return id;
  }

  async update(id, data) {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const vals = [...Object.values(data), id];
    return this.db.run(`UPDATE executions SET ${fields} WHERE id = ?`, vals);
  }

  async get(id) {
    return this.db.first('SELECT * FROM executions WHERE id = ?', [id]);
  }

  async listByProject(projectId) {
    return this.db.all(
      'SELECT * FROM executions WHERE project_id = ? ORDER BY created_at DESC LIMIT 20',
      [projectId]
    );
  }

  async saveResult(executionId, result) {
    return this.db.run(
      `INSERT INTO execution_results 
        (id, execution_id, test_case_id, endpoint_id, status, actual_status, actual_body, actual_headers, response_time_ms, failure_reason, ai_analysis)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        this.db.uuid(), executionId, result.test_case_id, result.endpoint_id,
        result.status, result.actual_status,
        result.actual_body ? JSON.stringify(result.actual_body) : null,
        result.actual_headers ? JSON.stringify(result.actual_headers) : null,
        result.response_time_ms, result.failure_reason, result.ai_analysis
      ]
    );
  }

  async getResults(executionId) {
    return this.db.all(
      `SELECT er.*, tc.name as test_name, tc.type as test_type, e.path, e.method
       FROM execution_results er
       JOIN test_cases tc ON er.test_case_id = tc.id
       JOIN endpoints e ON er.endpoint_id = e.id
       WHERE er.execution_id = ? ORDER BY e.path`,
      [executionId]
    );
  }
}

export class BugRepo {
  constructor(db) { this.db = db; }

  async create(data) {
    const id = this.db.uuid();
    await this.db.run(
      `INSERT INTO bugs (id, project_id, execution_id, endpoint_id, severity, title, description, root_cause, suggested_fix)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.project_id, data.execution_id, data.endpoint_id,
        data.severity, data.title, data.description, data.root_cause, data.suggested_fix]
    );
    return id;
  }

  async listByProject(projectId) {
    return this.db.all(
      `SELECT b.*, e.path, e.method FROM bugs b
       JOIN endpoints e ON b.endpoint_id = e.id
       WHERE b.project_id = ? AND b.status = 'open'
       ORDER BY CASE b.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
      [projectId]
    );
  }

  async dismiss(id) {
    return this.db.run("UPDATE bugs SET status = 'dismissed' WHERE id = ?", [id]);
  }
}