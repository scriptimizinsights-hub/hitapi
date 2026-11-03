/**
 * Public API Runner — lets anyone (no login / no project) fire a single
 * HTTP request at any public URL and get the response back.
 *
 * The request is executed server-side from the Worker, which avoids browser
 * CORS restrictions. Because this is a public endpoint, it has guardrails:
 *   - http/https only, no localhost / private / link-local / metadata hosts
 *   - request timeout, request-body and response-body size caps
 *   - best-effort per-IP rate limiting (KV)
 */

export const PUBLIC_LIMITS = {
    TIMEOUT_MS: 15000,
    MAX_REQUEST_BODY_BYTES: 1024 * 1024,      // 1 MB
    MAX_RESPONSE_BODY_BYTES: 2 * 1024 * 1024, // 2 MB
    RATE_LIMIT_PER_MINUTE: 60,
    ALLOWED_METHODS: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
};

// Headers the caller must not set (hop-by-hop / spoofing / Cloudflare-internal)
const BLOCKED_REQUEST_HEADERS = new Set([
    'host', 'connection', 'content-length', 'transfer-encoding', 'upgrade',
    'keep-alive', 'proxy-authorization', 'proxy-connection', 'te', 'trailer',
    'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cf-worker',
    'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'forwarded'
]);

export class PublicRequestError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.status = status;
    }
}

/**
 * Reject hosts that point at internal infrastructure (SSRF protection).
 * Cloudflare Workers already refuse to fetch private IPs, but this keeps the
 * endpoint safe when the worker is run on Node/Bun/Deno via an adapter.
 */
function assertPublicHost(hostname) {
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');

    if (
        h === 'localhost' || h.endsWith('.localhost') ||
        h.endsWith('.local') || h.endsWith('.internal') ||
        h === 'metadata.google.internal' || h === '0.0.0.0'
    ) {
        throw new PublicRequestError('Requests to local or internal hosts are not allowed');
    }

    // IPv4 literal
    const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])];
        const isPrivate =
            a === 0 || a === 10 || a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||   // carrier-grade NAT
            (a === 169 && b === 254) ||              // link-local / cloud metadata
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            a >= 224;                                // multicast / reserved
        if (isPrivate) throw new PublicRequestError('Requests to private IP addresses are not allowed');
    }

    // IPv6 literal
    if (h.includes(':')) {
        if (
            h === '::' || h === '::1' ||
            h.startsWith('fc') || h.startsWith('fd') ||   // unique local
            h.startsWith('fe80') ||                        // link-local
            h.startsWith('::ffff:')                        // IPv4-mapped
        ) {
            throw new PublicRequestError('Requests to private IP addresses are not allowed');
        }
    }
}

function validateInput(input) {
    if (!input || typeof input !== 'object') throw new PublicRequestError('Request body must be JSON');

    const method = String(input.method || 'GET').toUpperCase();
    if (!PUBLIC_LIMITS.ALLOWED_METHODS.includes(method)) {
        throw new PublicRequestError(`Method ${method} is not supported`);
    }

    let url;
    try {
        url = new URL(String(input.url || '').trim());
    } catch {
        throw new PublicRequestError('A valid absolute URL is required (e.g. https://api.example.com/users)');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new PublicRequestError('Only http and https URLs are allowed');
    }
    if (url.username || url.password) {
        throw new PublicRequestError('Put credentials in the Auth tab or headers, not in the URL');
    }
    assertPublicHost(url.hostname);

    // Extra query params (merged on top of any already in the URL)
    if (input.query && typeof input.query === 'object') {
        for (const [k, v] of Object.entries(input.query)) {
            if (k) url.searchParams.set(k, String(v ?? ''));
        }
    }

    // Headers
    const headers = {};
    if (input.headers && typeof input.headers === 'object') {
        for (const [k, v] of Object.entries(input.headers)) {
            const key = String(k).trim();
            if (!key || BLOCKED_REQUEST_HEADERS.has(key.toLowerCase())) continue;
            headers[key] = String(v ?? '');
        }
    }

    // Auth helper
    const auth = input.auth || {};
    switch (auth.type) {
        case 'bearer':
            if (auth.token) headers['Authorization'] = `Bearer ${auth.token}`;
            break;
        case 'basic':
            headers['Authorization'] = `Basic ${btoa(`${auth.username || ''}:${auth.password || ''}`)}`;
            break;
        case 'apikey':
            if (auth.key) {
                if (auth.in === 'query') url.searchParams.set(auth.header || 'api_key', auth.key);
                else headers[auth.header || 'X-API-Key'] = auth.key;
            }
            break;
    }

    // Body
    let body;
    if (input.body !== undefined && input.body !== null && input.body !== '' && !['GET', 'HEAD'].includes(method)) {
        body = typeof input.body === 'string' ? input.body : JSON.stringify(input.body);
        if (new TextEncoder().encode(body).length > PUBLIC_LIMITS.MAX_REQUEST_BODY_BYTES) {
            throw new PublicRequestError('Request body exceeds 1 MB limit', 413);
        }
        const hasContentType = Object.keys(headers).some(k => k.toLowerCase() === 'content-type');
        if (!hasContentType) {
            let looksJson = false;
            try { JSON.parse(body); looksJson = true; } catch { /* not JSON */ }
            headers['Content-Type'] = looksJson ? 'application/json' : 'text/plain';
        }
    }

    return { method, url: url.toString(), headers, body };
}

