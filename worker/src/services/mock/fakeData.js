/**
 * services/mock/fakeData.js — realistic sample JSON from a JSON Schema.
 *
 * Deterministic (same schema → same data, seeded by the field path) so a mock
 * doesn't change on every regenerate unless the spec does. Field names drive
 * the values: "email" gets an email, "createdAt" a date, "price" a money
 * amount, and so on. Used as the baseline before AI makes responses richer,
 * and as the fallback whenever AI is unavailable.
 */

const FIRST = ['Priya', 'Arjun', 'Maya', 'Liam', 'Sofia', 'Noah', 'Aisha', 'Kenji', 'Elena', 'Omar'];
const LAST = ['Sharma', 'Patel', 'Garcia', 'Chen', 'Okafor', 'Silva', 'Novak', 'Khan', 'Rossi', 'Kim'];
const CITIES = ['Mumbai', 'Berlin', 'Austin', 'Toronto', 'Lisbon', 'Singapore', 'Nairobi', 'Sydney'];
const COUNTRIES = ['IN', 'DE', 'US', 'CA', 'PT', 'SG', 'KE', 'AU'];
const STREETS = ['MG Road', 'Hauptstrasse 12', '221 Baker Street', 'King St W 80', 'Rua Augusta 45'];
const COMPANIES = ['Acme Corp', 'Globex', 'Initech', 'Umbrella Labs', 'Stark Industries', 'Wayne Tech'];
const PRODUCTS = ['Wireless Keyboard', 'USB-C Hub', 'Laptop Stand', 'Noise-Cancelling Headphones', '4K Monitor', 'Ergonomic Mouse'];
const PET_NAMES = ['Biscuit', 'Luna', 'Milo', 'Coco', 'Pepper', 'Simba', 'Nala', 'Rocky'];
const CATEGORIES = ['electronics', 'books', 'home & kitchen', 'fitness', 'fashion', 'toys'];
const WORDS = ['alpha', 'bravo', 'delta', 'nova', 'orbit', 'pixel', 'quartz', 'summit', 'vertex', 'zephyr'];
const STATUSES = ['active', 'pending', 'completed'];

