/**
 * Field-level encryption for sensitive data stored in D1
 * Algorithm: AES-256-GCM (authenticated encryption)
 * Key source: ENCRYPTION_KEY env var (32-byte hex string)
 *
 * Usage:
 *   const encrypted = await encryptField(env, JSON.stringify(payload));
 *   const plain     = await decryptField(env, encrypted);
 *
 * Format stored in DB: "enc:v1:<base64(iv)>:<base64(ciphertext+tag)>"
 * Prefix allows detecting unencrypted legacy values safely.
 */

const ENC_PREFIX = 'enc:v1:';
const IV_LENGTH = 12; // 96-bit IV for GCM

async function getKey(env) {
    const raw = env.ENCRYPTION_KEY;
    if (!raw) throw new Error('ENCRYPTION_KEY env var not set');
    // Expect 64-char hex string = 32 bytes
    const bytes = new Uint8Array(raw.match(/.{1,2}/g).map(b => parseInt(b, 16)));
    return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptField(env, plaintext) {
    if (!plaintext) return plaintext;
    // Don't double-encrypt
    if (typeof plaintext === 'string' && plaintext.startsWith(ENC_PREFIX)) return plaintext;

    const key = await getKey(env);
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const enc = new TextEncoder().encode(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext));

    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc);

    const ivB64 = btoa(String.fromCharCode(...iv));
    const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));
    return `${ENC_PREFIX}${ivB64}:${ctB64}`;
}

export async function decryptField(env, stored) {
    if (!stored) return stored;
    // Not encrypted (legacy row) — return as-is
    if (typeof stored !== 'string' || !stored.startsWith(ENC_PREFIX)) return stored;

    const key = await getKey(env);
    const parts = stored.slice(ENC_PREFIX.length).split(':');
    if (parts.length !== 2) throw new Error('Invalid encrypted field format');

    const iv = Uint8Array.from(atob(parts[0]), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(parts[1]), c => c.charCodeAt(0));

    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(plain);
}

/**
 * Detect if a value is encrypted
 */
export function isEncrypted(value) {
    return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/**
 * Encrypt an object's sensitive fields in-place
 * sensitiveFields: array of dot-notation paths e.g. ['password', 'credentials.token']
 */
export async function encryptFields(env, obj, sensitiveFields) {
    if (!obj || typeof obj !== 'object') return obj;
    const result = { ...obj };
    for (const field of sensitiveFields) {
        if (result[field] !== undefined && result[field] !== null) {
            const val = typeof result[field] === 'string' ? result[field] : JSON.stringify(result[field]);
            result[field] = await encryptField(env, val);
        }
    }
    return result;
}

/**
 * Generate a new random 32-byte encryption key (hex)
 * Run once: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 * Or use this helper via a one-time setup endpoint
 */
export function generateKeyHex() {
    return Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}