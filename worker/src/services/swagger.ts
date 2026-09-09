// /**
//  * Swagger / OpenAPI Parser
//  * Supports: OpenAPI 3.0, 3.1, Swagger 2.0 — JSON and YAML
//  */

// /**
//  * Minimal YAML → JSON parser (covers the subset used in OpenAPI specs)
//  * For production, use a full YAML library via npm
//  */
// function parseYAML(text) {
//   // If it looks like JSON, just parse it
//   const trimmed = text.trim();
//   if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
//     return JSON.parse(trimmed);
//   }
//   // Simple YAML → object (handles typical OpenAPI YAML)
//   // For production use: import yaml from 'js-yaml' via npm
//   throw new Error('YAML parsing requires js-yaml. Install it: npm install js-yaml --workspace=worker');
// }

// /**
//  * Fetch and parse an OpenAPI spec from a URL or raw text
//  */
// export async function fetchAndParseSpec(input, cache) {
//   let rawText = '';
//   let spec = null;

//   if (typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'))) {
//     // Check cache first (KV, 1 hour TTL)
//     const cacheKey = `swagger:${input}`;
//     if (cache) {
//       const cached = await cache.get(cacheKey);
//       if (cached) {
//         return JSON.parse(cached);
//       }
//     }

//     const response = await fetch(input, {
//       headers: { Accept: 'application/json, application/yaml, text/yaml, */*' }
//     });
//     if (!response.ok) throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
//     rawText = await response.text();

//     // Cache for 1 hour
//     if (cache) {
//       await cache.put(cacheKey, rawText, { expirationTtl: 3600 });
//     }
//   } else {
//     rawText = input;
//   }

//   // Parse JSON or YAML
//   try {
//     spec = JSON.parse(rawText);
//   } catch {
//     spec = parseYAML(rawText);
//   }

//   return spec;
// }

// /**
//  * Extract all endpoints from an OpenAPI spec
//  * Returns normalized array regardless of OpenAPI version
//  */
// export function extractEndpoints(spec) {
//   const endpoints = [];
//   const version = spec.openapi || spec.swagger || '2.0';
//   const isV3 = version.startsWith('3');

//   const paths = spec.paths || {};

//   for (const [path, pathItem] of Object.entries(paths)) {
//     const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

//     for (const method of methods) {
//       const operation = pathItem[method];
//       if (!operation) continue;

//       // Extract parameters (path + path-level + operation-level)
//       const allParams = [
//         ...(pathItem.parameters || []),
//         ...(operation.parameters || [])
//       ].map(p => resolveRef(spec, p));

//       // Extract request body
//       let requestBody = null;
//       if (isV3 && operation.requestBody) {
//         const rb = resolveRef(spec, operation.requestBody);
//         const content = rb.content || {};
//         const jsonContent = content['application/json'] || Object.values(content)[0];
//         if (jsonContent) {
//           const schema = jsonContent.schema ? resolveSchema(spec, jsonContent.schema) : null;
//           // Capture example — use as payload when schema has no resolvable properties
//           const example = jsonContent.example || jsonContent.examples?.default?.value || null;
//           requestBody = schema ? { ...schema, _example: example } : { _example: example };
//         }

//       } else if (!isV3 && operation.parameters) {
//         // Swagger 2.0 body parameter
//         const bodyParam = operation.parameters.find(p => p.in === 'body');
//         if (bodyParam?.schema) {
//           requestBody = resolveSchema(spec, bodyParam.schema);
//         }
//       }

//       // Extract responses
//       const responses = {};
//       for (const [statusCode, response] of Object.entries(operation.responses || {})) {
//         const res = resolveRef(spec, response);
//         if (isV3) {
//           const content = res.content || {};
//           const jsonContent = content['application/json'];
//           responses[statusCode] = {
//             description: res.description,
//             schema: jsonContent?.schema ? resolveSchema(spec, jsonContent.schema) : null
//           };
//         } else {
//           responses[statusCode] = {
//             description: res.description,
//             schema: res.schema ? resolveSchema(spec, res.schema) : null
//           };
//         }
//       }