/**
 * Read a response body up to a byte cap so huge downloads can't exhaust memory.
 */
async function readCapped(response, maxBytes) {
    if (!response.body) return { text: '', bytes: 0, truncated: false };
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    let truncated = false;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (bytes + value.length > maxBytes) {
            chunks.push(value.slice(0, maxBytes - bytes));
            bytes = maxBytes;
            truncated = true;
            try { await reader.cancel(); } catch { /* ignore */ }
            break;
        }
        chunks.push(value);
        bytes += value.length;
    }

    const merged = new Uint8Array(bytes);
    let offset = 0;
    for (const c of chunks) { merged.set(c, offset); offset += c.length; }
    return { text: new TextDecoder().decode(merged), bytes, truncated };
}

/**
 * Execute one public request and return a normalised result.
 */
export async function executePublicRequest(input) {
    const req = validateInput(input);
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PUBLIC_LIMITS.TIMEOUT_MS);

    try {
        const response = await fetch(req.url, {
            method: req.method,
            headers: req.headers,
            body: req.body,
            redirect: input.follow_redirects === false ? 'manual' : 'follow',
            signal: controller.signal
        });

        const { text, bytes, truncated } = await readCapped(response, PUBLIC_LIMITS.MAX_RESPONSE_BODY_BYTES);
        const time_ms = Date.now() - started;

        const headers = {};
        for (const [k, v] of response.headers.entries()) headers[k] = v;

        let json = null;
        const contentType = response.headers.get('content-type') || '';
        if (!truncated && (contentType.includes('json') || /^\s*[{[]/.test(text))) {
            try { json = JSON.parse(text); } catch { json = null; }
        }

        return {
            ok: response.ok,
            status: response.status,
            status_text: response.statusText,
            time_ms,
            size_bytes: bytes,
            truncated,
            final_url: response.url || req.url,
            redirected: response.redirected,
            headers,
            content_type: contentType,
            body: text,
            json,
            request: { method: req.method, url: req.url, headers: req.headers, body: req.body ?? null }
        };
    } catch (err) {
        if (err instanceof PublicRequestError) throw err;
        const aborted = err.name === 'AbortError';
        throw new PublicRequestError(
            aborted ? `Request timed out after ${PUBLIC_LIMITS.TIMEOUT_MS / 1000}s` : `Request failed: ${err.message}`,
            aborted ? 504 : 502
        );
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Best-effort per-IP rate limiting using KV (eventually consistent, so it is a
 * soft limit). For hard limits, add a Cloudflare WAF rate-limiting rule on
 * /api/public/*. Returns { allowed, remaining }.
 */
export async function checkRateLimit(request, cache) {
    if (!cache) return { allowed: true, remaining: PUBLIC_LIMITS.RATE_LIMIT_PER_MINUTE };

    const ip = request.headers.get('cf-connecting-ip')
        || request.headers.get('x-forwarded-for')?.split(',')[0].trim()
        || 'unknown';
    const minute = Math.floor(Date.now() / 60000);
    const key = `ratelimit:public:${ip}:${minute}`;

    const count = parseInt((await cache.get(key)) || '0', 10);
    if (count >= PUBLIC_LIMITS.RATE_LIMIT_PER_MINUTE) {
        return { allowed: false, remaining: 0 };
    }
    await cache.put(key, String(count + 1), { expirationTtl: 120 });
    return { allowed: true, remaining: PUBLIC_LIMITS.RATE_LIMIT_PER_MINUTE - count - 1 };
}