
export class EndpointRepo {
    constructor(db) { this.db = db; }

    async listByProject(projectId) {
        return this.db.all('SELECT * FROM endpoints WHERE project_id = ? ORDER BY path, method', [projectId]);
    }

    async get(id) {
        return this.db.first('SELECT * FROM endpoints WHERE id = ?', [id]);
    }

    async upsertMany(projectId, endpoints) {
        const n = v => (v === undefined ? null : v); // D1 rejects undefined, needs null
        const stmts = endpoints.map(ep => ({
            sql: `INSERT INTO endpoints (id, project_id, path, method, summary, description, parameters, request_body, responses, tags, security)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING`,
            params: [
                this.db.uuid(), projectId, ep.path, ep.method.toUpperCase(),
                n(ep.summary), n(ep.description),
                JSON.stringify(ep.parameters || []),
                JSON.stringify(ep.requestBody || null),
                JSON.stringify(ep.responses || {}),
                JSON.stringify(ep.tags || []),
                JSON.stringify(ep.security || [])
            ]
        }));
        return this.db.batch(stmts);
    }

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
    async delete(projectId, endpointId) {
        return await this.db.run('DELETE FROM endpoints WHERE project_id = ? AND id = ?', [projectId, endpointId]);
    }
}