//       endpoints.push({
//         path,
//         method: method.toUpperCase(),
//         operationId: operation.operationId,
//         summary: operation.summary,
//         description: operation.description,
//         tags: operation.tags || [],
//         parameters: allParams,
//         requestBody: operation.requestBody ? requestBody : null,
//         responses,
//         security: operation.security || spec.security || [],
//         deprecated: operation.deprecated || false
//       });
//     }
//   }

//   return endpoints;
// }

// /**
//  * Resolve a $ref in the spec
//  */
// function resolveRef(spec, obj, seen = new Set()) {
//   if (!obj || !obj.$ref) return obj;

//   if (seen.has(obj.$ref)) return obj; // circular ref guard
//   seen.add(obj.$ref);

//   const parts = obj.$ref.replace('#/', '').split('/');
//   let current = spec;
//   for (const part of parts) {
//     current = current[decodeURIComponent(part.replace(/~1/g, '/').replace(/~0/g, '~'))];
//     if (!current) return obj;
//   }

//   // keep resolving if the target is itself a $ref
//   return resolveRef(spec, current, seen);
// }
// /**
//  * Resolve schema refs recursively (shallow — 2 levels deep)
//  */
// function resolveSchema(spec, schema, depth = 0) {
//   if (!schema || depth > 3) return schema;
//   schema = resolveRef(spec, schema);
//   if (!schema) return null;

//   if (schema.properties) {
//     const resolved = { ...schema, properties: {} };
//     for (const [key, val] of Object.entries(schema.properties)) {
//       resolved.properties[key] = resolveSchema(spec, val, depth + 1);
//     }
//     return resolved;
//   }

//   if (schema.items) {
//     return { ...schema, items: resolveSchema(spec, schema.items, depth + 1) };
//   }

//   if (schema.allOf) {
//     const merged = { type: 'object', properties: {} };
//     for (const sub of schema.allOf) {
//       const resolved = resolveSchema(spec, sub, depth + 1);
//       if (resolved?.properties) Object.assign(merged.properties, resolved.properties);
//     }
//     return merged;
//   }

//   return schema;
// }

// /**
//  * Extract global info from spec
//  */
// export function extractSpecInfo(spec) {
//   const isV3 = (spec.openapi || '').startsWith('3');
//   return {
//     title: spec.info?.title || 'Untitled API',
//     version: spec.info?.version || '1.0.0',
//     description: spec.info?.description || '',
//     openapi_version: spec.openapi || spec.swagger || '2.0',
//     servers: isV3
//       ? (spec.servers || []).map(s => s.url)
//       : [`${spec.schemes?.[0] || 'https'}://${spec.host || ''}${spec.basePath || ''}`],
//     global_security: spec.securityDefinitions || spec.components?.securitySchemes || {}
//   };
// }





/**
 * Swagger / OpenAPI Endpoint Parser
 *
 * Supports:
 *   - Swagger 2.0
 *   - OpenAPI 3.0.x
 *   - OpenAPI 3.1.x
 *   - JSON
 *   - YAML (using js-yaml)
 *
 * Extracts:
 *   - paths / methods
 *   - operation metadata
 *   - parameters
 *   - request bodies
 *   - responses
 *   - security
 *   - schemas
 *   - examples
 *   - content types
 *
 * Recommended:
 *   npm install js-yaml
 */

import * as yaml from "js-yaml";

// ============================================================
// Types
// ============================================================

export interface ParsedSpec {
  type: "swagger" | "openapi";
  version: string;
  spec: any;
}

export interface NormalizedParameter {
  name: string;
  in: string;
  required: boolean;
  description?: string;
  schema?: any;
  example?: any;
  examples?: Record<string, any>;
  style?: string;
  explode?: boolean;
  deprecated?: boolean;
  allowEmptyValue?: boolean;
  allowReserved?: boolean;
}

export interface NormalizedContent {
  schema: any | null;
  example?: any;
  examples?: Record<string, any>;
  encoding?: Record<string, any>;
}

export interface NormalizedRequestBody {
  required: boolean;
  description?: string;
  content: Record<string, NormalizedContent>;
}

