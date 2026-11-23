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
    RATE_LIMIT_PER_MINUTE: 60,          // per IP, not signed in
    USER_RATE_LIMIT_PER_MINUTE: 300,    // per signed-in user (token or API key)
    MAX_REDIRECTS: 10,
    ALLOWED_METHODS: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
};

// Any other method token is allowed too (WebDAV, custom APIs), except these
const REFUSED_METHODS = new Set(['CONNECT', 'TRACE', 'TRACK']);
const METHOD_TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,32}$/;

// Response types sent back as base64 so the Workbench can preview them
const BINARY_TYPE = /^(image\/|audio\/|video\/|font\/|application\/(pdf|octet-stream|zip|gzip|x-protobuf|protobuf|msgpack|wasm))/i;

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
// Local development only: hosts listed in DEV_PROXY_ALLOW_HOSTS (wrangler .dev.vars) skip the check.
// Never set it in production.
let devAllowHosts = new Set();
export function setDevAllowHosts(list) {
    devAllowHosts = new Set(String(list || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
}

function assertPublicHost(hostname) {
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (devAllowHosts.has(h)) return;

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

    const raw = String(input.method || 'GET').trim();
    const upper = raw.toUpperCase();
    // standard methods are upper-cased; custom ones are sent as typed
    const method = PUBLIC_LIMITS.ALLOWED_METHODS.includes(upper) ? upper : raw;
    if (!METHOD_TOKEN.test(method) || REFUSED_METHODS.has(upper)) {
        throw new PublicRequestError(`Method ${raw} is not supported`);
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

    // Body: text (body), bytes (body_base64) or a multipart form (form)
    let body;
    const noBody = ['GET', 'HEAD'].includes(method);
    if (!noBody && typeof input.body_base64 === 'string' && input.body_base64) {
        let bytes;
        try { bytes = Uint8Array.from(atob(input.body_base64), c => c.charCodeAt(0)); } catch { throw new PublicRequestError('body_base64 is not valid base64'); }
        if (bytes.length > PUBLIC_LIMITS.MAX_REQUEST_BODY_BYTES) throw new PublicRequestError('Request body exceeds 1 MB limit', 413);
        return { method, url: url.toString(), headers, body: bytes };
    }
    if (!noBody && Array.isArray(input.form) && input.form.length) {
        const fd = new FormData();
        let size = 0;
        for (const part of input.form.slice(0, 100)) {
            const name = String(part?.name || '');
            if (!name) continue;
            if (typeof part.base64 === 'string') {
                let bytes;
                try { bytes = Uint8Array.from(atob(part.base64), c => c.charCodeAt(0)); } catch { throw new PublicRequestError(`Form file "${name}" is not valid base64`); }
                size += bytes.length;
                fd.append(name, new Blob([bytes], { type: String(part.content_type || 'application/octet-stream') }), String(part.filename || 'file'));
            } else {
                const v = String(part.value ?? '');
                size += v.length;
                fd.append(name, v);
            }
        }
        if (size > PUBLIC_LIMITS.MAX_REQUEST_BODY_BYTES) throw new PublicRequestError('Request body exceeds 1 MB limit', 413);
        // fetch sets the multipart Content-Type with its boundary
        for (const k of Object.keys(headers)) if (k.toLowerCase() === 'content-type') delete headers[k];
        return { method, url: url.toString(), headers, body: fd };
    }
    if (input.body !== undefined && input.body !== null && input.body !== '' && !noBody) {
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
    if (!response.body) return { text: '', bytes: 0, truncated: false, raw: new Uint8Array(0) };
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
    return { text: new TextDecoder().decode(merged), bytes, truncated, raw: merged };
}

/**
 * Execute one public request and return a normalised result.
 */
export async function executePublicRequest(input) {
    const req = validateInput(input);
    const follow = input.follow_redirects !== false;
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PUBLIC_LIMITS.TIMEOUT_MS);

    try {
        // Redirects are followed here, one hop at a time, so every hop is
        // checked against private/local hosts and reported to the caller.
        let method = req.method;
        let body = req.body;
        let url = req.url;
        const headers = { ...req.headers };
        const redirects = [];
        let response;
        for (;;) {
            response = await fetch(url, { method, headers, body, redirect: 'manual', signal: controller.signal });
            const location = response.headers.get('location');
            if (!follow || !location || ![301, 302, 303, 307, 308].includes(response.status)) break;
            if (redirects.length >= PUBLIC_LIMITS.MAX_REDIRECTS) throw new PublicRequestError(`Too many redirects (more than ${PUBLIC_LIMITS.MAX_REDIRECTS})`, 502);
            const next = new URL(location, url);
            if (!['http:', 'https:'].includes(next.protocol)) throw new PublicRequestError(`Redirect to a non-HTTP URL was not followed: ${next.protocol}`, 502);
            assertPublicHost(next.hostname);
            redirects.push({ url, status: response.status, location: next.toString() });
            try { await response.body?.cancel(); } catch { /* ignore */ }
            // 303 (and 301/302 after POST) continue as GET without a body, like browsers
            if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
                method = 'GET'; body = undefined;
                for (const k of Object.keys(headers)) if (k.toLowerCase() === 'content-type') delete headers[k];
            }
            if (new URL(url).origin !== next.origin) {
                for (const k of Object.keys(headers)) if (['authorization', 'cookie'].includes(k.toLowerCase())) delete headers[k];
            }
            url = next.toString();
        }
        const ttfb_ms = Date.now() - started;

        const { text, bytes, truncated, raw } = await readCapped(response, PUBLIC_LIMITS.MAX_RESPONSE_BODY_BYTES);
        const time_ms = Date.now() - started;

        const headerMap = {};
        const header_list = [];
        for (const [k, v] of response.headers.entries()) {
            if (k === 'set-cookie') continue;
            headerMap[k] = v;
            header_list.push([k, v]);
        }
        const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie()
            : typeof response.headers.getAll === 'function' ? response.headers.getAll('set-cookie') : [];
        for (const c of cookies) header_list.push(['set-cookie', c]);
        if (cookies.length) headerMap['set-cookie'] = cookies.join(', ');

        let json = null;
        const contentType = response.headers.get('content-type') || '';
        if (!truncated && (contentType.includes('json') || /^\s*[{[]/.test(text))) {
            try { json = JSON.parse(text); } catch { json = null; }
        }
        let body_base64 = null;
        if (BINARY_TYPE.test(contentType) && raw.length) {
            let bin = '';
            for (let i = 0; i < raw.length; i += 0x8000) bin += String.fromCharCode.apply(null, raw.subarray(i, i + 0x8000));
            body_base64 = btoa(bin);
        }
        const reqBody = typeof req.body === 'string' ? req.body : req.body instanceof Uint8Array ? `(${req.body.length} bytes)` : req.body ? '(multipart form)' : null;

        return {
            ok: response.ok,
            status: response.status,
            status_text: response.statusText,
            time_ms,
            ttfb_ms,
            size_bytes: bytes,
            truncated,
            final_url: url,
            redirected: redirects.length > 0,
            redirects,
            headers: headerMap,
            header_list,
            content_type: contentType,
            body: body_base64 ? '' : text,
            body_base64,
            json,
            request: { method: req.method, url: req.url, headers: req.headers, body: reqBody }
        };
    } catch (err) {
        if (err instanceof PublicRequestError) throw err;
        const aborted = err.name === 'AbortError';
        let host = '';
        try { host = new URL(req.url).host; } catch { /* keep empty */ }
        // the runtime's own message ("internal error; reference = …") means nothing to users
        const why = /internal error|lookup address|ENOTFOUND|getaddrinfo|dns/i.test(String(err.message))
            ? `Could not connect to ${host}. Check the address: the host may not exist or may be down.`
            : /refused|ECONNREFUSED/i.test(String(err.message)) ? `${host} refused the connection.`
            : /certificate|tls|ssl/i.test(String(err.message)) ? `The TLS certificate of ${host} could not be verified.`
            : `Request failed: ${err.message}`;
        throw new PublicRequestError(
            aborted ? `Request timed out after ${PUBLIC_LIMITS.TIMEOUT_MS / 1000}s` : why,
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
export async function checkRateLimit(request, cache, userId = null) {
    const max = userId ? PUBLIC_LIMITS.USER_RATE_LIMIT_PER_MINUTE : PUBLIC_LIMITS.RATE_LIMIT_PER_MINUTE;
    if (!cache) return { allowed: true, remaining: max, limit: max };

    const ip = request.headers.get('cf-connecting-ip')
        || request.headers.get('x-forwarded-for')?.split(',')[0].trim()
        || 'unknown';
    const minute = Math.floor(Date.now() / 60000);
    const key = userId ? `ratelimit:public:user:${userId}:${minute}` : `ratelimit:public:${ip}:${minute}`;

    const count = parseInt((await cache.get(key)) || '0', 10);
    if (count >= max) {
        return { allowed: false, remaining: 0, limit: max };
    }
    await cache.put(key, String(count + 1), { expirationTtl: 120 });
    return { allowed: true, remaining: max - count - 1, limit: max };
}
