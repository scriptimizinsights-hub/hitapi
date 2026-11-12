/**
 * services/mock/demo.js — the public demo mock server used on hitapi.dev/mock-api-server.
 *
 *   ANY https://services.hitapi.dev/mock/demo/<path>
 *
 * A small "Store API" spec run through the same engine as real mock servers
 * (spec example → schema sample → fallback), so the page shows exactly what a
 * user gets. Nothing is stored: routes are built once per worker instance.
 * The slug 'demo' can never clash with a real mock (their slugs are 12 random chars).
 */

import { mockFromEndpoint } from './specSamples.js';

export const DEMO_SLUG = 'demo';

const json = (schema, example) => ({ content: { 'application/json': example === undefined ? { schema } : { schema, example } } });

const PRODUCT = {
    type: 'object',
    properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        sku: { type: 'string' },
        price: { type: 'number', minimum: 9, maximum: 399 },
        currency: { type: 'string', enum: ['USD'] },
        in_stock: { type: 'boolean' },
        rating: { type: 'number', minimum: 3.5, maximum: 5 },
        category: { type: 'string', enum: ['audio', 'accessories', 'home', 'fitness'] },
        created_at: { type: 'string', format: 'date-time' },
    },
};

const USER = {
    type: 'object',
    properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        phone: { type: 'string' },
        city: { type: 'string' },
        country: { type: 'string' },
        avatar_url: { type: 'string', format: 'uri' },
        is_verified: { type: 'boolean' },
        created_at: { type: 'string', format: 'date-time' },
    },
};

const ORDER = {
    type: 'object',
    properties: {
        id: { type: 'integer' },
        user_id: { type: 'integer', minimum: 1, maximum: 500 },
        status: { type: 'string', enum: ['pending', 'paid', 'shipped', 'delivered'] },
        items: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            items: {
                type: 'object',
                properties: {
                    product_id: { type: 'integer', minimum: 101, maximum: 120 },
                    quantity: { type: 'integer' },
                    price: { type: 'number', minimum: 9, maximum: 399 },
                },
            },
        },
        total: { type: 'number', minimum: 40, maximum: 900 },
        currency: { type: 'string', enum: ['USD'] },
        created_at: { type: 'string', format: 'date-time' },
    },
};

/** The demo spec, in the same shape endpoints are stored in. */
export const DEMO_ENDPOINTS = [
    {
        method: 'GET', path: '/products', summary: 'List products',
        // Has an example in the spec, so the example is returned as written
        responses: {
            200: json({ type: 'array', items: PRODUCT }, [
                { id: 101, name: 'Wireless Noise-Cancelling Headphones', sku: 'AUD-101', price: 129.99, currency: 'USD', in_stock: true, rating: 4.6, category: 'audio', created_at: '2026-09-14T10:12:00Z' },
                { id: 102, name: 'USB-C Charging Dock', sku: 'ACC-102', price: 49.5, currency: 'USD', in_stock: true, rating: 4.3, category: 'accessories', created_at: '2026-09-20T08:40:00Z' },
                { id: 103, name: 'Smart Fitness Band', sku: 'FIT-103', price: 79, currency: 'USD', in_stock: false, rating: 4.1, category: 'fitness', created_at: '2026-10-02T15:05:00Z' },
            ]),
        },
    },
    { method: 'GET', path: '/products/{id}', summary: 'Get one product', responses: { 200: json(PRODUCT), 404: {} } },
    { method: 'GET', path: '/users/{id}', summary: 'Get a user', responses: { 200: json(USER) } },
    { method: 'GET', path: '/orders', summary: 'List orders', responses: { 200: json({ type: 'array', items: ORDER }) } },
    { method: 'POST', path: '/orders', summary: 'Create an order', responses: { 201: json(ORDER), 400: {} } },
    { method: 'DELETE', path: '/orders/{id}', summary: 'Cancel an order', responses: { 204: {} } },
    // No response described at all (like a request captured by the extension): fallback body
    { method: 'GET', path: '/categories', summary: 'List categories', responses: {} },
];

let cache = null;

/** Demo routes, shaped like rows of mock_responses. */
export function demoRoutes() {
    if (!cache) {
        cache = DEMO_ENDPOINTS.map((ep, i) => {
            const m = mockFromEndpoint({ method: ep.method, path: ep.path, responses: ep.responses });
            return {
                id: `demo-${i}`,
                method: ep.method,
                path: ep.path,
                summary: ep.summary,
                status: m.status,
                body: m.body === null || m.body === undefined ? null : JSON.stringify(m.body),
                headers: null,
                delay_ms: 0,
                source: m.source,
            };
        });
    }
    return cache;
}

/** GET /mock/demo — what the demo server offers. */
export function demoIndex(base) {
    return {
        name: 'HitAPI demo mock server (Store API)',
        about: 'A live mock generated from a small OpenAPI spec. Call any route below; no login or API key needed.',
        docs: 'https://hitapi.dev/mock-api-server',
        base_url: base,
        routes: demoRoutes().map(r => ({ method: r.method, path: r.path, summary: r.summary, status: r.status, source: r.source })),
        tips: [
            'Path parameters are filled in: GET /products/42 returns "id": 42.',
            'Force an error with ?__status=404 or the header X-Mock-Status: 500.',
            'The X-Mock-Source header says where the body came from: example, schema or fallback.',
        ],
    };
}
