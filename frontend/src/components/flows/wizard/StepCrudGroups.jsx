/**
 * StepCrudGroups — Wizard Step 7
 * Single Responsibility: display detected CRUD groups, allow user to:
 *   - Include/exclude groups
 *   - Specify id extraction path from POST response
 *   - See how context vars will be chained
 *
 * Open/Closed: new CRUD strategies can be added to useEndpointGroups
 * without modifying this component.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, GitBranch, ArrowRight, Lock, Globe } from 'lucide-react';
import { COMMON_ID_PATHS } from '../hooks/useEndpointGroups.js';

const METHOD_META = {
    GET: { label: 'Read / List', color: 'var(--green)' },
    POST: { label: 'Create', color: 'var(--blue)' },
    PUT: { label: 'Update', color: 'var(--amber)' },
    PATCH: { label: 'Partial update', color: 'var(--amber)' },
    DELETE: { label: 'Delete', color: 'var(--red)' },
};

function EndpointRow({ ep, isCreator, needsId, contextVar, idPath, groups, currentBasePath, onExclude, onMove, onReset, isOverridden }) {
    const [showMove, setShowMove] = useState(false);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <span className={`method-badge method-${ep.method}`} style={{ fontSize: 9, flexShrink: 0 }}>{ep.method}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>{ep.path}</span>

            {ep.requiresAuth
                ? <Lock size={10} color="var(--red)" style={{ flexShrink: 0 }} />
                : <Globe size={10} color="var(--green)" style={{ flexShrink: 0 }} />}

            {/* What this step does */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {isCreator && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(130,100,255,0.12)', color: 'var(--accent)', border: '1px solid rgba(130,100,255,0.2)' }}>extracts {contextVar}</span>}
                {needsId && !isCreator && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: 'var(--text-tertiary)', border: '1px solid var(--border)', fontFamily: 'JetBrains Mono, monospace' }}>uses {contextVar}</span>}
                {!isCreator && !needsId && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>list</span>}
                {isOverridden && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--amber-bg)', color: 'var(--amber)' }}>moved</span>}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 4, flexShrink: 0, position: 'relative' }}>
                {isOverridden && (
                    <button onClick={onReset} title="Reset to original group"
                        style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}>
                        ↩ Reset
                    </button>
                )}
                {/* Move dropdown */}
                <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowMove(s => !s)}
                        style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,181,71,0.08)', color: 'var(--amber)', border: '1px solid rgba(255,181,71,0.2)' }}>
                        → Move
                    </button>
                    {showMove && (
                        <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 100, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 7, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 200, marginTop: 3 }}>
                            <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border)' }}>Move to group</div>
                            {groups.filter(g => g.basePath !== currentBasePath).map(g => (
                                <div key={g.basePath} onClick={() => { onMove(ep.id, g.basePath); setShowMove(false); }}
                                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                                    {g.basePath}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {/* Exclude */}
                <button onClick={() => onExclude(ep.id)} title="Remove from all groups"
                    style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,92,92,0.08)', color: 'var(--red)', border: '1px solid rgba(255,92,92,0.2)' }}>
                    ✕
                </button>
            </div>
        </div>
    );
}