export interface NormalizedResponse {
  description?: string;
  headers: Record<string, any>;
  content: Record<string, NormalizedContent>;
  links?: Record<string, any>;
}

export interface NormalizedEndpoint {
  path: string;
  method: string;

  operationId?: string;
  summary?: string;
  description?: string;

  tags: string[];

  parameters: {
    path: NormalizedParameter[];
    query: NormalizedParameter[];
    header: NormalizedParameter[];
    cookie: NormalizedParameter[];
  };

  requestBody: NormalizedRequestBody | null;

  responses: Record<string, NormalizedResponse>;

  security: any[];

  deprecated: boolean;

  servers: string[];

  consumes: string[];
  produces: string[];

  externalDocs?: any;
}


// ============================================================
// Parse Swagger/OpenAPI
// ============================================================

export function parseSpec(input: string | object): ParsedSpec {

  let spec: any;

  if (typeof input === "string") {

    const trimmed = input.trim();

    try {

      spec = JSON.parse(trimmed);

    } catch {

      try {

        spec = yaml.load(trimmed);

      } catch (error) {

        throw new Error(
          `Unable to parse specification as JSON or YAML: ${error instanceof Error
            ? error.message
            : String(error)
          } `
        );

      }

    }

  } else {

    spec = input;

  }


  if (!spec || typeof spec !== "object") {

    throw new Error(
      "Invalid Swagger/OpenAPI specification"
    );

  }


  // OpenAPI 3.x
  if (
    typeof spec.openapi === "string" &&
    spec.openapi.startsWith("3.")
  ) {

    return {
      type: "openapi",
      version: spec.openapi,
      spec
    };

  }


  // Swagger 2.x
  if (
    typeof spec.swagger === "string" &&
    spec.swagger.startsWith("2.")
  ) {

    return {
      type: "swagger",
      version: spec.swagger,
      spec
    };

  }


  throw new Error(
    "Unsupported specification. Expected Swagger 2.x or OpenAPI 3.x"
  );

}


// ============================================================
// Fetch specification
// ============================================================

export async function fetchAndParseSpec(
  input: string | object,
  cache?: KVNamespace
): Promise<any> {

  if (
    typeof input !== "string" ||
    (
      !input.startsWith("http://") &&
      !input.startsWith("https://")
    )
  ) {

    return parseSpec(input).spec;

  }


  const cacheKey = `swagger:${input} `;


  if (cache) {

    const cached = await cache.get(cacheKey);

    if (cached) {

      return JSON.parse(cached);

    }

  }


  const response = await fetch(input, {

    headers: {
      Accept:
        "application/json, application/yaml, text/yaml, */*"
    }

  });


  if (!response.ok) {

    throw new Error(
      `Failed to fetch specification: ${response.status} ${response.statusText} `
    );

  }


  const rawText = await response.text();

  const spec = parseSpec(rawText).spec;


  if (cache) {

    await cache.put(
      cacheKey,
      JSON.stringify(spec),
      {
        expirationTtl: 3600
      }
    );

  }


  return spec;

}


// ============================================================
// Version
// ============================================================

function getSpecType(spec: any): "swagger" | "openapi" {

  if (
    typeof spec.openapi === "string" &&
    spec.openapi.startsWith("3.")
  ) {

    return "openapi";

  }


  if (
    typeof spec.swagger === "string" &&
    spec.swagger.startsWith("2.")
  ) {

    return "swagger";

  }


  throw new Error(
    "Specification must contain a valid Swagger 2.x or OpenAPI 3.x version"
  );

}


// ============================================================
// HTTP methods
// ============================================================

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace"
];


// ============================================================
// Resolve JSON Pointer
// ============================================================

function resolveJsonPointer(
  spec: any,
  pointer: string
): any {

  if (!pointer.startsWith("#/")) {

    return undefined;

  }


  const parts = pointer
    .substring(2)
    .split("/")
    .map(part =>
      decodeURIComponent(
        part
          .replace(/~1/g, "/")
          .replace(/~0/g, "~")
      )
    );


  let current = spec;


  for (const part of parts) {

    if (
      current === null ||
      current === undefined
    ) {

      return undefined;

    }


    current = current[part];

  }


  return current;

}


