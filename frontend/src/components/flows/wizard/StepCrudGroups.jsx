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

function EndpointRow({ ep, isCreator, needsId, contextVar, idPath }) {
    const meta = METHOD_META[ep.method] || { label: ep.method, color: 'var(--text-tertiary)' };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <span className={`method-badge method-${ep.method}`} style={{ fontSize: 9, flexShrink: 0 }}>{ep.method}</span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--text-secondary)', flex: 1 }}>{ep.path}</span>

            {/* Auth indicator */}
            {ep.requiresAuth
                ? <Lock size={10} color="var(--red)" style={{ flexShrink: 0 }} />
                : <Globe size={10} color="var(--green)" style={{ flexShrink: 0 }} />}

            {/* What this step does */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {isCreator && (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(130,100,255,0.12)', color: 'var(--accent)', border: '1px solid rgba(130,100,255,0.2)' }}>
                        extracts {contextVar}
                    </span>
                )}
                {needsId && !isCreator && (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', color: 'var(--text-tertiary)', border: '1px solid var(--border)', fontFamily: 'JetBrains Mono, monospace' }}>
                        uses {contextVar}
                    </span>
                )}
                {!isCreator && !needsId && (
                    <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>list</span>
                )}
            </div>
        </div>
    );
}

function CrudGroupCard({ group, config, onToggle, onSetIdPath }) {
    const [expanded, setExpanded] = useState(true);
    const [customIdPath, setCustomIdPath] = useState('');
    const [useCustom, setUseCustom] = useState(false);

    const included = config.included;
    const idPath = config.idPath || 'id';
    const contextVar = group.contextVar;
    const authCount = group.endpoints.filter(e => e.requiresAuth).length;

    function handleIdPathChange(val) {
        if (val === 'custom') {
            setUseCustom(true);
        } else {
            setUseCustom(false);
            onSetIdPath(group.basePath, val);
        }
    }

    return (
        <div style={{
            border: `1px solid ${included ? 'rgba(130,100,255,0.25)' : 'var(--border)'}`,
            borderRadius: 10, overflow: 'hidden', marginBottom: 10,
            opacity: included ? 1 : 0.5,
            transition: 'all 0.15s'
        }}>
            {/* Group header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: included ? 'rgba(130,100,255,0.06)' : 'rgba(255,255,255,0.02)', cursor: 'pointer' }}
                onClick={() => setExpanded(e => !e)}>
                <GitBranch size={14} color={included ? 'var(--accent)' : 'var(--text-tertiary)'} />
                <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: included ? 'var(--accent)' : 'var(--text-secondary)', flex: 1 }}>
                    {group.basePath}
                </code>

                {/* Auth summary */}
                <span style={{ fontSize: 10, color: authCount > 0 ? 'var(--red)' : 'var(--green)', flexShrink: 0 }}>
                    {authCount > 0 ? `🔐 ${authCount} auth` : '🌐 public'}
                </span>

                {/* Step count */}
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0 }}>
                    {group.endpoints.length} endpoints
                </span>

                {/* Include toggle */}
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

                    {/* Context var chain visualization */}
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

                    {/* Id extraction path — only shown for CRUD groups */}
                    {group.isCrud && (
                        <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                Where is the <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--accent)' }}>id</code> in the POST response?
                                <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 6 }}>
                                    Saved as {contextVar}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                {COMMON_ID_PATHS.map(p => (
                                    <button key={p} onClick={() => handleIdPathChange(p)} style={{
                                        fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                                        fontFamily: 'JetBrains Mono, monospace',
                                        background: idPath === p && !useCustom ? 'var(--accent-dim)' : 'rgba(255,255,255,0.04)',
                                        color: idPath === p && !useCustom ? 'var(--accent)' : 'var(--text-tertiary)',
                                        border: `1px solid ${idPath === p && !useCustom ? 'rgba(130,100,255,0.3)' : 'var(--border)'}`,
                                    }}>
                                        {p}
                                    </button>
                                ))}
                                <button onClick={() => handleIdPathChange('custom')} style={{
                                    fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                                    background: useCustom ? 'var(--amber-bg)' : 'rgba(255,255,255,0.04)',
                                    color: useCustom ? 'var(--amber)' : 'var(--text-tertiary)',
                                    border: `1px solid ${useCustom ? 'rgba(255,181,71,0.3)' : 'var(--border)'}`,
                                }}>
                                    custom…
                                </button>
                            </div>

                            {useCustom && (
                                <input
                                    autoFocus
                                    value={customIdPath}
                                    onChange={e => {
                                        setCustomIdPath(e.target.value);
                                        onSetIdPath(group.basePath, e.target.value);
                                    }}
                                    placeholder="e.g. result.data.templateId"
                                    style={{
                                        width: '100%', boxSizing: 'border-box', fontFamily: 'JetBrains Mono, monospace',
                                        fontSize: 11, padding: '6px 10px', borderRadius: 6, outline: 'none',
                                        background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)'
                                    }}
                                />
                            )}

                            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                                After POST succeeds: <code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)' }}>response.{idPath}</code> → saved as <code style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--accent)' }}>{contextVar}</code>
                            </div>
                        </div>
                    )}

                    {/* Endpoint rows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {group.endpoints.map(ep => {
                            const isCreator = ep.method === 'POST' && !ep.path.includes('{');
                            const needsId = ep.path.includes('{');
                            return (
                                <EndpointRow
                                    key={ep.id}
                                    ep={ep}
                                    isCreator={isCreator}
                                    needsId={needsId}
                                    contextVar={contextVar}
                                    idPath={idPath}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

export function StepCrudGroups({ groups, getGroupConfig, toggleGroup, setIdPath }) {
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
            {/* Summary banner */}
            <div style={{ padding: '10px 14px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
                <span>🔍 Found <strong style={{ color: 'var(--accent)' }}>{crudCount}</strong> CRUD groups</span>
                <span>✓ <strong style={{ color: 'var(--green)' }}>{includedCount}</strong> included</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                    Toggle groups to include/exclude · Select where POST response stores the id
                </span>
            </div>

            {/* Group cards */}
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
                {groups.map(group => (
                    <CrudGroupCard
                        key={group.basePath}
                        group={group}
                        config={getGroupConfig(group.basePath)}
                        onToggle={toggleGroup}
                        onSetIdPath={setIdPath}
                    />
                ))}
            </div>
        </div>
    );
}