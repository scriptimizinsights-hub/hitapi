import { useState } from 'react';
import { Zap } from 'lucide-react';
import { useStore } from '../../store/index.js';



export function GenerateModal({ projectId, endpoints, onClose, onGenerate }) {
    const [mode, setMode] = useState('selected'); // selected | method | tag | all
    const [method, setMethod] = useState('POST');
    const [tag, setTag] = useState('');
    const [limit, setLimit] = useState(5);
    const [loading, setLoading] = useState(false);
    const { generateTests, addToast } = useStore();

    // Collect all unique tags
    const allTags = [...new Set(endpoints.flatMap(e => {
        try { return JSON.parse(e.tags || '[]'); } catch { return []; }
    }))];

    const selectedIds = onGenerate.selectedIds || [];

    // Preview how many endpoints will be affected
    let preview = 0;
    if (mode === 'selected') preview = selectedIds.length;
    else if (mode === 'method') preview = endpoints.filter(e => e.method === method).length;
    else if (mode === 'tag') preview = endpoints.filter(e => { try { return JSON.parse(e.tags || '[]').includes(tag); } catch { return false; } }).length;
    else preview = endpoints.length;

    async function handleGenerate() {
        setLoading(true);
        try {
            let opts = { limit };
            if (mode === 'selected' && selectedIds.length) opts.endpoint_ids = selectedIds;
            else if (mode === 'method') opts.method = method;
            else if (mode === 'tag') opts.tag = tag;
            // else: all (no filter)

            const result = await generateTests(projectId, opts);
            addToast(`Generated ${result?.total || 0} test cases`, 'success');
            onClose();
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    const modeBtn = (m, label) => (
        <button onClick={() => setMode(m)} style={{
            flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 12, cursor: 'pointer',
            background: mode === m ? 'var(--accent-dim)' : 'var(--bg-input)',
            color: mode === m ? 'var(--accent)' : 'var(--text-secondary)',
            border: mode === m ? '1px solid rgba(130,100,255,0.3)' : '1px solid var(--border)',
            fontWeight: mode === m ? 600 : 400
        }}>{label}</button>
    );

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
                <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Zap size={18} color="var(--accent)" /> Generate test cases
                </div>

                {/* Mode selector */}
                <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Generate for</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {modeBtn('selected', `Selected (${selectedIds.length})`)}
                        {modeBtn('method', 'By method')}
                        {modeBtn('tag', 'By tag')}
                        {modeBtn('all', 'All')}
                    </div>
                </div>

                {/* Mode-specific options */}
                {mode === 'selected' && selectedIds.length === 0 && (
                    <div style={{ padding: '10px 12px', background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', borderRadius: 6, fontSize: 12, color: 'var(--amber)', marginBottom: 14 }}>
                        ⚠ No endpoints selected. Check boxes in the table first, or choose a different mode.
                    </div>
                )}

                {mode === 'method' && (
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>HTTP Method</label>
                        <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
                            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
                                <option key={m} value={m}>{m} ({endpoints.filter(e => e.method === m).length} endpoints)</option>
                            ))}
                        </select>
                    </div>
                )}

                {mode === 'tag' && (
                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Tag / Group</label>
                        <select className="input" value={tag} onChange={e => setTag(e.target.value)}>
                            <option value="">Select a tag…</option>
                            {allTags.map(t => (
                                <option key={t} value={t}>{t} ({endpoints.filter(e => { try { return JSON.parse(e.tags || '[]').includes(t); } catch { return false; } }).length} endpoints)</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Limit */}
                <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                        Max endpoints to process at once
                        <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 6 }}>(AI has per-request limits)</span>
                    </label>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {[3, 5, 10, 20].map(n => (
                            <button key={n} onClick={() => setLimit(n)} style={{
                                flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                                background: limit === n ? 'var(--accent-dim)' : 'var(--bg-input)',
                                color: limit === n ? 'var(--accent)' : 'var(--text-secondary)',
                                border: limit === n ? '1px solid rgba(130,100,255,0.3)' : '1px solid var(--border)',
                            }}>{n}</button>
                        ))}
                    </div>
                </div>

                {/* Preview */}
                <div style={{ padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 8, marginBottom: 20, fontSize: 12, color: 'var(--text-secondary)' }}>
                    Will generate tests for <strong style={{ color: 'var(--text-primary)' }}>{Math.min(preview, limit)} endpoint{Math.min(preview, limit) !== 1 ? 's' : ''}</strong>
                    {preview > limit && <span style={{ color: 'var(--amber)' }}> ({preview - limit} will be skipped due to limit)</span>}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    <button
                        className="btn btn-primary"
                        onClick={handleGenerate}
                        disabled={loading || (mode === 'selected' && !selectedIds.length) || (mode === 'tag' && !tag)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        {loading
                            ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Generating…</>
                            : <><Zap size={14} /> Generate</>}
                    </button>
                </div>
            </div>
        </div>
    );
}