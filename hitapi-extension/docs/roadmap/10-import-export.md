# 10. Import and Export

**Talend parity:** #71–76 (Postman collections, Swagger, OpenAPI, OAS, HAR, reuse of imported collections).
**Status:** ✅ Done in v1.7.0 (user guide: [Request Workbench → Import and export](../features/request-workbench/README.md#import-and-export)).

### What was built
- **Import** (Collections tab → Import): drop or choose a file, paste text, or fetch a URL. The format is
  detected and a summary shows what will be added and what was skipped, before anything is added.
  - **Postman collection v2.0 / v2.1:** folders, requests, headers (switched-off ones too), query (off rows
    too), path variables (`:id` with a value → the value, without → `{{id}}`), bodies (raw JSON/XML/text,
    URL-encoded, form-data, GraphQL, binary), auth at collection, folder and request level (bearer, basic, API
    key, OAuth 2 client credentials; no auth set = Inherit), collection variables (secret type kept).
    Simple test scripts are converted: `pm.response.to.have.status`, response time below, header present,
    `pm.expect(json.x).to.eql(…)` / `.to.exist`, and `pm.environment|globals|collectionVariables.set(…)` from
    the JSON body (also via `var jsonData = pm.response.json()`) or a header become Tests and Set vars rules;
    other script lines are counted in the summary.
  - **Postman environment / globals** → an environment (a clash gets "Name (2)") / merged into Globals.
  - **OpenAPI 3 / Swagger 2** (JSON or YAML, file, paste or URL): folder per tag, request per operation, base
    URL from servers (server variables' defaults; relative URLs resolved against the spec URL) or host +
    basePath, path parameters as `{{variables}}` with the spec's examples as collection variables, required or
    exemplified query/header parameters, bodies from examples or built from the schema ($ref, allOf/oneOf,
    formats), security → collection auth with `{{token}}` / `{{apiKey}}` / `{{username}}`+`{{password}}`.
  - **HAR** (DevTools "Save all as HAR"): only fetch/XHR (on by default), one host, skip repeats; browser headers
    left out; a folder per host; each request gets a switched-off "status equals <recorded status>" test.
  - **Insomnia v4:** workspaces → collections, folders, requests, bodies, auth, base environment → collection
    variables, sub-environments → environments, `{{ _.x }}` → `{{x}}`.
  - **HitAPI collection files** and **cURL** commands (choose which collection gets the request).
- **Export:** a collection as **HitAPI JSON**, **Postman v2.1** (Tests and Set vars rules written as Postman
  scripts, collection headers as a pre-request script, base URL as `{{baseUrl}}`; re-imports cleanly), or
  **OpenAPI 3** JSON/YAML (best effort: path per request, `{{var}}` path segments as parameters, query and header
  parameters, example bodies with inferred schemas, tags from folders, server and security). An environment or
  Globals exports as a **Postman environment** (secret values left out).
- **Code** (header): the request as cURL, JavaScript fetch, Node.js axios, Python requests, Go net/http or PHP
  cURL, with variables and collection settings filled in; Copy.
- **Captured traffic → HAR:** Export HAR in the popup and DevTools capture list (no response bodies: extensions
  can't read them).
- Not done: Insomnia export, Postman v1, and running Postman's arbitrary JavaScript.
- Code: `shared/convert/{detect,postman,openapi,har,insomnia,codegen,draft}.js`,
  `workbench/views/{import-dialog,code-dialog}.js`. Tests: 44 checks (`test12.cjs`).

## What the user gets

Import (into a collection, doc 6):

- **OpenAPI 3 / Swagger 2** (JSON or YAML, URL or file) → project with one service per tag, one request
  per operation, example bodies filled from the spec. (Extends the existing importer to also create local
  collections.)
- **Postman Collection v2.0 / v2.1** → folders, requests, headers, bodies, auth, collection variables;
  Postman environments → environments (doc 7).
- **HAR** (from DevTools "Save all as HAR") → one request per entry, with filters (only XHR/fetch, only one host).
- **cURL** → paste a command, get a request (reuse the web Playground's tested `parseCurl`).
- **Insomnia** export (HitAPI extra, if cheap after Postman).
- An import summary: what was imported, what was skipped and why (e.g. Postman scripts aren't supported).

Export:

- Collection → **Postman v2.1** JSON, **OpenAPI 3** (best effort), or HitAPI JSON.
- Single request → **cURL**, and code snippets (Python, Go, Node.js — reuse the web app's codegen).
- Captured traffic → **HAR**.

## Design

- `background/workbench/importers/{openapi,postman,har,curl}.js` and `exporters/{postman,openapi,curl,har}.js`,
  each a pure converter to/from the collection model (unit-tested with sample files).
- Reuse `lib/js-yaml.mjs` (already bundled) for YAML specs.

## Acceptance checklist

- [x] Postman v2.1 sample with folders, auth and variables imports correctly.
- [x] HAR from DevTools imports only fetch/XHR entries when filtered.
- [x] Pasted cURL with headers and `--data-raw` becomes the same request.
- [x] Export to Postman → re-import works (checked by re-importing the file and against the v2.1 schema fields; not opened in the Postman app here).
- [x] Petstore OpenAPI imports with tags as services.