// ============================================================
// Resolve $ref
// ============================================================

function resolveRef(
  spec: any,
  value: any,
  seen = new Set<string>()
): any {

  if (
    !value ||
    typeof value !== "object" ||
    typeof value.$ref !== "string"
  ) {

    return value;

  }


  const ref = value.$ref;


  if (seen.has(ref)) {

    return value;

  }


  seen.add(ref);


  const resolved = resolveJsonPointer(
    spec,
    ref
  );


  if (!resolved) {

    return value;

  }


  return resolveRef(
    spec,
    resolved,
    seen
  );

}


// ============================================================
// Deep schema resolver
// ============================================================

function resolveSchema(
  spec: any,
  schema: any,
  depth = 0,
  seen = new Set<string>()
): any {

  if (!schema || depth > 20) {

    return schema;

  }


  if (
    typeof schema === "object" &&
    schema.$ref
  ) {

    const ref = schema.$ref;

    if (seen.has(ref)) {

      return {
        $ref: ref
      };

    }

    seen.add(ref);

    const resolved = resolveRef(
      spec,
      schema
    );

    return resolveSchema(
      spec,
      resolved,
      depth + 1,
      seen
    );

  }


  if (Array.isArray(schema)) {

    return schema.map(item =>
      resolveSchema(
        spec,
        item,
        depth + 1,
        new Set(seen)
      )
    );

  }


  if (
    typeof schema !== "object"
  ) {

    return schema;

  }


  const result: any = {
    ...schema
  };


  // properties
  if (schema.properties) {

    result.properties = {};

    for (
      const [key, value]
      of Object.entries(schema.properties)
    ) {

      result.properties[key] =
        resolveSchema(
          spec,
          value,
          depth + 1,
          new Set(seen)
        );

    }

  }


  // items
  if (schema.items) {

    result.items =
      resolveSchema(
        spec,
        schema.items,
        depth + 1,
        new Set(seen)
      );

  }


  // allOf
  if (schema.allOf) {

    result.allOf =
      schema.allOf.map((item: any) =>
        resolveSchema(
          spec,
          item,
          depth + 1,
          new Set(seen)
        )
      );

  }


  // oneOf
  if (schema.oneOf) {

    result.oneOf =
      schema.oneOf.map((item: any) =>
        resolveSchema(
          spec,
          item,
          depth + 1,
          new Set(seen)
        )
      );

  }


  // anyOf
  if (schema.anyOf) {

    result.anyOf =
      schema.anyOf.map((item: any) =>
        resolveSchema(
          spec,
          item,
          depth + 1,
          new Set(seen)
        )
      );

  }


  // not
  if (schema.not) {

    result.not =
      resolveSchema(
        spec,
        schema.not,
        depth + 1,
        new Set(seen)
      );

  }


  // additionalProperties
  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {

    result.additionalProperties =
      resolveSchema(
        spec,
        schema.additionalProperties,
        depth + 1,
        new Set(seen)
      );

  }


  // prefixItems - OpenAPI 3.1 / JSON Schema
  if (schema.prefixItems) {

    result.prefixItems =
      schema.prefixItems.map((item: any) =>
        resolveSchema(
          spec,
          item,
          depth + 1,
          new Set(seen)
        )
      );

  }


  // contains - JSON Schema
  if (schema.contains) {

    result.contains =
      resolveSchema(
        spec,
        schema.contains,
        depth + 1,
        new Set(seen)
      );

  }


  return result;

}


// ============================================================
// Extract examples
// ============================================================

function extractExamples(
  mediaType: any
): {
  example?: any;
  examples?: Record<string, any>;
} {

  const result: {
    example?: any;
    examples?: Record<string, any>;
  } = {};


  if (
    Object.prototype.hasOwnProperty.call(
      mediaType,
      "example"
    )
  ) {

    result.example = mediaType.example;

  }


  if (mediaType.examples) {

    result.examples = {};

    for (
      const [name, example]
      of Object.entries(mediaType.examples)
    ) {

      const value: any = example;

      if (
        value &&
        typeof value === "object" &&
        "value" in value
      ) {

        result.examples[name] =
          value.value;

      } else {

        result.examples[name] =
          value;

      }

    }

  }


  return result;

}


