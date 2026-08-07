import { NavLink, useParams, useNavigate } from 'react-router-dom';
import {
  Zap, LayoutDashboard, Globe, TestTube, Play, Bug,
  BarChart3, Bell, Settings, ChevronDown, Plus, Loader2,
  HelpCircle, LogOut, User, Lock, GitBranch,
  AlertTriangle
} from 'lucide-react';
import { useStore } from '../../store/index.js';
import { useState } from 'react';

const NAV = [
  { to: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: 'endpoints', icon: Globe, label: 'Endpoints' },
  { to: 'tests', icon: TestTube, label: 'Test Cases' },
  { to: 'executions', icon: Play, label: 'Executions' },
  { to: 'bugs', icon: Bug, label: 'Bugs' },
  { to: 'reports', icon: BarChart3, label: 'Reports' },
  { to: 'monitors', icon: Bell, label: 'Monitors' },
  { to: 'flows', icon: GitBranch, label: 'Flow Suites', dividerBefore: true },
  { to: 'settings', icon: Settings, label: 'Settings' },
  { to: 'errors', icon: AlertTriangle, label: 'Platform Errors' },
  // { to: 'login-flow', icon: Lock, label: 'Login flow' },
];

export function Sidebar({ onNewProject }) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { projects, currentProject, setCurrentProject, projectLoading, user, logout } = useStore();
  const [projectsOpen, setProjectsOpen] = useState(true);

  function handleLogout() {
    logout();
  }

  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, bottom: 0,
      width: 'var(--sidebar-w)',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto', zIndex: 50
    }}>
      {/* Logo */}
      <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #8264ff, #5ca8ff)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>
            <Zap size={14} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>HitAPI</div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', letterSpacing: '0.03em' }}>hitapi.dev · AI API Testing</div>
          </div>
        </div>
      </div>

      {/* Projects section */}
      <div style={{ padding: '10px 10px 0' }}>
        <button
          onClick={() => setProjectsOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 8px', borderRadius: 6, background: 'transparent',
            color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer'
          }}
        >
          Projects
          <ChevronDown size={12} style={{ transform: projectsOpen ? 'rotate(0)' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
        </button>

        {projectsOpen && (
          <div style={{ marginTop: 4 }}>
            {projectLoading ? (
              <div style={{ padding: '8px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={12} style={{ animation: 'spin 0.7s linear infinite' }} />
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading...</span>
              </div>
            ) : projects.map(p => (
              <button
                key={p.id}
                onClick={() => { setCurrentProject(p); navigate(`/projects/${p.id}/dashboard`); }}
                style={{
                  width: '100%', textAlign: 'left', padding: '7px 8px',
                  borderRadius: 6,
                  background: currentProject?.id === p.id ? 'var(--accent-dim)' : 'transparent',
                  color: currentProject?.id === p.id ? '#ff5c5c' : 'var(--text-secondary)',
                  border: currentProject?.id === p.id ? '1px solid rgba(255,92,92,0.2)' : '1px solid transparent',
                  fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  marginBottom: 2, transition: 'all 0.12s'
                }}
              >
                <div style={{
                  width: 6, height: 6, borderRadius: 2, flexShrink: 0,
                  background: currentProject?.id === p.id ? '#ff5c5c' : 'var(--text-tertiary)'
                }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                {p.endpoint_count > 0 && (
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{p.endpoint_count}</span>
                )}
              </button>
            ))}

            <button
              onClick={onNewProject}
              style={{
                width: '100%', padding: '7px 8px', borderRadius: 6,
                background: 'transparent', color: 'var(--text-tertiary)',
                fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                border: '1px dashed var(--border)', marginTop: 4, transition: 'all 0.12s'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#ff5c5c'; e.currentTarget.style.color = '#ff5c5c'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}
            >
              <Plus size={12} /> New project
            </button>
          </div>
        )}
      </div>

      {/* Nav links */}
      {currentProject && (
        <nav style={{ padding: '12px 10px', flex: 1, marginTop: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', padding: '0 8px 6px', letterSpacing: '0.06em', fontWeight: 600, textTransform: 'uppercase' }}>
            {currentProject.name}
          </div>
          {NAV.map(({ to, icon: Icon, label, dividerBefore }) => (
            <div key={to}>
              {dividerBefore && <div style={{ height: 1, background: 'var(--border)', margin: '8px 8px' }} />}
              <NavLink
                to={`/projects/${currentProject.id}/${to}`}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 7,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--bg-card)' : 'transparent',
                  fontSize: 13, fontWeight: isActive ? 500 : 400,
                  textDecoration: 'none', marginBottom: 2,
                  borderLeft: isActive ? '2px solid #ff5c5c' : '2px solid transparent',
                  transition: 'all 0.12s'
                })}
              >
                <Icon size={15} />
                {label}
              </NavLink>
            </div>
          ))}
        </nav>
      )}

      {/* Footer */}
      <div style={{ padding: '12px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>

        {/* Sponsored by */}
        <div style={{
          padding: '8px 10px', borderRadius: 8, marginBottom: 10,
          background: 'var(--accent-dim)', border: '1px solid rgba(130,100,255,0.2)'
        }}>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
            Sponsored by
          </div>
          <a
            href="https://scriptimiz.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none', display: 'block' }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', lineHeight: 1.2 }}>
              Scriptimiz Insight LLP
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
              Software · Training · Consulting
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1 }}>
              Mumbai, India · scriptimiz.com
            </div>
          </a>
        </div>



        {/* CF services */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '0 2px' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Cloudflare · D1 · KV · R2 · AI</span>
        </div>

        {/* Links */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <button onClick={() => navigate('/privacy')} style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ff5c5c'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>Privacy</button>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>·</span>
          <button onClick={() => navigate('/support')} style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'none', cursor: 'pointer', padding: 0, transition: 'color 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#ff5c5c'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>Support</button>
        </div>

        {/* User card — shows logged in user with sign out */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
              {user.name?.[0]?.toUpperCase() || '?'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
            </div>
            <button onClick={logout} title="Sign out"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: '4px', borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>
              <LogOut size={14} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}