/**
 * Runs after `vite build`. For every public page in src/seo/pages.js it writes
 * real HTML (content + title/description/canonical/social tags/structured data)
 * so search engines and link previews see the page without running JavaScript.
 * Also writes sitemap.xml.
 *
 *   dist/index.html        → /
 *   dist/playground.html   → /playground   (Cloudflare Pages serves it without a trailing slash)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');

const entry = ['entry-server.mjs', 'entry-server.js'].map(f => path.join(ssrDir, f)).find(f => fs.existsSync(f));
if (!entry) throw new Error('SSR build not found in dist-ssr/ — did `vite build --ssr` run?');
const { render, PAGES, SITE, buildHead } = await import(pathToFileURL(entry).href);

const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const SEO_BLOCK = /<!--seo:start-->[\s\S]*?<!--seo:end-->/;
if (!SEO_BLOCK.test(template)) throw new Error('index.html is missing the <!--seo:start--> … <!--seo:end--> markers');
if (!template.includes('<div id="root"></div>')) throw new Error('index.html is missing <div id="root"></div>');

for (const route of Object.keys(PAGES)) {
    const body = render(route);
    const html = template
        .replace(SEO_BLOCK, `<!--seo:start-->\n  ${buildHead(route)}\n  <!--seo:end-->`)
        .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
    const file = route === '/' ? 'index.html' : `${route.slice(1)}.html`;
    fs.writeFileSync(path.join(dist, file), html);
    console.log(`prerendered ${route.padEnd(14)} → dist/${file} (${(html.length / 1024).toFixed(1)} KB)`);
}

const today = new Date().toISOString().slice(0, 10);
const urls = Object.entries(PAGES).map(([route, p]) => `  <url>
    <loc>${SITE.url}${route === '/' ? '/' : route}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq || 'monthly'}</changefreq>
    <priority>${p.priority || '0.5'}</priority>
  </url>`).join('\n');
fs.writeFileSync(path.join(dist, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
console.log(`sitemap.xml     → ${Object.keys(PAGES).length} URLs`);

fs.rmSync(ssrDir, { recursive: true, force: true });