// ============================================================
// Normalize content
// ============================================================

function normalizeContent(
  spec: any,
  content: any
): Record<string, NormalizedContent> {

  const result: Record<string, NormalizedContent> = {};


  if (!content || typeof content !== "object") {

    return result;

  }


  for (
    const [mediaType, rawValue]
    of Object.entries(content)
  ) {

    const value: any =
      resolveRef(spec, rawValue);


    const normalized: NormalizedContent = {

      schema:
        value?.schema
          ? resolveSchema(
            spec,
            value.schema
          )
          : null

    };


    const examples =
      extractExamples(value);


    if (
      Object.prototype.hasOwnProperty.call(
        examples,
        "example"
      )
    ) {

      normalized.example =
        examples.example;

    }


    if (examples.examples) {

      normalized.examples =
        examples.examples;

    }


    if (value?.encoding) {

      normalized.encoding =
        value.encoding;

    }


    result[mediaType] =
      normalized;

  }


  return result;

}


// ============================================================
// Normalize parameter
// ============================================================

function normalizeParameter(
  spec: any,
  parameter: any
): NormalizedParameter | null {

  const param =
    resolveRef(spec, parameter);


  if (
    !param ||
    !param.name ||
    !param.in
  ) {

    return null;

  }


  let schema = null;


  // OpenAPI 3
  if (param.schema) {

    schema =
      resolveSchema(
        spec,
        param.schema
      );

  }


  // Swagger 2 non-body parameter
  if (
    !schema &&
    (
      param.type ||
      param.format ||
      param.items ||
      param.enum
    )
  ) {

    schema = {
      type: param.type,
      format: param.format,
      items: param.items
        ? resolveSchema(
          spec,
          param.items
        )
        : undefined,
      enum: param.enum,
      default: param.default
    };

  }


  const result: NormalizedParameter = {

    name: param.name,

    in: param.in,

    required:
      Boolean(param.required),

    description:
      param.description,

    schema,

    deprecated:
      Boolean(param.deprecated),

    allowEmptyValue:
      param.allowEmptyValue,

    allowReserved:
      param.allowReserved,

    style:
      param.style,

    explode:
      param.explode

  };


  if (
    Object.prototype.hasOwnProperty.call(
      param,
      "example"
    )
  ) {

    result.example =
      param.example;

  }


  if (param.examples) {

    result.examples = {};

    for (
      const [name, example]
      of Object.entries(param.examples)
    ) {

      const value: any = example;

      result.examples[name] =
        value &&
          typeof value === "object" &&
          "value" in value
          ? value.value
          : value;

    }

  }


  return result;

}


// ============================================================
// Merge parameters
// ============================================================

function mergeParameters(
  spec: any,
  pathParameters: any[] = [],
  operationParameters: any[] = []
) {

  const map = new Map<string, NormalizedParameter>();


  // Path-level first
  for (const parameter of pathParameters) {

    const normalized =
      normalizeParameter(
        spec,
        parameter
      );


    if (!normalized) continue;


    map.set(
      `${normalized.in}:${normalized.name} `,
      normalized
    );

  }


  // Operation-level overrides path-level
  for (const parameter of operationParameters) {

    const normalized =
      normalizeParameter(
        spec,
        parameter
      );


    if (!normalized) continue;


    map.set(
      `${normalized.in}:${normalized.name} `,
      normalized
    );

  }


  const result = {

    path: [] as NormalizedParameter[],
    query: [] as NormalizedParameter[],
    header: [] as NormalizedParameter[],
    cookie: [] as NormalizedParameter[]

  };


  for (const parameter of map.values()) {

    if (
      parameter.in === "path" ||
      parameter.in === "query" ||
      parameter.in === "header" ||
      parameter.in === "cookie"
    ) {

      result[parameter.in].push(
        parameter
      );

    }

  }


  return result;

}


