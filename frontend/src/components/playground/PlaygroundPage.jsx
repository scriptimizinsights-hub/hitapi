/**
 * /playground — HitAPI's free online API tester (public, no login).
 *
 * The tool is the HitAPI Web Workbench (components/workbench, web roadmap W1).
 * Below it: what it does, how to use it, the three ways to send, and an FAQ —
 * prerendered at build time for search engines (scripts/prerender.mjs).
 */

import { useNavigate, Link } from 'react-router-dom';
import { Home, ArrowRight, Globe2, Monitor, Puzzle, Check } from 'lucide-react';
import { useStore } from '../../store/index.js';
import { PublicFooter } from '../ui/PublicFooter.jsx';
import { LogoMark } from '../ui/Logo.jsx';
import { Workbench } from '../workbench/Workbench.jsx';
import { STORE_URL } from '../workbench/bridge.js';
import { API_TESTER_FAQS, API_TESTER_FEATURES } from '../../seo/apiTesterContent.js';

const STEPS = [
  ['Enter the URL', 'Pick the method and type the API URL, or paste a cURL command and the whole request fills in.'],
  ['Add what the API needs', 'Query params, headers, a JSON / form / file / GraphQL body and auth (Bearer, Basic, API key, OAuth 2.0).'],
  ['Choose where to send from', 'HitAPI cloud for public APIs, this browser or the HitAPI extension for localhost.'],
  ['Send and read the response', 'Status, time and size, JSON you can search and fold, headers, cookies and timing. Copy it as code when it works.'],
];

const MODES = [
  [Globe2, 'HitAPI cloud', 'Public APIs, with no CORS errors. Runs on HitAPI\'s servers.', 'Public URLs only · 15 s · 2 MB'],
  [Monitor, 'This browser', 'APIs on localhost or your network that allow CORS.', 'Browsers hide some headers and cookies'],
  [Puzzle, 'HitAPI extension', 'Anything: localhost, no CORS limits, Cookie and Origin headers.', 'Needs the free Chrome extension'],
];

