import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { TestTube, Filter, ChevronDown, ChevronRight, Code } from 'lucide-react';
import { useStore } from '../../store/index.js';

const TYPE_META = {
  positive: { label: 'Positive', color: 'var(--green)', bg: 'var(--green-bg)' },
  negative: { label: 'Negative', color: 'var(--red)', bg: 'var(--red-bg)' },
  boundary: { label: 'Boundary', color: 'var(--amber)', bg: 'var(--amber-bg)' },
  security: { label: 'Security', color: 'var(--pink)', bg: 'var(--pink-bg)' },
};

function TestCaseRow({ tc, endpoint }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[tc.type] || TYPE_META.positive;
  const payload = (() => { try { return tc.input_payload ? JSON.parse(tc.input_payload) : null; } catch { return null; } })();

  return (
    <>
      <tr onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer' }}>
        <td>
          {endpoint && <span className={`method-badge method-${endpoint.method}`}>{endpoint.method}</span>}
        </td>
        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          {endpoint?.path || '—'}
        </td>
        <td style={{ fontSize: 13 }}>{tc.name}</td>
        <td>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: meta.bg, color: meta.color
          }}>{meta.label}</span>
        </td>
        <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
          {tc.expected_status || '—'}
        </td>
        <td>
          {expanded ? <ChevronDown size={14} color="var(--text-tertiary)" /> : <ChevronRight size={14} color="var(--text-tertiary)" />}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
          <td colSpan={6} style={{ padding: '12px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {payload && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payload</div>
                  <div className="code-block">{JSON.stringify(payload, null, 2)}</div>
                </div>
              )}
              {tc.ai_reasoning && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI reasoning</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--accent-dim)', borderRadius: 6, borderLeft: '2px solid var(--accent)' }}>
                    {tc.ai_reasoning}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function TestsPage() {
  const { projectId } = useParams();
  const { testCases, endpoints, loadTestCases, generateTests } = useStore();
  const [typeFilter, setTypeFilter] = useState('all');
  const [generating, setGenerating] = useState(false);

  useEffect(() => { loadTestCases(projectId); }, [projectId]);

  const endpointMap = Object.fromEntries(endpoints.map(e => [e.id, e]));
  const filtered = typeFilter === 'all' ? testCases : testCases.filter(tc => tc.type === typeFilter);

  const counts = testCases.reduce((acc, tc) => {
    acc[tc.type] = (acc[tc.type] || 0) + 1;
    return acc;
  }, {});

  async function handleGenerate() {
    setGenerating(true);
    try { await generateTests(projectId); }
    finally { setGenerating(false); }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Test Cases</h1>
          <p className="page-subtitle">{testCases.length} tests · AI-generated from your API spec</p>
        </div>
        <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
          {generating ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Generating…</> : '⚡ Regenerate all'}
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {['all', 'positive', 'negative', 'boundary', 'security'].map(type => {
          const meta = TYPE_META[type] || { label: 'All', color: 'var(--text-secondary)', bg: 'transparent' };
          const count = type === 'all' ? testCases.length : (counts[type] || 0);
          const active = typeFilter === type;
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              style={{
                padding: '7px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                background: active ? meta.bg : 'var(--bg-card)',
                color: active ? meta.color : 'var(--text-secondary)',
                border: active ? `1px solid ${meta.color}40` : '1px solid var(--border)',
                fontWeight: active ? 600 : 400, transition: 'all 0.12s',
                display: 'flex', alignItems: 'center', gap: 6
              }}
            >
              {type === 'all' ? 'All' : meta.label}
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                background: 'rgba(255,255,255,0.08)', color: active ? meta.color : 'var(--text-tertiary)'
              }}>{count}</span>
            </button>
          );
        })}
      </div>

      {testCases.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <TestTube size={40} />
            <h3>No test cases yet</h3>
            <p>Generate AI-powered test cases from your imported endpoints</p>
            <button className="btn btn-primary" onClick={handleGenerate} style={{ marginTop: 8 }}>
              ⚡ Generate tests
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Method</th>
                <th>Path</th>
                <th>Test name</th>
                <th style={{ width: 90 }}>Type</th>
                <th style={{ width: 80 }}>Expects</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(tc => (
                <TestCaseRow key={tc.id} tc={tc} endpoint={endpointMap[tc.endpoint_id]} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Execution Results ───────────────────────────────────────────────────────

export function ExecutionsPage() {
  const { projectId } = useParams();
  const {
    executions, endpoints, testCases,
    currentExecution, lastRunResult,
    loadExecutions, loadEndpoints, loadTestCases,
    getExecutionDetails, runExecution, executionRunning
  } = useStore();
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadExecutions(projectId);
    loadEndpoints(projectId);
    loadTestCases(projectId);
  }, [projectId]);

  // When a new run finishes inline, auto-select it
  useEffect(() => {
    if (lastRunResult?.execution_id) setSelectedId(lastRunResult.execution_id);
  }, [lastRunResult]);

  async function viewExecution(id) {
    setSelectedId(id);
    await getExecutionDetails(projectId, id);
  }

  // Resolve display data — prefer lastRunResult for immediate feedback
  const isLastRun = lastRunResult && selectedId === lastRunResult.execution_id;
  const exec = isLastRun ? lastRunResult.summary : currentExecution?.execution;
  const rawResults = isLastRun ? lastRunResult.results : (currentExecution?.results || []);
  const loginResult = isLastRun ? lastRunResult.login : null;

  // Enrich results with endpoint/test metadata
  const endpointMap = Object.fromEntries(endpoints.map(e => [e.id, e]));
  const tcMap = Object.fromEntries(testCases.map(t => [t.id, t]));
  const enriched = rawResults.map(r => ({
    ...r,
    endpoint: endpointMap[r.endpoint_id],
    testCase: tcMap[r.test_case_id]
  }));

  const filtered = statusFilter === 'all' ? enriched : enriched.filter(r => r.status === statusFilter);

  const passRate = exec?.total
    ? Math.round(((exec.passed || exec.pass_rate !== undefined ? (exec.pass_rate ?? Math.round((exec.passed / exec.total) * 100)) : 0)))
    : 0;
  const passed = exec?.passed ?? 0;
  const failed = exec?.failed ?? 0;
  const total = exec?.total ?? 0;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Executions</h1>
          <p className="page-subtitle">Run your test suite and see results instantly</p>
        </div>
        <button className="btn btn-primary" onClick={() => runExecution(projectId)} disabled={executionRunning}
          style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 120 }}>
          {executionRunning
            ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Running…</>
            : <><span>▶</span> Run Tests</>}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── Left: run history ── */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 500 }}>
            Run history
          </div>
          {executions.length === 0 ? (
            <div className="empty-state" style={{ padding: 24 }}><p>No runs yet</p></div>
          ) : executions.map(ex => {
            const rate = ex.total ? Math.round((ex.passed / ex.total) * 100) : 0;
            const active = selectedId === ex.id;
            return (
              <div key={ex.id} onClick={() => viewExecution(ex.id)} style={{
                padding: '12px 16px', cursor: 'pointer',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                background: active ? 'rgba(130,100,255,0.05)' : 'transparent',
                borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.12s'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className={`badge ${ex.failed > 0 ? 'badge-red' : 'badge-green'}`}>{ex.status}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                    {ex.started_at ? new Date(ex.started_at * 1000).toLocaleTimeString() : 'Pending'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 12 }}>
                  <span style={{ color: 'var(--green)' }}>✓ {ex.passed}</span>
                  <span style={{ color: 'var(--red)' }}>✗ {ex.failed}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>{ex.total} total</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 600, color: rate >= 90 ? 'var(--green)' : rate >= 70 ? 'var(--amber)' : 'var(--red)' }}>
                    {rate}%
                  </span>
                </div>
                <div className="progress-track" style={{ marginTop: 6 }}>
                  <div className={`progress-fill ${rate >= 90 ? 'green' : rate >= 70 ? '' : 'red'}`} style={{ width: `${rate}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Right: results panel ── */}
        <div>
          {!exec && !executionRunning ? (
            <div className="card">
              <div className="empty-state">
                <span style={{ fontSize: 32 }}>▶</span>
                <h3>Run your tests</h3>
                <p>Click "Run Tests" to execute your test suite and see instant pass/fail results for every endpoint.</p>
              </div>
            </div>
          ) : executionRunning ? (
            <div className="card">
              <div className="empty-state">
                <div className="spinner" style={{ width: 32, height: 32 }} />
                <h3>Running tests…</h3>
                <p>Sending requests to your API. Results will appear here immediately when done.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Total', val: total, color: 'var(--text-primary)' },
                  { label: 'Passed', val: passed, color: 'var(--green)' },
                  { label: 'Failed', val: failed, color: 'var(--red)' },
                  { label: 'Pass rate', val: `${passRate}%`, color: passRate >= 90 ? 'var(--green)' : passRate >= 70 ? 'var(--amber)' : 'var(--red)' },
                ].map(s => (
                  <div key={s.label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Login flow status */}
              {loginResult && (
                <div style={{
                  marginBottom: 12, padding: '10px 14px', borderRadius: 8,
                  background: loginResult.success ? 'var(--green-bg)' : 'var(--red-bg)',
                  border: `1px solid ${loginResult.success ? 'var(--green-border)' : 'var(--red-border)'}`,
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13
                }}>
                  <span style={{ fontSize: 16 }}>{loginResult.success ? '🔐' : '⚠'}</span>
                  <div>
                    <span style={{ fontWeight: 500, color: loginResult.success ? 'var(--green)' : 'var(--red)' }}>
                      {loginResult.success ? 'Login succeeded' : 'Login failed'}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>{loginResult.message}</span>
                  </div>
                </div>
              )}

              {/* Filter tabs */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                {[
                  { key: 'all', label: 'All', count: enriched.length },
                  { key: 'passed', label: 'Passed', count: enriched.filter(r => r.status === 'passed').length, color: 'var(--green)' },
                  { key: 'failed', label: 'Failed', count: enriched.filter(r => r.status === 'failed').length, color: 'var(--red)' },
                  { key: 'error', label: 'Error', count: enriched.filter(r => r.status === 'error').length, color: 'var(--amber)' },
                ].map(({ key, label, count, color }) => (
                  <button key={key} onClick={() => setStatusFilter(key)} style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    background: statusFilter === key ? 'var(--accent-dim)' : 'var(--bg-card)',
                    color: statusFilter === key ? 'var(--accent)' : 'var(--text-secondary)',
                    border: statusFilter === key ? '1px solid rgba(130,100,255,0.3)' : '1px solid var(--border)',
                    fontWeight: statusFilter === key ? 600 : 400
                  }}>
                    {label}
                    <span style={{ marginLeft: 5, fontSize: 11, color: color || 'var(--text-tertiary)' }}>{count}</span>
                  </button>
                ))}
              </div>

              {/* Results table */}
              <div className="card" style={{ overflow: 'hidden' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 16 }} />
                      <th style={{ width: 70 }}>Method</th>
                      <th>Path</th>
                      <th>Test</th>
                      <th style={{ width: 60 }}>HTTP</th>
                      <th style={{ width: 70 }}>Time</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => (
                      <tr key={i} style={{ opacity: r.status === 'skipped' ? 0.5 : 1 }}>
                        <td>
                          <div style={{
                            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                            background: r.status === 'passed' ? 'var(--green)'
                              : r.status === 'failed' ? 'var(--red)'
                                : r.status === 'error' ? 'var(--amber)'
                                  : 'var(--text-tertiary)',
                            boxShadow: r.status === 'passed' ? '0 0 4px var(--green)'
                              : r.status === 'failed' ? '0 0 4px var(--red)' : 'none'
                          }} />
                        </td>
                        <td>
                          {r.endpoint && (
                            <span className={`method-badge method-${r.endpoint.method}`}>{r.endpoint.method}</span>
                          )}
                        </td>
                        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-secondary)' }}>
                          {r.endpoint?.path || '—'}
                        </td>
                        <td style={{ fontSize: 12 }}>{r.testCase?.name || '—'}</td>
                        <td style={{
                          fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 600,
                          color: !r.actual_status ? 'var(--text-tertiary)'
                            : r.actual_status < 300 ? 'var(--green)'
                              : r.actual_status < 400 ? 'var(--blue)'
                                : 'var(--red)'
                        }}>
                          {r.actual_status || '—'}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          {r.response_time_ms ? `${r.response_time_ms}ms` : '—'}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--red)', maxWidth: 200 }}>
                          {r.failure_reason || ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && (
                  <div className="empty-state" style={{ padding: 24 }}><p>No results match filter</p></div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}