// Small deterministic PRNG keyed by a string.
function seedFrom(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
function rng(seed) {
    let s = seed || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const int = (r, min, max) => min + Math.floor(r() * (max - min + 1));

function uuidFrom(r) {
    const hex = () => Math.floor(r() * 16).toString(16);
    const part = (n) => Array.from({ length: n }, hex).join('');
    return `${part(8)}-${part(4)}-4${part(3)}-a${part(3)}-${part(12)}`;
}
function isoDate(r, daysBack = 120) {
    const d = new Date(Date.UTC(2026, 9, 1) - int(r, 0, daysBack) * 86400000 - int(r, 0, 86399) * 1000);
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** A value for a string field, from its format, enum, pattern hints and name. */
function stringFor(name, schema, r, ctx = '') {
    const n = name.toLowerCase();
    const where = ctx.toLowerCase(); // seed path, e.g. "GET /products/{id}.name": tells a product's name from a person's
    const f = (schema.format || '').toLowerCase();
    if (Array.isArray(schema.enum) && schema.enum.length) return pick(r, schema.enum);
    if (f === 'email' || n.includes('email')) return `${pick(r, FIRST).toLowerCase()}.${pick(r, LAST).toLowerCase()}@example.com`;
    if (f === 'uuid' || /(^|_)uuid$|guid/.test(n)) return uuidFrom(r);
    if (f === 'date-time' || /(_at|_on|date|time|timestamp)$/.test(n) || /[a-z]At$/.test(name)) {
        return f === 'date' || /(^|_)date$|birth/.test(n) ? isoDate(r).slice(0, 10) : isoDate(r);
    }
    if (f === 'date') return isoDate(r).slice(0, 10);
    if (f === 'uri' || f === 'url' || /url|link|href|website/.test(n)) {
        return /image|avatar|photo|logo|thumbnail|picture/.test(n)
            ? `https://picsum.photos/seed/${int(r, 1, 999)}/400/300`
            : `https://example.com/${pick(r, WORDS)}/${int(r, 1, 999)}`;
    }
    if (f === 'ipv4' || /(^|_)ip/.test(n)) return `192.168.${int(r, 0, 255)}.${int(r, 1, 254)}`;
    if (f === 'password' || /password|secret/.test(n)) return 'S3cure!Pass';
    if (/token|jwt/.test(n)) return 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.mock-signature';
    if (/^id$|_id$|Id$/.test(name)) return `${n.replace(/_?id$/, '').slice(0, 3) || 'id'}_${Math.floor(r() * 1e8).toString(36)}`;
    if (/first_?name/.test(n)) return pick(r, FIRST);
    if (/last_?name|surname/.test(n)) return pick(r, LAST);
    if (/user_?name|login|handle/.test(n)) return `${pick(r, FIRST).toLowerCase()}${int(r, 10, 99)}`;
    if (/(^|_)name$|full_?name|display_?name/.test(n)) {
        if (/product|item/.test(n)) return pick(r, PRODUCTS);
        if (/company|org/.test(n)) return pick(r, COMPANIES);
        if (n === 'name') {
            // A bare "name" belongs to whatever the response is about
            if (/categor|genre|tag/.test(where)) return pick(r, CATEGORIES);
            if (/(^|\/)pets?\b|animal|dog|cat\b/.test(where)) return pick(r, PET_NAMES);
            if (/product|item|catalog|inventory|sku/.test(where)) return pick(r, PRODUCTS);
            if (/compan|organi[sz]ation|org|vendor|supplier|merchant|brand/.test(where)) return pick(r, COMPANIES);
        }
        return `${pick(r, FIRST)} ${pick(r, LAST)}`;
    }
    if (/title|product/.test(n)) return pick(r, PRODUCTS);
    if (/company|organi[sz]ation|org$/.test(n)) return pick(r, COMPANIES);
    if (/phone|mobile/.test(n)) return `+1-555-${int(r, 100, 999)}-${int(r, 1000, 9999)}`;
    if (/city/.test(n)) return pick(r, CITIES);
    if (/country/.test(n)) return pick(r, COUNTRIES);
    if (/street|address/.test(n)) return pick(r, STREETS);
    if (/zip|postal/.test(n)) return String(int(r, 10000, 99999));
    if (/currency/.test(n)) return pick(r, ['USD', 'EUR', 'INR', 'GBP']);
    if (/status|state/.test(n)) return pick(r, STATUSES);
    if (/categor/.test(n)) return pick(r, CATEGORIES);
    if (/(^|_)type$|kind/.test(n)) return pick(r, ['standard', 'premium', 'basic']);
    if (/color|colour/.test(n)) return pick(r, ['#8264ff', '#23d18b', '#ff5c5c']);
    if (/description|summary|bio|comment|message|note|text|content/.test(n)) {
        return `Sample ${n.replace(/_/g, ' ')} for ${pick(r, PRODUCTS).toLowerCase()}.`;
    }
    if (/code|sku|ref/.test(n)) return `${pick(r, WORDS).toUpperCase().slice(0, 3)}-${int(r, 100, 999)}`;
    if (/slug/.test(n)) return `${pick(r, WORDS)}-${pick(r, WORDS)}`;
    if (/lang|locale/.test(n)) return 'en-US';
    let s = `${pick(r, WORDS)}-${int(r, 1, 999)}`;
    if (schema.maxLength && s.length > schema.maxLength) s = s.slice(0, schema.maxLength);
    if (schema.minLength && s.length < schema.minLength) s = s.padEnd(schema.minLength, 'x');
    return s;
}

function numberFor(name, schema, r, integer) {
    const n = name.toLowerCase();
    let min = typeof schema.minimum === 'number' ? schema.minimum : undefined;
    let max = typeof schema.maximum === 'number' ? schema.maximum : undefined;
    if (min === undefined && max === undefined) {
        if (/price|amount|total|cost|balance|fee/.test(n)) { min = 5; max = 2500; integer = integer ?? false; }
        else if (/age/.test(n)) { min = 18; max = 75; }
        else if (/year/.test(n)) { min = 2015; max = 2026; }
        else if (/rating|score|stars/.test(n)) { min = 1; max = 5; }
        else if (/percent|ratio/.test(n)) { min = 0; max = 100; }
        else if (/lat/.test(n)) { min = -60; max = 60; }
        else if (/lon|lng/.test(n)) { min = -150; max = 150; }
        else if (/quantity|qty/.test(n)) { min = 1; max = 5; }
        else if (/count|total|size|limit|page/.test(n)) { min = 1; max = 50; }
        else if (/(^|_)id$/.test(n)) { min = 1; max = 9999; }
        else { min = 1; max = 1000; }
    }
    min = min ?? (max !== undefined ? max - 100 : 0);
    max = max ?? min + 1000;
    if (integer) return int(r, Math.ceil(min), Math.floor(max));
    return Math.round((min + r() * (max - min)) * 100) / 100;
}

/**
 * Sample value for a schema.
 * @param {object} schema  JSON Schema (OpenAPI flavour); unresolved $refs are tolerated
 * @param {string} name    field name (drives realistic values)
 * @param {string} path    seed path
 */
export function sampleFromSchema(schema, name = '', path = 'root', depth = 0) {
    const r = rng(seedFrom(path));
    if (!schema || typeof schema !== 'object') return null;
    if (depth > 8) return null;

    if (schema.example !== undefined) return schema.example;
    if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
    if (schema.default !== undefined && schema.type !== 'object') return schema.default;
    if (schema.const !== undefined) return schema.const;

    const variants = schema.oneOf || schema.anyOf;
    if (Array.isArray(variants) && variants.length) return sampleFromSchema(variants[0], name, path, depth + 1);
    if (Array.isArray(schema.allOf) && schema.allOf.length) {
        const merged = { type: 'object', properties: {}, required: [] };
        for (const part of schema.allOf) {
            Object.assign(merged.properties, part?.properties || {});
            if (part?.type && part.type !== 'object') return sampleFromSchema(part, name, path, depth + 1);
        }
        return sampleFromSchema(merged, name, path, depth + 1);
    }
    if (schema.$ref) {
        // Unresolved reference: make a plausible object named after it.
        const ref = String(schema.$ref).split('/').pop() || 'item';
        return { id: int(r, 1, 9999), name: `${ref} ${int(r, 1, 99)}` };
    }

    let type = Array.isArray(schema.type) ? schema.type.find(t => t !== 'null') : schema.type;
    if (!type) type = schema.properties ? 'object' : schema.items ? 'array' : 'string';

    switch (type) {
        case 'object': {
            const out = {};
            const props = schema.properties || {};
            for (const [key, sub] of Object.entries(props)) {
                out[key] = sampleFromSchema(sub, key, `${path}.${key}`, depth + 1);
            }
            if (!Object.keys(props).length && schema.additionalProperties && typeof schema.additionalProperties === 'object') {
                out[pick(r, WORDS)] = sampleFromSchema(schema.additionalProperties, '', `${path}.*`, depth + 1);
            }
            return out;
        }
        case 'array': {
            const n = Math.min(Math.max(schema.minItems || 2, 2), schema.maxItems || 3);
            return Array.from({ length: n }, (_, i) => sampleFromSchema(schema.items || {}, singular(name), `${path}[${i}]`, depth + 1));
        }
        case 'integer': return numberFor(name, schema, r, true);
        case 'number': return numberFor(name, schema, r, false);
        case 'boolean': return /^(is_?)?(active|enabled|verified|available|in_?stock|visible)/i.test(name) ? true : r() > 0.5;
        case 'null': return null;
        default: return stringFor(name, schema, r, path);
    }
}

function singular(name) {
    if (!name) return '';
    if (/ies$/.test(name)) return name.replace(/ies$/, 'y');
    if (/s$/.test(name) && !/ss$/.test(name)) return name.slice(0, -1);
    return name;
}

/** A plausible body when the spec says nothing about the response. */
export function fallbackBody(method, path) {
    const resource = (path.split('/').filter(s => s && !s.startsWith('{')).pop() || 'item').replace(/[^a-z0-9_]/gi, '');
    const one = singular(resource) || 'item';
    const shape = {
        type: 'object',
        properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            status: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
        },
    };
    const item = sampleFromSchema(shape, one, `fallback:${path}`);
    const m = method.toUpperCase();
    if (m === 'DELETE') return null;
    if (m === 'GET' && !/\{[^}]+\}$/.test(path)) {
        return [item, { ...sampleFromSchema(shape, one, `fallback:${path}#2`), id: item.id + 1 }];
    }
    return item;
}
