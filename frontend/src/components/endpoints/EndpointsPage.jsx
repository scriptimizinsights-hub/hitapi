import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Globe, Search, Upload, Zap, ChevronRight, CheckSquare, Square, Eye,
  PenLine
} from 'lucide-react';
import { useStore } from '../../store/index.js';
import { ImportModal } from './ImportModal.jsx';
import { GenerateModal } from './GenerateModal.jsx';
import { EndpointRow } from './EndpointRow.jsx';
import { AddEndpointModal } from './AddEndpointModal.jsx';

export function EndpointsPage() {
  const { projectId } = useParams();
  const {
    endpoints, endpointStats, loadEndpoints, deleteEndpoint
  } = useStore();
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [showImport, setShowImport] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showAddEndpoint, setShowAddEndpoint] = useState(false);
  useEffect(() => { loadEndpoints(projectId); }, [projectId]);

  // Refresh when user switches back to this tab (e.g. after adding via extension)
  useEffect(() => {
    const onFocus = () => loadEndpoints(projectId);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [projectId]);

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

  async function handleView(endpoint) {
    setSelected(endpoint);
    console.log('View endpoint:', endpoint);
  }

  async function handleDelete(endpoint) {
    const confirmed = window.confirm(
      `Delete ${endpoint.method} ${endpoint.path}?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      await deleteEndpoint(projectId, endpoint.id);

      setCheckedIds(prev => {
        const next = new Set(prev);
        next.delete(endpoint.id);
        return next;
      });

      if (selected?.id === endpoint.id) {
        setSelected(null);
      }

      await loadEndpoints(projectId);
    } catch (err) {
      alert(err.message || 'Failed to delete endpoint');
    }
  }

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
          <button className="btn btn-ghost" onClick={() => setShowAddEndpoint(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PenLine size={14} /> Add endpoint
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
                <th style={{ width: 90, textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ep => (
                <EndpointRow
                  key={ep.id}
                  endpoint={ep}
                  selected={selected?.id === ep.id}
                  checked={checkedIds.has(ep.id)}
                  onSelect={ep =>
                    setSelected(
                      selected?.id === ep.id ? null : ep
                    )
                  }
                  onCheck={toggleCheck}
                  onView={handleView}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
          {selected && (
            <div
              className="modal-backdrop"
              onClick={() => setSelected(null)}
            >
              <div
                className="modal"
                onClick={e => e.stopPropagation()}
                style={{
                  width: 760,
                  maxWidth: '92vw',
                  maxHeight: '88vh',
                  padding: 0,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Header */}
                <div
                  style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'var(--bg-card)'
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: 'var(--text-primary)'
                      }}
                    >
                      Endpoint Details
                    </div>

                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 11,
                        color: 'var(--text-tertiary)'
                      }}
                    >
                      API endpoint configuration
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    title="Close"
                    style={{
                      width: 32,
                      height: 32,
                      border: '1px solid var(--border)',
                      borderRadius: 7,
                      background: 'var(--bg-input)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: 18,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    ×
                  </button>
                </div>

                {/* Content */}
                <div
                  style={{
                    padding: 24,
                    overflowY: 'auto'
                  }}
                >
                  {/* Method + Path */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      marginBottom: 24
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '0.06em',
                          color: 'var(--text-tertiary)',
                          marginBottom: 7
                        }}
                      >
                        METHOD
                      </div>

                      <span className={`method-badge method-${selected.method}`}>
                        {selected.method}
                      </span>
                    </div>

                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '0.06em',
                          color: 'var(--text-tertiary)',
                          marginBottom: 7
                        }}
                      >
                        ENDPOINT
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '9px 12px',
                          borderRadius: 7,
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border)',
                          fontFamily: 'JetBrains Mono, monospace',
                          fontSize: 12,
                          color: 'var(--text-primary)',
                          wordBreak: 'break-all'
                        }}
                      >
                        {selected.path}
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div style={{ marginBottom: 22 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        color: 'var(--text-tertiary)',
                        marginBottom: 8
                      }}
                    >
                      SUMMARY
                    </div>

                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: 7,
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: 'var(--text-primary)'
                      }}
                    >
                      {selected.summary || 'No summary available'}
                    </div>
                  </div>

                  {/* Description */}
                  <div style={{ marginBottom: 22 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        color: 'var(--text-tertiary)',
                        marginBottom: 8
                      }}
                    >
                      DESCRIPTION
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: selected.description
                          ? 'var(--text-secondary)'
                          : 'var(--text-tertiary)'
                      }}
                    >
                      {selected.description || 'No description available'}
                    </div>
                  </div>

                  {/* Parameters */}
                  <div style={{ marginBottom: 22 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '0.06em',
                          color: 'var(--text-tertiary)'
                        }}
                      >
                        PARAMETERS
                      </div>

                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--text-tertiary)'
                        }}
                      >
                        Request parameters
                      </span>
                    </div>

                    <pre
                      style={{
                        margin: 0,
                        padding: 14,
                        minHeight: 45,
                        maxHeight: 180,
                        overflow: 'auto',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        borderRadius: 7,
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 11,
                        lineHeight: 1.6,
                        color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}
                    >
                      {typeof selected.parameters === 'string'
                        ? selected.parameters || '[]'
                        : JSON.stringify(selected.parameters || [], null, 2)}
                    </pre>
                  </div>

                  {/* Request Body */}
                  <div style={{ marginBottom: 22 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        color: 'var(--text-tertiary)',
                        marginBottom: 8
                      }}
                    >
                      REQUEST BODY
                    </div>

                    <pre
                      style={{
                        margin: 0,
                        padding: 14,
                        minHeight: 45,
                        maxHeight: 220,
                        overflow: 'auto',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        borderRadius: 7,
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 11,
                        lineHeight: 1.6,
                        color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}
                    >
                      {typeof selected.request_body === 'string'
                        ? selected.request_body || '{}'
                        : JSON.stringify(selected.request_body || {}, null, 2)}
                    </pre>
                  </div>

                  {/* Responses */}
                  <div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        color: 'var(--text-tertiary)',
                        marginBottom: 8
                      }}
                    >
                      RESPONSES
                    </div>

                    <pre
                      style={{
                        margin: 0,
                        padding: 14,
                        maxHeight: 260,
                        overflow: 'auto',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        borderRadius: 7,
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 11,
                        lineHeight: 1.6,
                        color: 'var(--text-secondary)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}
                    >
                      {typeof selected.responses === 'string'
                        ? selected.responses || '{}'
                        : JSON.stringify(selected.responses || {}, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Footer */}
                <div
                  style={{
                    padding: '14px 24px',
                    borderTop: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    background: 'var(--bg-card)'
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="empty-state" style={{ padding: '30px' }}><p>No endpoints match your filter</p></div>
          )}
        </div>
      )}

      {showImport && <ImportModal projectId={projectId} onClose={() => setShowImport(false)} />}
      {showAddEndpoint && (
        <AddEndpointModal
          projectId={projectId}
          onClose={() => setShowAddEndpoint(false)}
          onAdded={async () => {
            setShowAddEndpoint(false);
            await loadEndpoints(projectId);
          }}
        />
      )}
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