// ============================================================
// Swagger 2 request body
// ============================================================

function extractSwagger2RequestBody(
  spec: any,
  parameters: any[]
): NormalizedRequestBody | null {

  const bodyParameter =
    parameters
      .map(p => resolveRef(spec, p))
      .find(p => p?.in === "body");


  if (!bodyParameter) {

    return null;

  }


  const content: Record<string, NormalizedContent> = {};


  const consumes =
    bodyParameter.consumes ||
    spec.consumes ||
    [
      "application/json"
    ];


  for (const mediaType of consumes) {

    content[mediaType] = {

      schema:
        bodyParameter.schema
          ? resolveSchema(
            spec,
            bodyParameter.schema
          )
          : null

    };

  }


  return {

    required:
      Boolean(bodyParameter.required),

    description:
      bodyParameter.description,

    content

  };

}


// ============================================================
// OpenAPI 3 request body
// ============================================================

function extractOpenApi3RequestBody(
  spec: any,
  operation: any
): NormalizedRequestBody | null {

  if (!operation.requestBody) {

    return null;

  }


  const body =
    resolveRef(
      spec,
      operation.requestBody
    );


  if (!body) {

    return null;

  }


  return {

    required:
      Boolean(body.required),

    description:
      body.description,

    content:
      normalizeContent(
        spec,
        body.content
      )

  };

}


// ============================================================
// Responses
// ============================================================

function extractResponses(
  spec: any,
  operation: any,
  type: "swagger" | "openapi"
): Record<string, NormalizedResponse> {

  const result:
    Record<string, NormalizedResponse> = {};


  for (
    const [statusCode, rawResponse]
    of Object.entries(
      operation.responses || {}
    )
  ) {

    const response =
      resolveRef(
        spec,
        rawResponse
      );


    if (!response) continue;


    const normalized:
      NormalizedResponse = {

      description:
        response.description,

      headers: {},

      content: {}

    };


    // Response headers
    if (response.headers) {

      for (
        const [name, header]
        of Object.entries(response.headers)
      ) {

        const resolvedHeader =
          resolveRef(
            spec,
            header
          );


        normalized.headers[name] =
          resolvedHeader;

      }

    }


    // OpenAPI 3
    if (type === "openapi") {

      normalized.content =
        normalizeContent(
          spec,
          response.content
        );

      if (response.links) {

        normalized.links =
          response.links;

      }

    }


    // Swagger 2
    else {

      if (response.schema) {

        const schema =
          resolveSchema(
            spec,
            response.schema
          );


        const produces =
          response.produces ||
          operation.produces ||
          spec.produces ||
          [
            "application/json"
          ];


        for (const mediaType of produces) {

          normalized.content[
            mediaType
          ] = {

            schema

          };

        }

      }

    }


    result[statusCode] =
      normalized;

  }


  return result;

}


// ============================================================
// Servers
// ============================================================

function extractServers(
  spec: any,
  pathItem: any,
  operation: any
): string[] {

  // OpenAPI 3 operation-level
  if (operation.servers?.length) {

    return operation.servers
      .map((server: any) => server.url)
      .filter(Boolean);

  }


  // OpenAPI 3 path-level
  if (pathItem.servers?.length) {

    return pathItem.servers
      .map((server: any) => server.url)
      .filter(Boolean);

  }


  // OpenAPI 3 global
  if (spec.servers?.length) {

    return spec.servers
      .map((server: any) => server.url)
      .filter(Boolean);

  }


  // Swagger 2
  if (spec.host || spec.basePath || spec.schemes) {

    const schemes =
      spec.schemes?.length
        ? spec.schemes
        : ["https"];


    const host =
      spec.host || "";


    const basePath =
      spec.basePath || "";


    return schemes.map(
      (scheme: string) =>
        `${scheme}://${host}${basePath}`
    );

  }


  return [];

}


// ============================================================
// Extract endpoints
// ============================================================

