import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Globe, Search, Upload, Zap, ChevronRight, CheckSquare, Square } from 'lucide-react';
import { useStore } from '../../store/index.js';

function EndpointRow({ endpoint, selected, onSelect, onCheck, checked }) {
  const method = endpoint.method;
  const paramCount = (() => { try { return JSON.parse(endpoint.parameters || '[]').length; } catch { return 0; } })();
  const tags = (() => { try { return JSON.parse(endpoint.tags || '[]'); } catch { return []; } })();

  return (
    <tr onClick={() => onSelect(endpoint)} style={{ cursor: 'pointer', background: selected ? 'rgba(130,100,255,0.05)' : 'transparent' }}>
      <td onClick={e => { e.stopPropagation(); onCheck(endpoint.id); }} style={{ width: 36, cursor: 'pointer' }}>
        {checked
          ? <CheckSquare size={15} color="var(--accent)" />
          : <Square size={15} color="var(--text-tertiary)" />}
      </td>
      <td><span className={`method-badge method-${method}`}>{method}</span></td>
      <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{endpoint.path}</span></td>
      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{endpoint.summary || '—'}</td>
      <td>{tags.map(tag => <span key={tag} className="badge badge-gray" style={{ marginRight: 4, fontSize: 10 }}>{tag}</span>)}</td>
      <td style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{paramCount} params</td>
      <td><ChevronRight size={14} color="var(--text-tertiary)" /></td>
    </tr>
  );
}

function ImportModal({ projectId, onClose }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const { importSwagger } = useStore();
  async function handleImport() {
    if (!url.trim()) return;
    setLoading(true);
    try { await importSwagger(projectId, { swagger_url: url }); onClose(); }
    catch (err) { alert(err.message); }
    finally { setLoading(false); }
  }
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Upload size={18} color="var(--accent)" /> Import Swagger / OpenAPI
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Swagger URL</label>
          <input className="input" placeholder="https://api.example.com/swagger.json" value={url}
            onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleImport()} autoFocus />
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>Supports OpenAPI 3.0, 3.1, Swagger 2.0 · JSON</div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleImport} disabled={loading || !url.trim()}>
            {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Importing…</> : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GenerateModal({ projectId, endpoints, onClose, onGenerate }) {
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

export function EndpointsPage() {
  const { projectId } = useParams();
  const { endpoints, endpointStats, loadEndpoints } = useStore();
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [showImport, setShowImport] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);

  useEffect(() => { loadEndpoints(projectId); }, [projectId]);

  const filtered = endpoints.filter(ep => {
    const matchSearch = !search || ep.path.toLowerCase().includes(search.toLowerCase()) || (ep.summary || '').toLowerCase().includes(search.toLowerCase());
    const matchMethod = methodFilter === 'ALL' || ep.method === methodFilter;
    return matchSearch && matchMethod;
  });

  function toggleCheck(id) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (checkedIds.size === filtered.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(filtered.map(e => e.id)));
    }
  }

  const allChecked = filtered.length > 0 && checkedIds.size === filtered.length;

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Endpoints</h1>
          {endpointStats && (
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              {[
                { label: 'Total', val: endpointStats.total, color: 'var(--text-secondary)' },
                { label: 'GET', val: endpointStats.get_count, color: 'var(--green)' },
                { label: 'POST', val: endpointStats.post_count, color: 'var(--blue)' },
                { label: 'PUT', val: endpointStats.put_count, color: 'var(--amber)' },
                { label: 'DELETE', val: endpointStats.delete_count, color: 'var(--red)' },
              ].filter(x => x.val > 0).map(x => (
                <span key={x.label} style={{ fontSize: 12, color: x.color }}>
                  <span style={{ fontWeight: 600 }}>{x.val}</span> {x.label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowImport(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Upload size={14} /> Import Swagger
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowGenerate(true)}
            disabled={!endpoints.length}
            style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}
          >
            <Zap size={14} />
            Generate tests
            {checkedIds.size > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6, width: 18, height: 18,
                borderRadius: '50%', background: 'var(--amber)', color: '#000',
                fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>{checkedIds.size}</span>
            )}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Search endpoints..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
          <button key={m} onClick={() => setMethodFilter(m)} style={{
            padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
            fontFamily: m === 'ALL' ? 'inherit' : 'JetBrains Mono, monospace',
            cursor: 'pointer', transition: 'all 0.12s',
            background: methodFilter === m ? 'var(--accent-dim)' : 'var(--bg-card)',
            color: methodFilter === m ? 'var(--accent)' : 'var(--text-secondary)',
            border: methodFilter === m ? '1px solid rgba(130,100,255,0.3)' : '1px solid var(--border)'
          }}>{m}</button>
        ))}
        {checkedIds.size > 0 && (
          <span style={{ fontSize: 12, color: 'var(--accent)', alignSelf: 'center', marginLeft: 4 }}>
            {checkedIds.size} selected
          </span>
        )}
      </div>

      {endpoints.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Globe size={40} />
            <h3>No endpoints yet</h3>
            <p>Import a Swagger / OpenAPI spec to discover endpoints automatically</p>
            <button className="btn btn-primary" onClick={() => setShowImport(true)} style={{ marginTop: 8 }}>
              <Upload size={14} style={{ marginRight: 6 }} /> Import Swagger
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <button onClick={toggleAll} style={{ background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    {allChecked
                      ? <CheckSquare size={15} color="var(--accent)" />
                      : <Square size={15} color="var(--text-tertiary)" />}
                  </button>
                </th>
                <th style={{ width: 80 }}>Method</th>
                <th>Path</th>
                <th>Summary</th>
                <th>Tags</th>
                <th>Params</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map(ep => (
                <EndpointRow
                  key={ep.id}
                  endpoint={ep}
                  selected={selected?.id === ep.id}
                  checked={checkedIds.has(ep.id)}
                  onSelect={ep => setSelected(selected?.id === ep.id ? null : ep)}
                  onCheck={toggleCheck}
                />
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="empty-state" style={{ padding: '30px' }}><p>No endpoints match your filter</p></div>
          )}
        </div>
      )}

      {showImport && <ImportModal projectId={projectId} onClose={() => setShowImport(false)} />}
      {showGenerate && (
        <GenerateModal
          projectId={projectId}
          endpoints={endpoints}
          onClose={() => setShowGenerate(false)}
          onGenerate={{ selectedIds: [...checkedIds] }}
        />
      )}
    </div>
  );
}