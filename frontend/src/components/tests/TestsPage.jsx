import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore, api } from '../../store/index.js';
import {
  ChevronDown, ChevronRight, Play, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Clock,
  Send, ArrowRight, Code, Copy, Check, Terminal,
  Cpu, Eye, EyeOff
} from 'lucide-react';

const TYPE_META = {
  positive: { label: 'Positive', color: 'var(--green)', bg: 'var(--green-bg)' },
  negative: { label: 'Negative', color: 'var(--red)', bg: 'var(--red-bg)' },
  boundary: { label: 'Boundary', color: 'var(--amber)', bg: 'var(--amber-bg)' },
  security: { label: 'Security', color: 'var(--pink)', bg: 'var(--pink-bg)' },
};

// ── Copy button ───────────────────────────────────────────────────────────────
function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  function copy(e) {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button onClick={copy} style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
      borderRadius: 4, fontSize: 10, cursor: 'pointer',
      background: copied ? 'var(--green-bg)' : 'rgba(255,255,255,0.06)',
      color: copied ? 'var(--green)' : 'var(--text-tertiary)',
      border: `1px solid ${copied ? 'var(--green-border)' : 'var(--border)'}`,
      transition: 'all 0.15s'
    }}>
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// ── Code block ────────────────────────────────────────────────────────────────
function CodeBlock({ label, data, color, badge }) {
  if (data === null || data === undefined) return null;
  const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if (!str || str === '{}' || str === 'null') return null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: color || 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
          {badge && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' }}>{badge}</span>}
        </div>
        <CopyBtn text={str} />
      </div>
      <pre style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
        background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: '10px 12px',
        color: 'var(--text-secondary)', margin: 0, overflow: 'auto',
        maxHeight: 220, lineHeight: 1.65, border: '1px solid rgba(255,255,255,0.06)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-all'
      }}>{str}</pre>
    </div>
  );
}

// ── Build cURL command ────────────────────────────────────────────────────────
function buildCurl(method, url, headers = {}, body = null) {
  const lines = [`curl -X ${method} '${url}'`];
  for (const [k, v] of Object.entries(headers)) {
    lines.push(`  -H '${k}: ${v}'`);
  }
  if (body) {
    lines.push(`  -d '${JSON.stringify(body)}'`);
  }
  return lines.join(' \\\n');
}

// ── cURL panel ────────────────────────────────────────────────────────────────
function CurlPanel({ method, url, headers, body }) {
  const curl = buildCurl(method, url, headers, body);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Terminal size={12} color="var(--green)" />
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>cURL</span>
          <span style={{ fontSize: 9, color: 'var(--text-tertiary)', padding: '1px 6px', background: 'rgba(255,255,255,0.05)', borderRadius: 10 }}>copy & run in terminal</span>
        </div>
        <CopyBtn text={curl} />
      </div>
      <pre style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
        background: 'rgba(0,30,0,0.4)', borderRadius: 6, padding: '10px 14px',
        color: '#4ade80', margin: 0, overflow: 'auto', maxHeight: 160,
        lineHeight: 1.7, border: '1px solid rgba(74,222,128,0.15)',
        whiteSpace: 'pre-wrap', wordBreak: 'break-all'
      }}>{curl}</pre>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status, code, ms }) {
  if (!status) return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Not run</span>;
  const color = status === 'passed' ? 'var(--green)' : status === 'failed' ? 'var(--red)' : 'var(--amber)';
  const Icon = status === 'passed' ? CheckCircle2 : status === 'failed' ? XCircle : AlertTriangle;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Icon size={13} color={color} />
      <span style={{ fontSize: 11, color, fontWeight: 600 }}>
        {status === 'passed' ? 'Passed' : status === 'failed' ? 'Failed' : 'Error'}
      </span>
      {code && (
        <span style={{
          fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
          color: code < 300 ? 'var(--green)' : code < 400 ? 'var(--amber)' : 'var(--red)',
          padding: '1px 5px', background: 'rgba(0,0,0,0.2)', borderRadius: 3
        }}>{code}</span>
      )}
      {ms && (
        <span style={{ fontSize: 10, color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Clock size={10} />{ms}ms
        </span>
      )}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, color, title, subtitle, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={13} color={color} />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>{subtitle}</div>}
        </div>
      </div>
      {right}
    </div>
  );
}

