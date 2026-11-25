/**
 * /pricing — HitAPI's plans. Today everyone is on Free; Pro is coming
 * (docs/platform/usage-limits.md). "Notify me" emails support, no account needed.
 */

import { Check, ArrowLeft } from 'lucide-react';

const SUPPORT = 'support@hitapi.dev';
const FREE = [
  'API Workbench: requests, collections, variables, tests, scenarios and flows',
  'Import and export, the HitAPI CLI and GitHub Actions',
  'Keep your Workbench in your account (sign-in)',
  'Up to 10 cloud schedules, hourly at most',
  'Projects with Swagger import, AI test generation and flow suites',
];
const PRO = [
  'Cloud schedules every 5 minutes',
  'No daily usage pauses',
  'More schedules and bigger runs',
  'Priority support',
];

export function PricingPage() {
  const notify = `mailto:${SUPPORT}?subject=${encodeURIComponent('HitAPI Pro: notify me')}&body=${encodeURIComponent('Please tell me when HitAPI Pro is available.')}`;
  return (
    <div className="pricing-page">
      <nav className="pricing-nav">
        <a href="/" className="pricing-home"><ArrowLeft size={14} /> HitAPI</a>
        <a href="/playground" className="btn btn-ghost btn-sm">Open the API Workbench</a>
      </nav>
      <header className="pricing-head">
        <h1>Plans</h1>
        <p>HitAPI is free to use. A Pro plan is on its way for teams that need more.</p>
      </header>
      <div className="pricing-grid">
        <section className="card pricing-card">
          <h2>Free</h2>
          <div className="pricing-price">$0</div>
          <p className="text-sm text-tertiary">Your current plan.</p>
          <ul>{FREE.map(f => <li key={f}><Check size={14} /> {f}</li>)}</ul>
          <p className="text-xs text-tertiary">On a very busy day HitAPI can reach its daily free usage limit; account features then pause until 05:30 IST (00:00 UTC). The Workbench in your browser keeps working.</p>
        </section>
        <section className="card pricing-card pro">
          <h2>Pro <span className="pricing-soon">Coming soon</span></h2>
          <div className="pricing-price">—</div>
          <p className="text-sm text-tertiary">Everything in Free, plus:</p>
          <ul>{PRO.map(f => <li key={f}><Check size={14} /> {f}</li>)}</ul>
          <a className="btn btn-primary" href={notify}>Notify me</a>
          <p className="text-xs text-tertiary">Opens an email to {SUPPORT}. We'll write when Pro is ready.</p>
        </section>
      </div>
    </div>
  );
}
