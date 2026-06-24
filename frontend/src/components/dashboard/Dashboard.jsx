import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Globe, TestTube, CheckCircle2, XCircle, Zap,
  Play, Bug, TrendingUp, Clock, ArrowRight, Loader2
} from 'lucide-react';
import { useStore } from '../../store/index.js';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

function MetricCard({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="card" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(255,255,255,0.04)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Icon size={15} color={color || 'var(--text-secondary)'} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 600, color: color || 'var(--text-primary)', letterSpacing: '-0.02em' }}>
        {value ?? '—'}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BugRow({ bug, onDismiss }) {
  const sevColor = { critical: 'var(--red)', high: 'var(--red)', medium: 'var(--amber)', low: 'var(--green)' };
  const sevBg    = { critical: 'var(--red-bg)', high: 'var(--red-bg)', medium: 'var(--amber-bg)', low: 'var(--green-bg)' };
  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
          background: sevBg[bug.severity] || 'var(--blue-bg)',
          color: sevColor[bug.severity] || 'var(--blue)', flexShrink: 0, marginTop: 1
        }}>
          {bug.severity?.toUpperCase()}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{bug.title}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{bug.description}</div>
          {bug.suggested_fix && (
            <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>
              💡 {bug.suggested_fix}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 10, padding: '1px 6px',
              background: 'rgba(255,255,255,0.05)', borderRadius: 4, color: 'var(--text-secondary)'
            }}>
              {bug.method} {bug.path}
            </span>
            <button
              onClick={() => onDismiss(bug.id)}
              style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'none', cursor: 'pointer', padding: 0 }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const MOCK_CHART = [
  { date: 'Mon', passed: 180, failed: 12 },
  { date: 'Tue', passed: 200, failed: 8 },
  { date: 'Wed', passed: 175, failed: 20 },
  { date: 'Thu', passed: 220, failed: 5 },
  { date: 'Fri', passed: 260, failed: 18 },
  { date: 'Sat', passed: 240, failed: 10 },
  { date: 'Sun', passed: 284, failed: 18 },
];

