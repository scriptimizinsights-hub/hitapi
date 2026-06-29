/**
 * HitAPI Platform Auth
 * Simple JWT-based auth for hitapi.dev users
 */

const JWT_SECRET_KEY = 'HITAPI_JWT_SECRET'; // env var name
const TOKEN_EXPIRY = 60 * 60 * 24 * 7;   // 7 days in seconds

// ── Password hashing using Web Crypto ─────────────────────────────────────────
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await crypto.subtle.importKey(
        'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256
    );
    const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
    const saltB64 = btoa(String.fromCharCode(...salt));
    return `pbkdf2:${saltB64}:${hash}`;
}

async function verifyPassword(password, stored) {
    try {
        const [, saltB64, hashB64] = stored.split(':');
        const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
        );
        const bits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256
        );
        const hash = btoa(String.fromCharCode(...new Uint8Array(bits)));
        return hash === hashB64;
    } catch { return false; }
}

// ── JWT using Web Crypto HMAC-SHA256 ─────────────────────────────────────────
function b64url(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function b64urlDecode(str) {
    return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

async function getKey(secret) {
    return crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
    );
}

export async function signJWT(payload, secret) {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY }));
    const key = await getKey(secret);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`));
    const sigB64 = b64url(String.fromCharCode(...new Uint8Array(sig)));
    return `${header}.${body}.${sigB64}`;
}

export async function verifyJWT(token, secret) {
    try {
        const [header, body, sig] = token.split('.');
        const key = await getKey(secret);
        const valid = await crypto.subtle.verify(
            'HMAC', key,
            Uint8Array.from(b64urlDecode(sig), c => c.charCodeAt(0)),
            new TextEncoder().encode(`${header}.${body}`)
        );
        if (!valid) return null;
        const payload = JSON.parse(b64urlDecode(body));
        if (payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch { return null; }
}

// ── Auth middleware ────────────────────────────────────────────────────────────
export async function requireAuth(request, env) {
    const secret = env.JWT_SECRET || 'hitapi-dev-secret-change-in-prod';
    const auth = request.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return null;
    return verifyJWT(token, secret);
}

// ── Route handlers ─────────────────────────────────────────────────────────────
export async function hitapiSignup(request, env) {
    const { DatabaseAdapter } = await import('../db/adapter.js');
    const { json, error } = await import('../middleware/cors.js');
    const db = new DatabaseAdapter(env.DB);
    const body = await request.json().catch(() => ({}));

    const { email, password, name } = body;
    if (!email || !password || !name) {
        return error('email, password and name are required', 400);
    }
    if (password.length < 8) {
        return error('Password must be at least 8 characters', 400);
    }

    const existing = await db.first('SELECT id FROM hitapi_users WHERE email = ?', [email.toLowerCase()]);
    if (existing) return error('Email already registered', 409);

    const hashed = await hashPassword(password);
    const id = crypto.randomUUID();
    await db.run(
        'INSERT INTO hitapi_users (id, email, password, name) VALUES (?, ?, ?, ?)',
        [id, email.toLowerCase(), hashed, name]
    );

    const secret = env.JWT_SECRET || 'hitapi-dev-secret-change-in-prod';
    const token = await signJWT({ sub: id, email: email.toLowerCase(), name }, secret);

    return json({ success: true, data: { token, user: { id, email: email.toLowerCase(), name } } });
}

export async function hitapiLogin(request, env) {
    const { DatabaseAdapter } = await import('../db/adapter.js');
    const { json, error } = await import('../middleware/cors.js');
    const db = new DatabaseAdapter(env.DB);
    const body = await request.json().catch(() => ({}));

    const { email, password } = body;
    if (!email || !password) return error('email and password are required', 400);

    const user = await db.first('SELECT * FROM hitapi_users WHERE email = ?', [email.toLowerCase()]);
    if (!user) return error('Invalid credentials', 401);

    const valid = await verifyPassword(password, user.password);
    if (!valid) return error('Invalid credentials', 401);

    const secret = env.JWT_SECRET || 'hitapi-dev-secret-change-in-prod';
    const token = await signJWT({ sub: user.id, email: user.email, name: user.name }, secret);

    return json({ success: true, data: { token, user: { id: user.id, email: user.email, name: user.name } } });
}

export async function hitapiMe(request, env) {
    const { json, error } = await import('../middleware/cors.js');
    const payload = await requireAuth(request, env);
    if (!payload) return error('Unauthorized', 401);
    return json({ success: true, data: { user: { id: payload.sub, email: payload.email, name: payload.name } } });
}