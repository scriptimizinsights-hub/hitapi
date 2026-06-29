/**
 * HitAPI Platform Auth
 * JWT-based auth with production-grade terms acceptance tracking
 */

const TOKEN_EXPIRY = 60 * 60 * 24 * 7; // 7 days

// Single source of truth for current terms version
// Bump this string whenever T&C changes — all users must re-accept
export const CURRENT_TERMS_VERSION = '2026-06-30';

// ── Password hashing (PBKDF2 via Web Crypto) ─────────────────────────────────
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
        const keyMaterial = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
        );
        const bits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256
        );
        return btoa(String.fromCharCode(...new Uint8Array(bits))) === hashB64;
    } catch { return false; }
}

// ── JWT (HMAC-SHA256) ─────────────────────────────────────────────────────────
function b64url(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function b64urlDecode(str) {
    return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}
async function getKey(secret) {
    return crypto.subtle.importKey(
        'raw', new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
    );
}

export async function signJWT(payload, secret) {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY,
    }));
    const key = await getKey(secret);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`));
    return `${header}.${body}.${b64url(String.fromCharCode(...new Uint8Array(sig)))}`;
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

// ── Helper: get IP and user agent from request ────────────────────────────────
function getClientInfo(request) {
    return {
        ip: request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || null,
        userAgent: request.headers.get('user-agent') || null,
    };
}

// ── Helper: record terms acceptance ──────────────────────────────────────────
async function recordTermsAcceptance(db, userId, version, request) {
    const { ip, userAgent } = getClientInfo(request);
    const id = crypto.randomUUID();
    await db.run(
        `INSERT INTO terms_acceptances (id, user_id, terms_version, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
        [id, userId, version, ip, userAgent]
    );
    await db.run(
        `UPDATE hitapi_users SET terms_version_accepted = ?, terms_accepted_at = unixepoch() WHERE id = ?`,
        [version, userId]
    );
}

// ── Route handlers ─────────────────────────────────────────────────────────────

export async function hitapiSignup(request, env) {
    const { DatabaseAdapter } = await import('../db/adapter.js');
    const { json, error } = await import('../middleware/cors.js');
    const db = new DatabaseAdapter(env.DB);
    const body = await request.json().catch(() => ({}));

    const { email, password, name, terms_version } = body;

    if (!email || !password || !name) {
        return error('email, password and name are required', 400);
    }
    if (password.length < 8) {
        return error('Password must be at least 8 characters', 400);
    }
    // Require terms acceptance at signup
    if (terms_version !== CURRENT_TERMS_VERSION) {
        return error('You must accept the current Terms & Conditions to register', 400);
    }

    const existing = await db.first('SELECT id FROM hitapi_users WHERE email = ?', [email.toLowerCase()]);
    if (existing) return error('Email already registered', 409);

    const hashed = await hashPassword(password);
    const id = crypto.randomUUID();
    const { ip, userAgent } = getClientInfo(request);

    await db.run(
        `INSERT INTO hitapi_users (id, email, password, name, terms_version_accepted, terms_accepted_at)
     VALUES (?, ?, ?, ?, ?, unixepoch())`,
        [id, email.toLowerCase(), hashed, name, terms_version]
    );

    // Write audit record
    await db.run(
        `INSERT INTO terms_acceptances (id, user_id, terms_version, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), id, terms_version, ip, userAgent]
    );

    const secret = env.JWT_SECRET || 'hitapi-dev-secret-change-in-prod';
    const token = await signJWT({ sub: id, email: email.toLowerCase(), name }, secret);

    return json({
        success: true, data: {
            token,
            user: { id, email: email.toLowerCase(), name, terms_version_accepted: terms_version }
        }
    });
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

    return json({
        success: true, data: {
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                terms_version_accepted: user.terms_version_accepted || null,
            }
        }
    });
}

export async function hitapiMe(request, env) {
    const { DatabaseAdapter } = await import('../db/adapter.js');
    const { json, error } = await import('../middleware/cors.js');
    const payload = await requireAuth(request, env);
    if (!payload) return error('Unauthorized', 401);

    // Fetch fresh user record to get latest terms_version_accepted
    const db = new DatabaseAdapter(env.DB);
    const user = await db.first('SELECT id, email, name, terms_version_accepted FROM hitapi_users WHERE id = ?', [payload.sub]);
    if (!user) return error('User not found', 404);

    return json({
        success: true, data: {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                terms_version_accepted: user.terms_version_accepted || null,
            }
        }
    });
}

export async function hitapiAcceptTerms(request, env) {
    const { DatabaseAdapter } = await import('../db/adapter.js');
    const { json, error } = await import('../middleware/cors.js');
    const payload = await requireAuth(request, env);
    if (!payload) return error('Unauthorized', 401);

    const body = await request.json().catch(() => ({}));
    const version = body.version;

    if (!version) return error('version is required', 400);
    if (version !== CURRENT_TERMS_VERSION) {
        return error(`Invalid terms version. Current version is ${CURRENT_TERMS_VERSION}`, 400);
    }

    const db = new DatabaseAdapter(env.DB);
    await recordTermsAcceptance(db, payload.sub, version, request);

    console.log(`[Terms] User ${payload.sub} accepted version ${version} from ${getClientInfo(request).ip}`);

    return json({
        success: true, data: {
            terms_version_accepted: version,
            accepted_at: Math.floor(Date.now() / 1000),
        }
    });
}

// Admin-only: get acceptance history for a user
export async function hitapiTermsHistory(request, env) {
    const { DatabaseAdapter } = await import('../db/adapter.js');
    const { json, error } = await import('../middleware/cors.js');
    const payload = await requireAuth(request, env);
    if (!payload) return error('Unauthorized', 401);

    const db = new DatabaseAdapter(env.DB);
    const history = await db.all(
        `SELECT terms_version, accepted_at, ip_address, user_agent
     FROM terms_acceptances WHERE user_id = ? ORDER BY accepted_at DESC`,
        [payload.sub]
    );

    return json({ success: true, data: { history } });
}