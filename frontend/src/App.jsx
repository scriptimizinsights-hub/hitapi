import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Sidebar } from './components/layout/Sidebar.jsx';
import { Dashboard } from './components/dashboard/Dashboard.jsx';
import { EndpointsPage } from './components/endpoints/EndpointsPage.jsx';
import { TestsPage, ExecutionsPage } from './components/tests/TestsPage.jsx';
import { BugsPage, ReportsPage, NewProjectModal, ToastContainer } from './components/ui/Pages.jsx';
import { HowItWorks } from './components/ui/HowItWorks.jsx';
import { FlowDiagram } from './components/ui/FlowDiagram.jsx';
import { LoginFlowDiagram } from './components/ui/LoginFlowDiagram.jsx';
import { ProjectSettings } from './components/ui/ProjectSettings.jsx';
import { PrivacyPage } from './components/ui/PrivacyPage.jsx';
import { SupportPage } from './components/ui/SupportPage.jsx';
import { useStore } from './store/index.js';
import './styles/global.css';

// ─── Placeholder pages ────────────────────────────────────────────────────────

function MonitorsPage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Monitors</h1>
        <p className="page-subtitle">Scheduled test runs and alerting</p>
      </div>
      <div className="card">
        <div className="empty-state">
          <div style={{ fontSize: 32 }}>🔔</div>
          <h3>Monitors coming soon</h3>
          <p>Configure cron-based runs with Cloudflare Cron Triggers. Alerts via Slack, email, and webhooks.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Layout wrapper ────────────────────────────────────────────────────────

function AppLayout({ children, onNewProject }) {
  return (
    <div className="app-layout">
      <Sidebar onNewProject={onNewProject} />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}

// ─── Home / landing when no project selected ─────────────────────────────────

function Landing({ onNewProject }) {
  const { projects, loadProjects, setCurrentProject, projectLoading } = useStore();

  useEffect(() => { loadProjects(); }, []);

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center', maxWidth: 480, marginBottom: 48 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: 'linear-gradient(135deg, #8264ff, #5ca8ff)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px'
        }}>
          <span style={{ fontSize: 24 }}>⚡</span>
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 10 }}>APIForge</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.7 }}>
          AI-powered API testing on Cloudflare. Import your Swagger spec, generate tests automatically, run them, and detect bugs instantly.
        </p>
      </div>

      {projects.length > 0 ? (
        <div style={{ width: '100%', maxWidth: 480 }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            Your projects
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {projects.map(p => (
              <button
                key={p.id}
                className="card card-hover"
                onClick={() => setCurrentProject(p)}
                style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 700, color: 'var(--accent)'
                }}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'JetBrains Mono, monospace' }}>{p.base_url}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-tertiary)' }}>
                  <span>{p.endpoint_count || 0} endpoints</span>
                  <span className={`badge ${p.environment === 'production' ? 'badge-red' : 'badge-accent'}`} style={{ fontSize: 9 }}>
                    {p.environment}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={onNewProject} style={{ width: '100%', justifyContent: 'center', borderStyle: 'dashed' }}>
            + New project
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={onNewProject} style={{ fontSize: 15, padding: '12px 28px' }}>
          Create your first project
        </button>
      )}
    </div>
  );
}

// ─── Root App ────────────────────────────────────────────────────────────────

export default function App() {
  const [showNewProject, setShowNewProject] = useState(false);
  const { loadProjects, setCurrentProject, projects } = useStore();

  useEffect(() => { loadProjects(); }, []);

  function handleNewProject() { setShowNewProject(true); }
  function handleProjectCreated(project) { setCurrentProject(project); }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public pages — no sidebar */}
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/support" element={<SupportPage />} />

        <Route path="/" element={
          <AppLayout onNewProject={handleNewProject}>
            <Landing onNewProject={handleNewProject} />
          </AppLayout>
        } />
        <Route path="/projects/:projectId/*" element={
          <AppLayout onNewProject={handleNewProject}>
            <ProjectRoutes />
          </AppLayout>
        } />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>

      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={handleProjectCreated}
        />
      )}
      <ToastContainer />
    </BrowserRouter>
  );
}

function ProjectRoutes() {
  const { projectId } = useParams();
  const { projects, setCurrentProject, currentProject } = useStore();

  useEffect(() => {
    if (projectId && projects.length && (!currentProject || currentProject.id !== projectId)) {
      const p = projects.find(x => x.id === projectId);
      if (p) setCurrentProject(p);
    }
  }, [projectId, projects]);

  return (
    <Routes>
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="endpoints" element={<EndpointsPage />} />
      <Route path="tests" element={<TestsPage />} />
      <Route path="executions" element={<ExecutionsPage />} />
      <Route path="bugs" element={<BugsPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="monitors" element={<MonitorsPage />} />
      <Route path="flow" element={<FlowDiagram />} />
      <Route path="login-flow" element={<LoginFlowDiagram />} />
      <Route path="settings" element={<ProjectSettings />} />
      <Route path="*" element={<Navigate to="dashboard" />} />
    </Routes>
  );
}