export function Dashboard() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const {
    currentProject, endpoints, endpointStats, bugs, executions,
    testCases, executionRunning,
    setCurrentProject, projects, loadEndpoints, loadBugs,
    loadExecutions, loadTestCases, runExecution, dismissBug
  } = useStore();

  useEffect(() => {
    if (!currentProject && projectId && projects.length) {
      const p = projects.find(x => x.id === projectId);
      if (p) setCurrentProject(p);
    }
  }, [projectId, projects]);

  useEffect(() => {
    if (projectId) {
      loadEndpoints(projectId);
      loadBugs(projectId);
      loadExecutions(projectId);
      loadTestCases(projectId);
    }
  }, [projectId]);

  const lastExec = executions[0];
  const passRate = lastExec?.total
    ? Math.round((lastExec.passed / lastExec.total) * 100)
    : null;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <h1 className="page-title" style={{ margin: 0 }}>{currentProject?.name || 'Dashboard'}</h1>
            {currentProject?.environment && (
              <span className="badge badge-accent" style={{ fontSize: 10 }}>{currentProject.environment}</span>
            )}
          </div>
          <p className="page-subtitle">
            {currentProject?.base_url
              ? <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{currentProject.base_url}</span>
              : 'Select a project to get started'}
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => projectId && runExecution(projectId)}
          disabled={executionRunning || !projectId}
          style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 120 }}
        >
          {executionRunning ? <><div className="spinner" style={{width:14,height:14}} /> Running…</> : <><Play size={14} /> Run Tests</>}
        </button>
      </div>

      {/* Metrics */}
      <div className="grid-5" style={{ marginBottom: 24 }}>
        <MetricCard label="Endpoints" value={endpointStats?.total ?? endpoints.length} icon={Globe} color="var(--blue)" />
        <MetricCard label="Test cases" value={testCases.length || '—'} icon={TestTube} color="var(--accent)" />
        <MetricCard label="Passed" value={lastExec?.passed ?? '—'} icon={CheckCircle2} color="var(--green)" sub={lastExec ? `of ${lastExec.total}` : ''} />
        <MetricCard label="Failed" value={lastExec?.failed ?? '—'} icon={XCircle} color="var(--red)" />
        <MetricCard label="Pass rate" value={passRate !== null ? `${passRate}%` : '—'} icon={TrendingUp}
          color={passRate >= 90 ? 'var(--green)' : passRate >= 70 ? 'var(--amber)' : 'var(--red)'}
        />
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Trend chart */}
        <div className="card" style={{ padding: '20px 22px' }}>
          <div className="section-header">
            <span className="section-title">Test trend (7 days)</span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={MOCK_CHART}>
              <defs>
                <linearGradient id="gPass" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#23d18b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#23d18b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gFail" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff5c5c" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ff5c5c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5a5478' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#16161f', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#f0eeff' }}
              />
              <Area type="monotone" dataKey="passed" stroke="#23d18b" fill="url(#gPass)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="failed" stroke="#ff5c5c" fill="url(#gFail)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Endpoint method breakdown */}
        <div className="card" style={{ padding: '20px 22px' }}>
          <div className="section-header">
            <span className="section-title">Endpoint coverage</span>
          </div>
          {endpointStats ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'GET',    count: endpointStats.get_count,    color: 'var(--green)' },
                { label: 'POST',   count: endpointStats.post_count,   color: 'var(--blue)' },
                { label: 'PUT',    count: endpointStats.put_count,    color: 'var(--amber)' },
                { label: 'DELETE', count: endpointStats.delete_count, color: 'var(--red)' },
                { label: 'PATCH',  count: endpointStats.patch_count,  color: 'var(--pink)' },
              ].map(({ label, count, color }) => count > 0 && (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 600, color, minWidth: 44 }}>{label}</span>
                  <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.round((count / endpointStats.total) * 100)}%`,
                      height: '100%', background: color, borderRadius: 3,
                      transition: 'width 0.5s ease'
                    }} />
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 24, textAlign: 'right' }}>{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <p>Import a Swagger spec to see endpoint coverage</p>
            </div>
          )}
        </div>
      </div>

      {/* Bugs & Recent executions */}
      <div className="grid-2">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bug size={15} color="var(--red)" />
              <span style={{ fontSize: 14, fontWeight: 500 }}>AI-detected bugs</span>
              {bugs.length > 0 && (
                <span className="badge badge-red">{bugs.length}</span>
              )}
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate(`/projects/${projectId}/bugs`)}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              View all <ArrowRight size={12} />
            </button>
          </div>
          {bugs.length === 0 ? (
            <div className="empty-state">
              <CheckCircle2 size={32} color="var(--green)" style={{ opacity: 1 }} />
              <h3 style={{ color: 'var(--green)' }}>No bugs detected</h3>
              <p>Run tests to detect API issues</p>
            </div>
          ) : (
            bugs.slice(0, 3).map(bug => (
              <BugRow key={bug.id} bug={bug} onDismiss={(id) => dismissBug(projectId, id)} />
            ))
          )}
        </div>

        {/* Recent executions */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={15} color="var(--accent)" />
              <span style={{ fontSize: 14, fontWeight: 500 }}>Recent runs</span>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => navigate(`/projects/${projectId}/executions`)}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              View all <ArrowRight size={12} />
            </button>
          </div>
          {executions.length === 0 ? (
            <div className="empty-state">
              <Play size={32} style={{ opacity: 0.3 }} />
              <h3>No executions yet</h3>
              <p>Click "Run Tests" to start your first test run</p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Status</th><th>Passed</th><th>Failed</th><th>Trigger</th><th>Time</th></tr>
              </thead>
              <tbody>
                {executions.slice(0, 5).map(ex => (
                  <tr key={ex.id} onClick={() => navigate(`/projects/${projectId}/executions/${ex.id}`)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span className={`badge ${ex.status === 'done' && ex.failed === 0 ? 'badge-green' : ex.status === 'running' ? 'badge-accent' : 'badge-red'}`}>
                        {ex.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--green)' }}>{ex.passed}</td>
                    <td style={{ color: ex.failed > 0 ? 'var(--red)' : 'var(--text-tertiary)' }}>{ex.failed}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{ex.triggered}</td>
                    <td style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
                      {ex.started_at ? new Date(ex.started_at * 1000).toLocaleTimeString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
