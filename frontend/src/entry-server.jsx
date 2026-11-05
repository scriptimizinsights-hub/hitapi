/**
 * Build-time renderer for public pages (see scripts/prerender.mjs).
 * Not shipped to browsers.
 */
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { LandingPage } from './components/ui/LandingPage.jsx';
import { PlaygroundPage } from './components/playground/PlaygroundPage.jsx';
import { HowItWorks } from './components/ui/HowItWorks.jsx';
import { SupportPage } from './components/ui/SupportPage.jsx';
import { PrivacyPage } from './components/ui/PrivacyPage.jsx';
import { TermsPage } from './components/ui/TermsPage.jsx';

export { PAGES, SITE, buildHead } from './seo/pages.js';

const COMPONENTS = {
    '/': () => <LandingPage onGetStarted={() => { }} />,
    '/playground': () => <PlaygroundPage />,
    '/how-it-works': () => <HowItWorks />,
    '/support': () => <SupportPage />,
    '/privacy': () => <PrivacyPage />,
    '/terms': () => <TermsPage />,
};

export function render(path) {
    const Page = COMPONENTS[path];
    if (!Page) throw new Error(`No component registered for ${path} in entry-server.jsx`);
    return renderToString(<StaticRouter location={path}>{Page()}</StaticRouter>);
}