export function PlaygroundPage() {
  const { user } = useStore();
  const navigate = useNavigate();
  const navBtn = { background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 'var(--fs-md)', cursor: 'pointer', padding: '6px 12px', borderRadius: 7, display: 'flex', alignItems: 'center', gap: 6 };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .pg-nav { padding: 12px 32px; }
        .pg-wrap { width: 100%; max-width: 1440px; margin: 0 auto; padding: 22px 32px 0; }
        .pg-h1 { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; margin: 0; line-height: 1.15; }
        .pg-lead { color: var(--text-secondary); font-size: var(--fs-md); margin: 8px 0 16px; max-width: 860px; line-height: 1.5; }
        .pg-sec { max-width: 1100px; margin: 0 auto; padding: 44px 32px 0; width: 100%; }
        .pg-sec h2 { font-size: 22px; margin: 0 0 14px; letter-spacing: -0.01em; }
        .pg-grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
        .pg-grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
        .pg-card { border: 1px solid var(--border); background: var(--bg-card); border-radius: 12px; padding: 16px; }
        .pg-card h3 { font-size: var(--fs-lg); margin: 0 0 6px; display: flex; align-items: center; gap: 8px; }
        .pg-card p { margin: 0; color: var(--text-secondary); font-size: var(--fs-sm); line-height: 1.5; }
        .pg-num { width: 24px; height: 24px; border-radius: 50%; background: var(--accent-dim); color: var(--accent); font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
        .pg-faq details { border-bottom: 1px solid var(--border); padding: 12px 0; }
        .pg-faq summary { cursor: pointer; font-weight: 600; font-size: var(--fs-md); }
        .pg-faq p { color: var(--text-secondary); margin: 8px 0 0; line-height: 1.55; font-size: var(--fs-base); }
        .pg-cta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
        @media (max-width: 900px) { .pg-grid3, .pg-grid4 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 600px) { .pg-nav { padding: 10px 14px; } .pg-wrap, .pg-sec { padding-left: 14px; padding-right: 14px; } .pg-h1 { font-size: 24px; } .pg-grid3, .pg-grid4 { grid-template-columns: 1fr; } }
      `}</style>

      <nav className="pg-nav" style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/')} aria-label="HitAPI home" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-primary)', flex: 1, textAlign: 'left' }}>
          <LogoMark size={28} />
          <span style={{ fontSize: 'var(--fs-lg)', fontWeight: 600 }}>HitAPI</span>
          <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-tertiary)', marginLeft: 2 }}>· Online API Tester</span>
        </button>
        <button onClick={() => navigate('/')} style={navBtn}><Home size={13} /> Home</button>
        <button onClick={() => navigate('/how-it-works')} style={navBtn}>How it works</button>
        {user ? (
          <button onClick={() => navigate('/workbench')} className="btn btn-primary btn-sm" style={{ marginLeft: 4 }}>Open in the app <ArrowRight size={13} /></button>
        ) : (
          <>
            <button onClick={() => navigate('/login')} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 'var(--fs-md)', cursor: 'pointer', padding: '6px 14px', borderRadius: 7, marginLeft: 4 }}>Sign in</button>
            <button onClick={() => navigate('/login?mode=signup')} style={{ background: 'var(--accent-solid)', border: 'none', color: '#fff', fontSize: 'var(--fs-md)', fontWeight: 600, cursor: 'pointer', padding: '7px 16px', borderRadius: 7 }}>Sign up free</button>
          </>
        )}
      </nav>

      <main style={{ flex: 1 }}>
        <div className="pg-wrap">
          <h1 className="pg-h1">Free Online API Tester</h1>
          <p className="pg-lead">
            Send HTTP requests to any REST or GraphQL API right in your browser: headers, auth, JSON, form and file bodies,
            cURL import and code snippets. Test localhost APIs too. Free, no sign-up, nothing to install.
          </p>
          <Workbench variant="public" />
        </div>

        <section className="pg-sec" aria-labelledby="pg-features">
          <h2 id="pg-features">Everything you need to test an API</h2>
          <div className="pg-grid3">
            {API_TESTER_FEATURES.map(([t, d]) => <div key={t} className="pg-card"><h3><Check size={15} color="var(--green)" /> {t}</h3><p>{d}</p></div>)}
          </div>
        </section>

        <section className="pg-sec" aria-labelledby="pg-how">
          <h2 id="pg-how">How to test an API online</h2>
          <div className="pg-grid4">
            {STEPS.map(([t, d], i) => <div key={t} className="pg-card"><h3><span className="pg-num">{i + 1}</span> {t}</h3><p>{d}</p></div>)}
          </div>
        </section>

        <section className="pg-sec" aria-labelledby="pg-modes">
          <h2 id="pg-modes">Three ways to send a request</h2>
          <div className="pg-grid3">
            {MODES.map(([Icon, t, d, limits]) => <div key={t} className="pg-card"><h3><Icon size={16} color="var(--accent)" /> {t}</h3><p>{d}</p><p style={{ marginTop: 8, fontSize: 'var(--fs-xs)', color: 'var(--text-tertiary)' }}>{limits}</p></div>)}
          </div>
          <p style={{ color: 'var(--text-secondary)', marginTop: 12, fontSize: 'var(--fs-sm)' }}>
            Testing an API on your own machine? <a href={STORE_URL} target="_blank" rel="noopener noreferrer">Add the free HitAPI extension to Chrome</a> and choose "HitAPI extension": no CORS errors and no proxy.
          </p>
        </section>

        <section className="pg-sec" aria-labelledby="pg-next">
          <h2 id="pg-next">From one request to automated API tests</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
            The same tester is in the HitAPI Chrome extension, with collections, environments and <code>{'{{variables}}'}</code>, tests on every response,
            scenarios that chain requests, scheduled runs and a CLI for CI. Or import your OpenAPI spec and let HitAPI write the tests for you with AI.
          </p>
          <div className="pg-cta">
            <a className="btn btn-primary btn-sm" href={STORE_URL} target="_blank" rel="noopener noreferrer">Get the Chrome extension</a>
            <Link className="btn btn-ghost btn-sm" to="/how-it-works">How AI test generation works</Link>
            <Link className="btn btn-ghost btn-sm" to="/mock-api-server">Free mock API server</Link>
          </div>
        </section>

        <section className="pg-sec pg-faq" aria-labelledby="pg-faq" style={{ paddingBottom: 48 }}>
          <h2 id="pg-faq">Frequently asked questions</h2>
          {API_TESTER_FAQS.map(f => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
