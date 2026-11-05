/**
 * shared/url.js — small URL helpers used across the extension.
 */

export function getOrigin(url) {
  try { const u = new URL(url); return `${u.protocol}//${u.host}`; }
  catch { return null; }
}

export function pathOf(url) {
  try { const u = new URL(url); return u.pathname + u.search; }
  catch { return url || ''; }
}

export function isWebUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

// Third-party noise that is never an app's own API.
const NOISE_HOSTS = [
  'hitapi.dev',
  'google-analytics.com', 'analytics.google.com', 'googletagmanager.com',
  'doubleclick.net', 'googlesyndication.com', 'facebook.com', 'facebook.net',
  'segment.io', 'segment.com', 'sentry.io', 'hotjar.com', 'hotjar.io',
  'intercom.io', 'crisp.chat', 'clarity.ms', 'mixpanel.com', 'amplitude.com',
  'fullstory.com', 'newrelic.com', 'nr-data.net', 'datadoghq.com', 'bugsnag.com',
  'fonts.googleapis.com', 'fonts.gstatic.com', 'stripe.network',
];

const STATIC_EXT = /\.(js|mjs|css|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|eot|otf|map|mp4|webm|mp3|wasm)$/i;

/** True when a request looks like an API call worth capturing. */
export function isCapturable(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  if (NOISE_HOSTS.some(h => host === h || host.endsWith('.' + h))) return false;
  if (STATIC_EXT.test(u.pathname)) return false;
  return true;
}

/**
 * Same rule the HitAPI worker uses (worker/src/utils/localUrl.js) to decide a
 * step must go through the Local Agent. The agent refuses anything else, so
 * it can never be used to reach public sites with your browser.
 */
export function isLocalUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    return (
      host === 'localhost' || host.endsWith('.localhost') ||
      host === '127.0.0.1' || /^127\./.test(host) ||
      host === '0.0.0.0' || host === '::1' ||
      host.endsWith('.local') ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}