export function extractEndpoints(
  spec: any
): NormalizedEndpoint[] {

  if (!spec || typeof spec !== "object") {

    throw new Error(
      "Invalid specification"
    );

  }


  const type =
    getSpecType(spec);


  const endpoints:
    NormalizedEndpoint[] = [];


  const paths =
    spec.paths || {};


  for (
    const [path, rawPathItem]
    of Object.entries(paths)
  ) {

    const pathItem =
      resolveRef(
        spec,
        rawPathItem
      );


    if (
      !pathItem ||
      typeof pathItem !== "object"
    ) {

      continue;

    }


    for (const method of HTTP_METHODS) {

      const rawOperation =
        pathItem[method];


      if (
        !rawOperation ||
        typeof rawOperation !== "object"
      ) {

        continue;

      }


      const operation =
        resolveRef(
          spec,
          rawOperation
        );


      // --------------------------------------------
      // Parameters
      // --------------------------------------------

      const pathParameters =
        Array.isArray(
          pathItem.parameters
        )
          ? pathItem.parameters
          : [];


      const operationParameters =
        Array.isArray(
          operation.parameters
        )
          ? operation.parameters
          : [];


      const parameters =
        mergeParameters(
          spec,
          pathParameters,
          operationParameters
        );


      // --------------------------------------------
      // Request body
      // --------------------------------------------

      let requestBody:
        NormalizedRequestBody | null =
        null;


      if (type === "openapi") {
        requestBody =
          extractOpenApi3RequestBody(
            spec,
            operation
          );
        console.log("Swagger 3 request body:", JSON.stringify(requestBody));

      } else {

        requestBody =
          extractSwagger2RequestBody(
            spec,
            [
              ...pathParameters,
              ...operationParameters
            ]
          );
        console.log("Swagger 2 request body:", JSON.stringify(requestBody));

      }


      // --------------------------------------------
      // Responses
      // --------------------------------------------

      const responses =
        extractResponses(
          spec,
          operation,
          type
        );


      // --------------------------------------------
      // Security
      // --------------------------------------------

      const security =
        Object.prototype.hasOwnProperty.call(
          operation,
          "security"
        )
          ? operation.security
          : (
            spec.security || []
          );


      // --------------------------------------------
      // Consumes / Produces
      // --------------------------------------------

      const consumes =
        operation.consumes ||
        spec.consumes ||
        [];


      const produces =
        operation.produces ||
        spec.produces ||
        [];


      // --------------------------------------------
      // Servers
      // --------------------------------------------

      const servers =
        extractServers(
          spec,
          pathItem,
          operation
        );


      // --------------------------------------------
      // Endpoint
      // --------------------------------------------

      endpoints.push({

        path,

        method:
          method.toUpperCase(),

        operationId:
          operation.operationId,

        summary:
          operation.summary,

        description:
          operation.description,

        tags:
          operation.tags || [],

        parameters,

        requestBody,

        responses,

        security,

        deprecated:
          Boolean(
            operation.deprecated
          ),

        servers,

        consumes,

        produces,

        externalDocs:
          operation.externalDocs

      });

    }

  }


  return endpoints;

}


// ============================================================
// Extract global specification information
// ============================================================

export function extractSpecInfo(
  spec: any
) {

  const type =
    getSpecType(spec);


  const version =
    type === "openapi"
      ? spec.openapi
      : spec.swagger;


  let servers: string[] = [];


  if (type === "openapi") {

    servers =
      (spec.servers || [])
        .map((server: any) => server.url)
        .filter(Boolean);

  } else {

    const schemes =
      spec.schemes?.length
        ? spec.schemes
        : ["https"];


    const host =
      spec.host || "";


    const basePath =
      spec.basePath || "";


    servers =
      schemes.map(
        (scheme: string) =>
          `${scheme}://${host}${basePath}`
      );

  }


  return {

    title:
      spec.info?.title ||
      "Untitled API",

    version:
      spec.info?.version ||
      "1.0.0",

    description:
      spec.info?.description ||
      "",

    openapi_version:
      version,

    type,

    servers,

    global_security:
      spec.security || [],

    security_schemes:
      type === "openapi"
        ? (
          spec.components
            ?.securitySchemes || {}
        )
        : (
          spec.securityDefinitions || {}
        )

  };

}