// ── Main test case row ────────────────────────────────────────────────────────
function TestCaseRow({ tc, endpoint, lastResult, onRunSingle, baseUrl, authType, authConfig }) {
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [showRespHeaders, setShowRespHeaders] = useState(false);
  const meta = TYPE_META[tc.type] || TYPE_META.positive;

  // Parse AI-generated values
  const inputPayload = safeJSON(tc.input_payload);
  const inputParams = safeJSON(tc.input_params);
  const inputHeaders = safeJSON(tc.input_headers);
  const expectedSchema = safeJSON(tc.expected_schema);

  // Build actual request URL
  let resolvedPath = endpoint?.path || '';
  if (inputParams) {
    for (const [k, v] of Object.entries(inputParams)) {
      resolvedPath = resolvedPath.replace(`{${k}}`, encodeURIComponent(String(v)));
    }
  }
  const qsEntries = inputParams
    ? Object.entries(inputParams).filter(([k]) => !endpoint?.path?.includes(`{${k}}`))
    : [];
  const qs = qsEntries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const fullUrl = `${baseUrl}${resolvedPath}${qs ? '?' + qs : ''}`;

  // Build request headers (what will be sent)
  const sentHeaders = { 'Content-Type': 'application/json', ...(inputHeaders || {}) };
  if (authType === 'bearer' && authConfig?.token) sentHeaders['Authorization'] = `Bearer ${authConfig.token}`;
  if (authType === 'apikey' && authConfig?.key) sentHeaders[authConfig.header || 'X-API-Key'] = authConfig.key;
  if (authType === 'login_flow') sentHeaders['Authorization'] = 'Bearer <token from login>';

  const result = lastResult;

  async function runSingle(e) {
    e.stopPropagation();
    setRunning(true);
    setExpanded(true);
    await onRunSingle(tc.id);
    setRunning(false);
  }

  return (
    <>
      {/* Summary row */}
      <tr onClick={() => setExpanded(e => !e)} style={{ cursor: 'pointer', transition: 'background 0.1s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
        onMouseLeave={e => e.currentTarget.style.background = ''}>
        <td style={{ width: 16, paddingLeft: 12 }}>
          {expanded
            ? <ChevronDown size={13} color="var(--accent)" />
            : <ChevronRight size={13} color="var(--text-tertiary)" />}
        </td>
        <td>
          {endpoint && <span className={`method-badge method-${endpoint.method}`}>{endpoint.method}</span>}
        </td>
        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-secondary)' }}>
          {endpoint?.path || '—'}
        </td>
        <td style={{ fontSize: 13 }}>{tc.name}</td>
        <td>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: meta.bg, color: meta.color }}>
            {meta.label}
          </span>
        </td>
        <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>
          {tc.expected_status || '—'}
        </td>
        <td>
          <StatusBadge status={result?.status} code={result?.actual_status} ms={result?.response_time_ms} />
        </td>
        <td onClick={e => e.stopPropagation()}>
          <button onClick={runSingle} disabled={running} style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            borderRadius: 5, fontSize: 11, cursor: running ? 'not-allowed' : 'pointer',
            background: 'var(--accent-dim)', color: 'var(--accent)',
            border: '1px solid rgba(130,100,255,0.25)', opacity: running ? 0.6 : 1, flexShrink: 0
          }}>
            {running
              ? <><div className="spinner" style={{ width: 10, height: 10 }} /> Running</>
              : <><Play size={10} fill="currentColor" /> Run</>}
          </button>
        </td>
      </tr>

      {/* Expanded AI transparency panel */}
      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: 0 }}>
            <div style={{ background: 'rgba(0,0,0,0.22)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '20px 20px 20px 20px' }}>

              {/* AI Reasoning banner */}
              {tc.ai_reasoning && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'var(--accent-dim)', borderRadius: 8, border: '1px solid rgba(130,100,255,0.2)', marginBottom: 16 }}>
                  <Cpu size={14} color="var(--accent)" style={{ marginTop: 1, flexShrink: 0 }} />
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>AI reasoning — </span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{tc.ai_reasoning}</span>
                  </div>
                </div>
              )}

              {/* 3-column layout: REQUEST · CURL · RESPONSE */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

                {/* ── Column 1: What AI generated (request) ── */}
                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <SectionHeader
                    icon={Send}
                    color="var(--accent)"
                    title="Request"
                    subtitle="What AI generated to send"
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Method + Full URL */}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>Full URL</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>
                        {endpoint && <span className={`method-badge method-${endpoint.method}`} style={{ fontSize: 8, padding: '2px 5px' }}>{endpoint.method}</span>}
                        <span style={{ color: 'var(--blue)', wordBreak: 'break-all', flex: 1 }}>{fullUrl}</span>
                        <CopyBtn text={fullUrl} />
                      </div>
                    </div>

                    {/* Path params */}
                    {inputParams && Object.keys(inputParams).length > 0 && (
                      <CodeBlock label="Path / Query params" data={inputParams} color="var(--blue)" />
                    )}

                    {/* Request headers */}
                    <CodeBlock label="Request headers" data={sentHeaders} color="var(--text-tertiary)" badge="auto-injected" />

                    {/* Request body */}
                    {inputPayload
                      ? <CodeBlock label="Request body" data={inputPayload} color="var(--amber)" />
                      : (
                        <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                          No request body
                        </div>
                      )
                    }

                    {/* Expected */}
                    <div style={{ display: 'flex', gap: 8, padding: '7px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Expected status</span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{tc.expected_status || 'Any'}</span>
                    </div>

                    {/* Expected schema */}
                    {expectedSchema && <CodeBlock label="Expected response schema" data={expectedSchema} color="var(--text-tertiary)" />}
                  </div>
                </div>

                {/* ── Column 2: cURL ── */}
                <div style={{ background: 'rgba(0,20,0,0.25)', borderRadius: 10, padding: '14px 16px', border: '1px solid rgba(74,222,128,0.1)' }}>
                  <SectionHeader
                    icon={Terminal}
                    color="var(--green)"
                    title="cURL command"
                    subtitle="Run this in your terminal"
                    right={<CopyBtn text={buildCurl(endpoint?.method || 'GET', fullUrl, sentHeaders, inputPayload)} />}
                  />

                  <pre style={{
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                    background: 'rgba(0,0,0,0.4)', borderRadius: 6, padding: '12px 14px',
                    color: '#4ade80', margin: 0, overflow: 'auto',
                    lineHeight: 1.8, border: '1px solid rgba(74,222,128,0.12)',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    minHeight: 140
                  }}>{buildCurl(endpoint?.method || 'GET', fullUrl, sentHeaders, inputPayload)}</pre>

                  {/* Quick tips */}
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Useful flags</div>
                    {[
                      ['-v', 'verbose — show full request + response headers'],
                      ['-i', 'include response headers in output'],
                      ['--max-time 10', 'timeout after 10 seconds'],
                    ].map(([flag, desc]) => (
                      <div key={flag} style={{ display: 'flex', gap: 8, fontSize: 10 }}>
                        <code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--green)', background: 'rgba(0,0,0,0.3)', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>{flag}</code>
                        <span style={{ color: 'var(--text-tertiary)' }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Column 3: Response ── */}
                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '14px 16px', border: `1px solid ${result ? (result.status === 'passed' ? 'rgba(35,209,139,0.15)' : 'rgba(255,92,92,0.15)') : 'rgba(255,255,255,0.06)'}` }}>
                  <SectionHeader
                    icon={ArrowRight}
                    color={result ? (result.status === 'passed' ? 'var(--green)' : 'var(--red)') : 'var(--text-tertiary)'}
                    title="Response"
                    subtitle={result ? 'What your API returned' : 'Run to see actual response'}
                    right={result && <StatusBadge status={result.status} code={result.actual_status} ms={result.response_time_ms} />}
                  />

                  {!result ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', borderRadius: 8, border: '1px dashed rgba(255,255,255,0.08)' }}>
                      <Play size={24} color="var(--text-tertiary)" style={{ marginBottom: 10 }} />
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                        Click <strong style={{ color: 'var(--accent)' }}>Run</strong> to fire this request and see the actual response from your API
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

                      {/* Status comparison */}
                      <div style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: result.status === 'passed' ? 'rgba(35,209,139,0.08)' : 'rgba(255,92,92,0.08)',
                        border: `1px solid ${result.status === 'passed' ? 'rgba(35,209,139,0.2)' : 'rgba(255,92,92,0.2)'}`
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            Expected <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--green)' }}>{tc.expected_status}</span>
                            {' '}→ Got{' '}
                            <span style={{
                              fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
                              color: result.actual_status < 300 ? 'var(--green)' : result.actual_status < 400 ? 'var(--amber)' : 'var(--red)'
                            }}>{result.actual_status || '—'}</span>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: result.status === 'passed' ? 'var(--green)' : 'var(--red)' }}>
                            {result.status === 'passed' ? '✓ Match' : '✗ Mismatch'}
                          </span>
                        </div>
                      </div>

                      {/* Failure reason */}
                      {result.failure_reason && (
                        <div style={{ padding: '8px 10px', background: 'var(--red-bg)', borderRadius: 6, borderLeft: '2px solid var(--red)' }}>
                          <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase' }}>Failure reason</div>
                          <div style={{ fontSize: 11, color: 'var(--red)', lineHeight: 1.5 }}>{result.failure_reason}</div>
                        </div>
                      )}

                      {/* Response headers toggle */}
                      {result.actual_headers && Object.keys(result.actual_headers).length > 0 && (
                        <div>
                          <button onClick={() => setShowRespHeaders(h => !h)} style={{
                            display: 'flex', alignItems: 'center', gap: 5, fontSize: 10,
                            color: 'var(--text-tertiary)', background: 'none', cursor: 'pointer', padding: '3px 0',
                            textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600
                          }}>
                            {showRespHeaders ? <EyeOff size={10} /> : <Eye size={10} />}
                            Response headers ({Object.keys(result.actual_headers).length})
                          </button>
                          {showRespHeaders && <CodeBlock label="" data={result.actual_headers} color="var(--text-tertiary)" />}
                        </div>
                      )}

                      {/* Response body */}
                      {result.actual_body
                        ? <CodeBlock
                          label="Response body"
                          data={result.actual_body}
                          color={result.status === 'passed' ? 'var(--green)' : 'var(--red)'}
                        />
                        : <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontStyle: 'italic', padding: '6px 0' }}>No response body</div>
                      }

                      {/* Response time bar */}
                      {result.response_time_ms && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
                          <Clock size={11} color="var(--text-tertiary)" />
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Response time:</span>
                          <span style={{
                            fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 600,
                            color: result.response_time_ms < 300 ? 'var(--green)' : result.response_time_ms < 1000 ? 'var(--amber)' : 'var(--red)'
                          }}>{result.response_time_ms}ms</span>
                          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                            {result.response_time_ms < 300 ? '⚡ Fast' : result.response_time_ms < 1000 ? '⏱ OK' : '🐢 Slow'}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeJSON(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return str; }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function TestsPage() {
  const { projectId } = useParams();
  const { testCases, endpoints, loadTestCases, loadEndpoints,
    generateTests, currentProject, addToast } = useStore();
  const [typeFilter, setTypeFilter] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState({});
  const [runningAll, setRunningAll] = useState(false);

  useEffect(() => {
    loadTestCases(projectId);
    loadEndpoints(projectId);
  }, [projectId]);

  const endpointMap = Object.fromEntries(endpoints.map(e => [e.id, e]));
  const filtered = typeFilter === 'all' ? testCases : testCases.filter(tc => tc.type === typeFilter);
  const counts = testCases.reduce((acc, tc) => { acc[tc.type] = (acc[tc.type] || 0) + 1; return acc; }, {});

  const authConfig = currentProject?.auth_config
    ? (() => { try { return JSON.parse(currentProject.auth_config); } catch { return {}; } })()
    : {};

  // Run ALL — via Worker, stores per-test results
  async function handleRunAll() {
    setRunningAll(true);
    try {
      const res = await api.executions.run(projectId, {});
      if (res.results) {
        const map = {};
        res.results.forEach(r => { map[r.test_case_id] = r; });
        setResults(map);
        const p = res.summary?.passed || 0;
        const f = res.summary?.failed || 0;
        addToast(`${p} passed · ${f} failed`, f > 0 ? 'error' : 'success');
      }
    } catch (err) { addToast(err.message, 'error'); }
    finally { setRunningAll(false); }
  }

  // Run SINGLE — fires direct from browser for instant feedback
  async function handleRunSingle(testCaseId) {
    if (!currentProject) { addToast('Project not loaded yet', 'error'); return; }
    const tc = testCases.find(t => t.id === testCaseId);
    const ep = endpointMap[tc?.endpoint_id];
    if (!tc || !ep || !currentProject) return;

    const payload = safeJSON(tc.input_payload);
    const params = safeJSON(tc.input_params) || {};

    let path = ep.path;
    for (const [k, v] of Object.entries(params))
      path = path.replace(`{${k}}`, encodeURIComponent(String(v)));

    const qsStr = Object.entries(params)
      .filter(([k]) => !ep.path.includes(`{${k}}`))
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

    const url = `${currentProject.base_url}${path}${qsStr ? '?' + qsStr : ''}`;
    const headers = { 'Content-Type': 'application/json' };
    if (currentProject.auth_type === 'bearer' && authConfig?.token)
      headers['Authorization'] = `Bearer ${authConfig?.token}`;
    if (currentProject.auth_type === 'apikey' && authConfig?.key)
      headers[authConfig?.header || 'X-API-Key'] = authConfig?.key;

    const start = Date.now();
    try {
      const response = await fetch(url, {
        method: ep.method,
        headers,
        body: payload ? JSON.stringify(payload) : undefined
      });
      const actual_status = response.status;
      const actual_headers = {};
      for (const [k, v] of response.headers.entries()) actual_headers[k] = v;
      const actual_body = await response.json().catch(() => null);
      const passed = !tc.expected_status || actual_status === tc.expected_status;

      const result = {
        test_case_id: testCaseId,
        status: passed ? 'passed' : 'failed',
        actual_status, actual_body, actual_headers,
        response_time_ms: Date.now() - start,
        failure_reason: passed ? null : `Expected ${tc.expected_status}, got ${actual_status}`
      };

      setResults(prev => ({ ...prev, [testCaseId]: result }));

      // Save result to DB via Worker so it persists
      try {
        await api.executions.saveSingleResult(projectId, {
          test_case_id: testCaseId,
          endpoint_id: tc.endpoint_id,
          ...result
        });
      } catch { /* non-critical — result still shown in UI */ }

    } catch (err) {
      const result = {
        test_case_id: testCaseId, status: 'error',
        actual_status: null, actual_body: null, actual_headers: {},
        response_time_ms: Date.now() - start, failure_reason: err.message
      };
      setResults(prev => ({ ...prev, [testCaseId]: result }));
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    try { await generateTests(projectId, { limit: 20 }); addToast('Tests generated', 'success'); }
    catch (err) { addToast(err.message, 'error'); }
    finally { setGenerating(false); }
  }

  const passedCount = Object.values(results).filter(r => r.status === 'passed').length;
  const failedCount = Object.values(results).filter(r => r.status !== 'passed').length;
  const totalRun = Object.keys(results).length;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Test Cases</h1>
          <p className="page-subtitle">
            {testCases.length} tests · AI-generated · click any row to inspect request / response / cURL
            {totalRun > 0 && (
              <span style={{ marginLeft: 12 }}>
                <span style={{ color: 'var(--green)' }}>✓ {passedCount} passed</span>
                {failedCount > 0 && <span style={{ color: 'var(--red)', marginLeft: 8 }}>✗ {failedCount} failed</span>}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleGenerate} disabled={generating}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {generating ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Generating…</> : <><RefreshCw size={13} /> Regenerate</>}
          </button>
          <button className="btn btn-primary" onClick={handleRunAll} disabled={runningAll}
            style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {runningAll ? <><div className="spinner" style={{ width: 13, height: 13 }} /> Running…</> : <><Play size={13} fill="currentColor" /> Run all</>}
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: 'All', count: testCases.length },
          { key: 'positive', label: 'Positive', count: counts.positive || 0, color: 'var(--green)' },
          { key: 'negative', label: 'Negative', count: counts.negative || 0, color: 'var(--red)' },
          { key: 'boundary', label: 'Boundary', count: counts.boundary || 0, color: 'var(--amber)' },
          { key: 'security', label: 'Security', count: counts.security || 0, color: 'var(--pink)' },
        ].map(({ key, label, count, color }) => (
          <button key={key} onClick={() => setTypeFilter(key)} style={{
            padding: '5px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
            background: typeFilter === key ? 'var(--accent-dim)' : 'var(--bg-card)',
            color: typeFilter === key ? 'var(--accent)' : 'var(--text-secondary)',
            border: typeFilter === key ? '1px solid rgba(130,100,255,0.3)' : '1px solid var(--border)',
            fontWeight: typeFilter === key ? 600 : 400, display: 'flex', alignItems: 'center', gap: 5
          }}>
            {label}
            <span style={{ fontSize: 10, color: color || 'var(--text-tertiary)', fontWeight: 700 }}>{count}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <Code size={28} color="var(--text-tertiary)" />
            <h3>No test cases yet</h3>
            <p>Click "Regenerate" to generate AI tests from your imported endpoints.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 16 }} />
                <th style={{ width: 70 }}>Method</th>
                <th>Path</th>
                <th>Test name</th>
                <th style={{ width: 80 }}>Type</th>
                <th style={{ width: 70 }}>Expects</th>
                <th style={{ width: 150 }}>Result</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(tc => (
                <TestCaseRow
                  key={tc.id}
                  tc={tc}
                  endpoint={endpointMap[tc.endpoint_id]}
                  lastResult={results[tc.id]}
                  onRunSingle={handleRunSingle}
                  baseUrl={currentProject?.base_url || ''}
                  authType={currentProject?.auth_type}
                  authConfig={authConfig}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export { ExecutionsPage } from './ExecutionsPage.jsx';