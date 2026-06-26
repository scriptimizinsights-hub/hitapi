/**
 * API Client — talks to Cloudflare Worker backend
 */

const BASE = import.meta.env.VITE_API_URL ?? 'https://services.hitapi.dev/api';

async function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });

  const data = await response.json().catch(() => ({ error: 'Invalid response' }));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data.data !== undefined ? data.data : data;
}

export const api = {
  // Projects
  projects: {
    list: () => request('/projects'),
    get: (id) => request(`/projects/${id}`),
    create: (body) => request('/projects', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body) => request(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
    testLogin: (id, body) => request(`/projects/${id}/test-login`, { method: 'POST', body: JSON.stringify(body) })
  },
  // Swagger
  swagger: {
    import: (id, body) => request(`/projects/${id}/import`, { method: 'POST', body: JSON.stringify(body) })
  },
  // Endpoints
  endpoints: {
    list: (id) => request(`/projects/${id}/endpoints`),
    stats: (id) => request(`/projects/${id}/endpoints/stats`)
  },
  // Tests
  tests: {
    generate: (id, body) => request(`/projects/${id}/generate`, { method: 'POST', body: JSON.stringify(body) }),
    list: (id, params) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : '';
      return request(`/projects/${id}/tests${qs}`);
    }
  },
  // Executions
  executions: {
    run: (id, body) => request(`/projects/${id}/run`, { method: 'POST', body: JSON.stringify(body) }),
    list: (id) => request(`/projects/${id}/executions`),
    get: (id, execId) => request(`/projects/${id}/executions/${execId}`),
    saveSingleResult: (id, body) => request(`/projects/${id}/run-single`, { method: 'POST', body: JSON.stringify(body) })
  },
  // Flows
  flows: {
    list: (id) => request(`/projects/${id}/flows`),
    autoGenerate: (id) => request(`/projects/${id}/flows/auto-generate`, { method: 'POST', body: '{}' }),
    get: (id, flowId) => request(`/projects/${id}/flows/${flowId}`),
    create: (id, body) => request(`/projects/${id}/flows`, { method: 'POST', body: JSON.stringify(body) }),
    update: (id, flowId, body) => request(`/projects/${id}/flows/${flowId}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id, flowId) => request(`/projects/${id}/flows/${flowId}`, { method: 'DELETE' }),
    run: (id, flowId, body) => request(`/projects/${id}/flows/${flowId}/run`, { method: 'POST', body: JSON.stringify(body || {}) }),
    listRuns: (id, flowId) => request(`/projects/${id}/flows/${flowId}/runs`),
    getRun: (id, flowId, runId) => request(`/projects/${id}/flows/${flowId}/runs/${runId}`),
    updateStep: (id, flowId, stepId, body) => request(`/projects/${id}/flows/${flowId}/steps/${stepId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  // Bugs
  bugs: {
    list: (id) => request(`/projects/${id}/bugs`),
    dismiss: (id, bugId) => request(`/projects/${id}/bugs/${bugId}`, { method: 'DELETE' })
  },
  // Workflows
  workflows: {
    detect: (id) => request(`/projects/${id}/workflows`)
  },
  // Reports
  reports: {
    list: (id) => request(`/projects/${id}/reports`)
  }
};

// ─── Zustand store ────────────────────────────────────────────────────────

import { create } from 'zustand';

export const useStore = create((set, get) => ({
  // Projects
  projects: [],
  currentProject: null,
  projectLoading: false,

  // Endpoints
  endpoints: [],
  endpointStats: null,

  // Tests
  testCases: [],
  testsByEndpoint: {},

  // Executions
  executions: [],
  currentExecution: null,
  executionRunning: false,
  lastRunResult: null,   // ← full results from most recent run

  // Bugs
  bugs: [],

  // Workflows
  workflows: [],

  // UI
  toasts: [],
  sidebarCollapsed: false,

  // ─── Actions ───────────────────────────────────────────────────────────

  loadProjects: async () => {
    set({ projectLoading: true });
    try {
      const projects = await api.projects.list();
      set({ projects, projectLoading: false });
    } catch (err) {
      get().addToast(err.message, 'error');
      set({ projectLoading: false });
    }
  },

  setCurrentProject: async (project) => {
    set({ currentProject: project, endpoints: [], bugs: [], executions: [] });
    if (project) {
      get().loadEndpoints(project.id);
      get().loadBugs(project.id);
      get().loadExecutions(project.id);
    }
  },

  createProject: async (data) => {
    const project = await api.projects.create(data);
    set(s => ({ projects: [project, ...s.projects] }));
    get().addToast('Project created', 'success');
    return project;
  },

  deleteProject: async (id) => {
    await api.projects.delete(id);
    set(s => ({
      projects: s.projects.filter(p => p.id !== id),
      currentProject: s.currentProject?.id === id ? null : s.currentProject
    }));
    get().addToast('Project deleted', 'success');
  },

  importSwagger: async (projectId, data) => {
    const result = await api.swagger.import(projectId, data);
    get().loadEndpoints(projectId);
    get().addToast(`Imported ${result.imported} endpoints`, 'success');
    return result;
  },

  loadEndpoints: async (projectId) => {
    const data = await api.endpoints.list(projectId);
    set({ endpoints: data.endpoints || [], endpointStats: data.stats });
  },

  generateTests: async (projectId, options = {}) => {
    const result = await api.tests.generate(projectId, options);
    await get().loadTestCases(projectId);
    get().addToast(`Generated ${result.total} test cases`, 'success');
    return result;
  },

  loadTestCases: async (projectId, endpointId) => {
    const cases = await api.tests.list(projectId, endpointId ? { endpoint_id: endpointId } : {});
    if (endpointId) {
      set(s => ({ testsByEndpoint: { ...s.testsByEndpoint, [endpointId]: cases } }));
    } else {
      set({ testCases: cases });
    }
    return cases;
  },

  runExecution: async (projectId) => {
    set({ executionRunning: true, lastRunResult: null });
    try {
      const result = await api.executions.run(projectId);

      if (result.status === 'queued') {
        get().addToast('Execution queued', 'info');
        const poll = setInterval(async () => {
          const exec = await api.executions.get(projectId, result.execution_id);
          if (exec.execution?.status === 'done' || exec.execution?.status === 'failed') {
            clearInterval(poll);
            set({ executionRunning: false });
            get().loadExecutions(projectId);
            get().loadBugs(projectId);
            get().addToast(
              `Done — ${exec.execution.passed} passed, ${exec.execution.failed} failed`,
              exec.execution.failed > 0 ? 'error' : 'success'
            );
          }
        }, 2000);
      } else {
        // Inline result — we have everything immediately
        set({ executionRunning: false, lastRunResult: result });
        get().loadExecutions(projectId);
        get().loadBugs(projectId);

        const { passed, failed, total, pass_rate } = result.summary || {};
        const loginMsg = result.login ? (result.login.success ? `🔐 Login OK · ` : `⚠ Login failed · `) : '';
        get().addToast(
          `${loginMsg}${passed}/${total} passed (${pass_rate}%)`,
          failed > 0 ? 'error' : 'success'
        );
      }
      return result;
    } catch (err) {
      set({ executionRunning: false });
      get().addToast(err.message, 'error');
      throw err;
    }
  },

  loadExecutions: async (projectId) => {
    const data = await api.executions.list(projectId);
    set({ executions: data });
  },

  getExecutionDetails: async (projectId, execId) => {
    const data = await api.executions.get(projectId, execId);
    set({ currentExecution: data });
    return data;
  },

  loadBugs: async (projectId) => {
    const data = await api.bugs.list(projectId);
    set({ bugs: data });
  },

  dismissBug: async (projectId, bugId) => {
    await api.bugs.dismiss(projectId, bugId);
    set(s => ({ bugs: s.bugs.filter(b => b.id !== bugId) }));
    get().addToast('Bug dismissed', 'success');
  },

  detectWorkflows: async (projectId) => {
    const data = await api.workflows.detect(projectId);
    set({ workflows: data });
    return data;
  },

  addToast: (message, type = 'info') => {
    const id = Date.now();
    set(s => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 4000);
  },

  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
}));