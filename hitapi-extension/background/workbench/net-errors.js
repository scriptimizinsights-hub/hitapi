/**
 * background/workbench/net-errors.js — the real reason a Workbench request
 * failed. fetch() only says "Failed to fetch"; webRequest knows it was e.g.
 * net::ERR_CONNECTION_REFUSED or net::ERR_NAME_NOT_RESOLVED.
 */

const recent = new Map(); // url → { error, at }
const KEEP_MS = 60 * 1000;

export function registerNetErrors() {
  chrome.webRequest.onErrorOccurred.addListener((d) => {
    if (!String(d.initiator || '').startsWith(`chrome-extension://${chrome.runtime.id}`)) return;
    recent.set(d.url, { error: d.error, at: Date.now() });
    if (recent.size > 50) recent.delete(recent.keys().next().value);
  }, { urls: ['<all_urls>'] });
}

const FRIENDLY = {
  'net::ERR_CONNECTION_REFUSED': 'Connection refused: nothing is listening at that address and port.',
  'net::ERR_NAME_NOT_RESOLVED': 'The host name could not be found (DNS).',
  'net::ERR_INTERNET_DISCONNECTED': 'You are offline.',
  'net::ERR_CONNECTION_TIMED_OUT': 'The server did not answer in time.',
  'net::ERR_CONNECTION_RESET': 'The connection was reset by the server.',
  'net::ERR_CONNECTION_CLOSED': 'The server closed the connection without a response.',
  'net::ERR_CERT_AUTHORITY_INVALID': 'The server\'s TLS certificate is not trusted (self-signed?). Open the URL in a tab once and accept it.',
  'net::ERR_CERT_COMMON_NAME_INVALID': 'The TLS certificate does not match this host name.',
  'net::ERR_CERT_DATE_INVALID': 'The server\'s TLS certificate has expired or is not valid yet.',
  'net::ERR_SSL_PROTOCOL_ERROR': 'TLS error: the server may not support HTTPS on this port.',
  'net::ERR_ADDRESS_UNREACHABLE': 'The address cannot be reached from this network.',
  'net::ERR_BLOCKED_BY_CLIENT': 'Blocked by another extension (for example an ad blocker).',
  'net::ERR_TOO_MANY_REDIRECTS': 'Too many redirects.',
  'net::ERR_EMPTY_RESPONSE': 'The server closed the connection without sending anything.',
};

/** The last network error for a URL in the past minute, or null. */
export function getNetError({ url }) {
  const hit = recent.get(url);
  if (!hit || Date.now() - hit.at > KEEP_MS) return null;
  return { code: hit.error, message: FRIENDLY[hit.error] || hit.error };
}
