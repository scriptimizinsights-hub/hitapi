import { useEffect, useMemo, useState } from 'react';
import { Download, Copy, Check, X } from 'lucide-react';
import { api } from '../../store/index.js';
import { TEST_FORMATS, exportTests, downloadText } from '../../utils/testExport.js';

/**
 * Export test cases to Playwright, Pytest, Jest or k6.
 * The file reads BASE_URL / API_TOKEN from the environment; the default
 * BASE_URL written into it is the one chosen here (project, mock or custom).
 */
export function ExportTestsModal({ project, testCases, filteredCases, filterLabel, onClose }) {
    const [format, setFormat] = useState('playwright');
    const [scope, setScope] = useState(filteredCases && filteredCases.length !== testCases.length ? 'filtered' : 'all');
    const [target, setTarget] = useState('project');
    const [customUrl, setCustomUrl] = useState('');
    const [mockUrl, setMockUrl] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let alive = true;
        api.mock.get(project.id).then(d => { if (alive && d?.mock?.enabled) setMockUrl(d.mock.url); }).catch(() => { });
        return () => { alive = false; };
    }, [project.id]);

    const baseUrl = target === 'mock' ? mockUrl : target === 'custom' ? customUrl.trim() : project.base_url;
    const cases = scope === 'filtered' ? filteredCases : testCases;

    const result = useMemo(
        () => exportTests(format, cases, { ...project, base_url: baseUrl || project.base_url }),
        [format, cases, project, baseUrl],
    );

    async function copy() {
        try { await navigator.clipboard.writeText(result.content); } catch { /* blocked */ }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    const label = { fontSize: 'var(--fs-sm)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" role="dialog" aria-label="Export tests" style={{ width: 760, maxWidth: 'calc(100vw - 32px)' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
                    <div className="modal-title" style={{ marginBottom: 0, flex: 1 }}>Export tests</div>
                    <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={14} /></button>
                </div>

                <span style={label}>Format</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
                    {TEST_FORMATS.map(f => (
                        <button key={f.id} onClick={() => setFormat(f.id)}
                            className={`btn ${format === f.id ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '10px 12px', gap: 2 }}>
                            <span style={{ fontWeight: 600 }}>{f.label}</span>
                            <span style={{ fontSize: 'var(--fs-xs)', opacity: 0.8 }}>{f.lang} · {f.file}</span>
                        </button>
                    ))}
                </div>

                <div className="grid-2" style={{ gap: 12, marginBottom: 14 }}>
                    <div>
                        <span style={label}>Tests</span>
                        <select className="input" value={scope} onChange={e => setScope(e.target.value)}>
                            <option value="all">All tests ({testCases.length})</option>
                            {filteredCases && filteredCases.length !== testCases.length && (
                                <option value="filtered">{filterLabel} only ({filteredCases.length})</option>
                            )}
                        </select>
                    </div>
                    <div>
                        <span style={label}>Default BASE_URL in the file</span>
                        <select className="input" value={target} onChange={e => setTarget(e.target.value)}>
                            <option value="project">Project: {project.base_url}</option>
                            {mockUrl && <option value="mock">HitAPI mock server</option>}
                            <option value="custom">Custom URL…</option>
                        </select>
                        {target === 'custom' && (
                            <input className="input" style={{ marginTop: 6 }} placeholder="https://staging.example.com"
                                value={customUrl} onChange={e => setCustomUrl(e.target.value)} autoFocus />
                        )}
                    </div>
                </div>

                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                    {result.count} tests. Tokens are never written into the file: set <code>API_TOKEN</code> when you run it, and <code>BASE_URL</code> to test another environment.
                </div>
                <pre className="code-block" style={{ maxHeight: 300, overflow: 'auto', whiteSpace: 'pre', margin: '0 0 14px' }}>{result.content}</pre>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={copy}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}</button>
                    <button className="btn btn-primary" onClick={() => downloadText(result.filename, result.content)} disabled={!result.count}>
                        <Download size={13} /> Download {result.filename}
                    </button>
                </div>
            </div>
        </div>
    );
}
