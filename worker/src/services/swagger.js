/**
 * Swagger / OpenAPI Parser
 * Supports: OpenAPI 3.0, 3.1, Swagger 2.0 — JSON and YAML
 */

/**
 * Minimal YAML → JSON parser (covers the subset used in OpenAPI specs)
 * For production, use a full YAML library via npm
 */
function parseYAML(text) {
  // If it looks like JSON, just parse it
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  // Simple YAML → object (handles typical OpenAPI YAML)
  // For production use: import yaml from 'js-yaml' via npm
  throw new Error('YAML parsing requires js-yaml. Install it: npm install js-yaml --workspace=worker');
}

/**
 * Fetch and parse an OpenAPI spec from a URL or raw text
 */
export async function fetchAndParseSpec(input, cache) {
  let rawText = '';
  let spec = null;

  if (typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'))) {
    // Check cache first (KV, 1 hour TTL)
    const cacheKey = `swagger:${input}`;
    if (cache) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const response = await fetch(input, {
      headers: { Accept: 'application/json, application/yaml, text/yaml, */*' }
    });
    if (!response.ok) throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
    rawText = await response.text();

    // Cache for 1 hour
    if (cache) {
      await cache.put(cacheKey, rawText, { expirationTtl: 3600 });
    }
  } else {
    rawText = input;
  }

  // Parse JSON or YAML
  try {
    spec = JSON.parse(rawText);
  } catch {
    spec = parseYAML(rawText);
  }

  return spec;
}

/**
 * Extract all endpoints from an OpenAPI spec
 * Returns normalized array regardless of OpenAPI version
 */
export function extractEndpoints(spec) {
  const endpoints = [];
  const version = spec.openapi || spec.swagger || '2.0';
  const isV3 = version.startsWith('3');

  const paths = spec.paths || {};

  for (const [path, pathItem] of Object.entries(paths)) {
    const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;

      // Extract parameters (path + path-level + operation-level)
      const allParams = [
        ...(pathItem.parameters || []),
        ...(operation.parameters || [])
      ].map(p => resolveRef(spec, p));

      // Extract request body
      let requestBody = null;
      if (isV3 && operation.requestBody) {
        const rb = resolveRef(spec, operation.requestBody);
        const content = rb.content || {};
        const jsonContent = content['application/json'] || Object.values(content)[0];
        if (jsonContent) {
          const schema = jsonContent.schema ? resolveSchema(spec, jsonContent.schema) : null;
          // Capture example — use as payload when schema has no resolvable properties
          const example = jsonContent.example || jsonContent.examples?.default?.value || null;
          requestBody = schema ? { ...schema, _example: example } : { _example: example };
        }

      } else if (!isV3 && operation.parameters) {
        // Swagger 2.0 body parameter
        const bodyParam = operation.parameters.find(p => p.in === 'body');
        if (bodyParam?.schema) {
          requestBody = resolveSchema(spec, bodyParam.schema);
        }
      }

      // Extract responses
      const responses = {};
      for (const [statusCode, response] of Object.entries(operation.responses || {})) {
        const res = resolveRef(spec, response);
        if (isV3) {
          const content = res.content || {};
          const jsonContent = content['application/json'];
          responses[statusCode] = {
            description: res.description,
            schema: jsonContent?.schema ? resolveSchema(spec, jsonContent.schema) : null
          };
        } else {
          responses[statusCode] = {
            description: res.description,
            schema: res.schema ? resolveSchema(spec, res.schema) : null
          };
        }
      }

      endpoints.push({
        path,
        method: method.toUpperCase(),
        operationId: operation.operationId,
        summary: operation.summary,
        description: operation.description,
        tags: operation.tags || [],
        parameters: allParams,
        requestBody: operation.requestBody ? requestBody : null,
        responses,
        security: operation.security || spec.security || [],
        deprecated: operation.deprecated || false
      });
    }
  }

  return endpoints;
}

/**
 * Resolve a $ref in the spec
 */
function resolveRef(spec, obj) {
  if (!obj || !obj.$ref) return obj;
  const parts = obj.$ref.replace('#/', '').split('/');
  let current = spec;
  for (const part of parts) {
    current = current[decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~'))];
    if (!current) return obj;
  }
  return current;
}

/**
 * Resolve schema refs recursively (shallow — 2 levels deep)
 */
function resolveSchema(spec, schema, depth = 0) {
  if (!schema || depth > 3) return schema;
  schema = resolveRef(spec, schema);
  if (!schema) return null;

  if (schema.properties) {
    const resolved = { ...schema, properties: {} };
    for (const [key, val] of Object.entries(schema.properties)) {
      resolved.properties[key] = resolveSchema(spec, val, depth + 1);
    }
    return resolved;
  }

  if (schema.items) {
    return { ...schema, items: resolveSchema(spec, schema.items, depth + 1) };
  }

  if (schema.allOf) {
    const merged = { type: 'object', properties: {} };
    for (const sub of schema.allOf) {
      const resolved = resolveSchema(spec, sub, depth + 1);
      if (resolved?.properties) Object.assign(merged.properties, resolved.properties);
    }
    return merged;
  }

  return schema;
}

/**
 * Extract global info from spec
 */
export function extractSpecInfo(spec) {
  const isV3 = (spec.openapi || '').startsWith('3');
  return {
    title: spec.info?.title || 'Untitled API',
    version: spec.info?.version || '1.0.0',
    description: spec.info?.description || '',
    openapi_version: spec.openapi || spec.swagger || '2.0',
    servers: isV3
      ? (spec.servers || []).map(s => s.url)
      : [`${spec.schemes?.[0] || 'https'}://${spec.host || ''}${spec.basePath || ''}`],
    global_security: spec.securityDefinitions || spec.components?.securitySchemes || {}
  };
}