function CrudGroupCard({ group, config, allGroups, onToggle, onSetIdPath, onExclude, onMove, onReset, endpointOverrides }) {
    const [expanded, setExpanded] = useState(true);
    const [customIdPath, setCustomIdPath] = useState('');
    const [useCustom, setUseCustom] = useState(false);

    const included = config.included;
    const idPath = config.idPath || 'id';
    const contextVar = group.contextVar;
    const authCount = group.endpoints.filter(e => e.requiresAuth).length;

    function handleIdPathChange(val) {
        if (val === 'custom') { setUseCustom(true); }
        else { setUseCustom(false); onSetIdPath(group.basePath, val); }
    }

    return (
        <div style={{
            border: `1px solid ${included ? 'rgba(130,100,255,0.25)' : 'var(--border)'}`,
            borderRadius: 10, overflow: 'visible', marginBottom: 10,
            opacity: included ? 1 : 0.5, transition: 'all 0.15s'
        }}>
            {/* Group header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: included ? 'rgba(130,100,255,0.06)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', borderRadius: expanded ? '10px 10px 0 0' : 10 }}
                onClick={() => setExpanded(e => !e)}>
                <GitBranch size={14} color={included ? 'var(--accent)' : 'var(--text-tertiary)'} />
                <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: included ? 'var(--accent)' : 'var(--text-secondary)', flex: 1 }}>
                    {group.basePath}
                </code>
                <span style={{ fontSize: 10, color: authCount > 0 ? 'var(--red)' : 'var(--green)', flexShrink: 0 }}>
                    {authCount > 0 ? `🔐 ${authCount} auth` : '🌐 public'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {group.endpoints.length} endpoints
                </span>
                <button onClick={e => { e.stopPropagation(); onToggle(group.basePath); }} style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontWeight: 600, flexShrink: 0,
                    background: included ? 'var(--accent-dim)' : 'rgba(255,255,255,0.05)',
                    color: included ? 'var(--accent)' : 'var(--text-tertiary)',
                    border: `1px solid ${included ? 'rgba(130,100,255,0.3)' : 'var(--border)'}`,
                }}>
                    {included ? '✓ Included' : '+ Include'}
                </button>
                {expanded ? <ChevronDown size={13} color="var(--text-tertiary)" /> : <ChevronRight size={13} color="var(--text-tertiary)" />}
            </div>

            {expanded && included && (
                <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {/* Context var chain */}
                    {group.isCrud && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '8px 10px', background: 'var(--accent-dim)', borderRadius: 7, border: '1px solid rgba(130,100,255,0.15)', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>Flow:</span>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>POST creates →</span>
                            <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--accent)', background: 'rgba(130,100,255,0.15)', padding: '1px 6px', borderRadius: 4 }}>
                                {contextVar}
                            </code>
                            <ArrowRight size={11} color="var(--text-tertiary)" />
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>PUT/DELETE use it</span>
                        </div>
                    )}

                    {/* Id path picker */}
                    {group.isCrud && (
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                Where is the <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--accent)' }}>id</code> in POST response?
                                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6 }}>saved as {contextVar}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                                {COMMON_ID_PATHS.map(p => (
                                    <button key={p} onClick={() => handleIdPathChange(p)} style={{
                                        fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                                        fontFamily: 'JetBrains Mono, monospace',
                                        background: idPath === p && !useCustom ? 'var(--accent-dim)' : 'rgba(255,255,255,0.04)',
                                        color: idPath === p && !useCustom ? 'var(--accent)' : 'var(--text-tertiary)',
                                        border: `1px solid ${idPath === p && !useCustom ? 'rgba(130,100,255,0.3)' : 'var(--border)'}`,
                                    }}>{p}</button>
                                ))}
                                <button onClick={() => handleIdPathChange('custom')} style={{
                                    fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                                    background: useCustom ? 'var(--amber-bg)' : 'rgba(255,255,255,0.04)',
                                    color: useCustom ? 'var(--amber)' : 'var(--text-tertiary)',
                                    border: `1px solid ${useCustom ? 'rgba(255,181,71,0.3)' : 'var(--border)'}`,
                                }}>custom…</button>
                            </div>
                            {useCustom && (
                                <input autoFocus value={customIdPath}
                                    onChange={e => { setCustomIdPath(e.target.value); onSetIdPath(group.basePath, e.target.value); }}
                                    placeholder="e.g. result.data.templateId"
                                    style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, padding: '6px 10px', borderRadius: 6, outline: 'none', background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                            )}
                            <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-tertiary)' }}>
                                After POST: <code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)' }}>response.{idPath}</code> → <code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)' }}>{contextVar}</code>
                            </div>
                        </div>
                    )}

                    {/* Endpoint rows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {group.endpoints.map(ep => {
                            const isCreator = ep.method === 'POST' && !ep.path.includes('{');
                            const needsId = ep.path.includes('{');
                            const isOverridden = ep.id in endpointOverrides;
                            return (
                                <EndpointRow
                                    key={ep.id}
                                    ep={ep}
                                    isCreator={isCreator}
                                    needsId={needsId}
                                    contextVar={contextVar}
                                    idPath={idPath}
                                    groups={allGroups}
                                    currentBasePath={group.basePath}
                                    onExclude={onExclude}
                                    onMove={onMove}
                                    onReset={onReset}
                                    isOverridden={isOverridden}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export function StepCrudGroups({ groups, getGroupConfig, toggleGroup, setIdPath, excludeEndpoint, moveEndpoint, resetEndpoint, endpointOverrides, excludedEndpoints }) {
    const includedCount = groups.filter(g => getGroupConfig(g.basePath).included).length;
    const crudCount = groups.filter(g => g.isCrud).length;

    if (!groups.length) {
        return (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: 24 }}>
                No endpoint groups detected. Make sure you've imported a Swagger spec.
            </div>
        );
    }

    return (
        <div>
            {/* Summary */}
            <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span>🔍 <strong style={{ color: 'var(--accent)' }}>{crudCount}</strong> CRUD groups detected</span>
                <span>✓ <strong style={{ color: 'var(--green)' }}>{includedCount}</strong> included</span>
                {excludedEndpoints?.length > 0 && (
                    <span style={{ color: 'var(--amber)' }}>⊘ {excludedEndpoints.length} excluded</span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                    → Move · ✕ Exclude endpoint from group
                </span>
            </div>

            {/* Group cards */}
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
                {groups.map(group => (
                    <CrudGroupCard
                        key={group.basePath}
                        group={group}
                        config={getGroupConfig(group.basePath)}
                        allGroups={groups}
                        onToggle={toggleGroup}
                        onSetIdPath={setIdPath}
                        onExclude={excludeEndpoint}
                        onMove={moveEndpoint}
                        onReset={resetEndpoint}
                        endpointOverrides={endpointOverrides}
                    />
                ))}
            </div>

            {/* Excluded endpoints */}
            {excludedEndpoints?.length > 0 && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,181,71,0.05)', border: '1px solid rgba(255,181,71,0.15)', borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--amber)', marginBottom: 8 }}>
                        ⊘ Excluded endpoints (won't be added to any group)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {excludedEndpoints.map(ep => (
                            <div key={ep.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 5, background: 'rgba(255,255,255,0.02)' }}>
                                <span className={`method-badge method-${ep.method}`} style={{ fontSize: 9 }}>{ep.method}</span>
                                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-tertiary)', flex: 1 }}>{ep.path}</span>
                                <button onClick={() => resetEndpoint(ep.id)} style={{
                                    fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                                    background: 'var(--amber-bg)', color: 'var(--amber)', border: '1px solid rgba(255,181,71,0.3)'
                                }}>↩ Restore</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}