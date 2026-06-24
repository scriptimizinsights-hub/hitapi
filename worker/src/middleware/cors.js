/**
 * Middleware: CORS, error handling, request helpers
 */

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
    'Access-Control-Max-Age': '86400'
  };
}

export function handleCORS(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  return null;
}

export function json(data, status = 200, env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders()
    }
  });
}

export function error(message, status = 400, env = {}) {
  return json({ error: message, status }, status, env);
}

export function success(data, meta = {}) {
  return { success: true, data, ...meta };
}

export async function parseBody(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return request.json();
  }
  return null;
}

export function withError(handler, env) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error('Route error:', err);
      return error(err.message || 'Internal server error', 500, env);
    }
  };
}