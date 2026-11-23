# W7. Import and export

**Extension feature covered:** 10 Import and export.
**Who:** everyone.
**Status:** 📝 Requirements.

## Goal
Bring existing work into HitAPI in one step (Postman, OpenAPI, Insomnia, HAR, cURL) and take it anywhere
(HitAPI, Postman, OpenAPI, code).

## User stories
1. I drop my Postman collection + environment and keep working on the website.
2. I paste an OpenAPI URL and get a collection with every endpoint and example bodies.
3. I export a collection for Postman or as OpenAPI.
4. I copy a request as code.

## Functional requirements
- R1. **Import** dialog (Collections tab): drop a file, paste text or fetch a URL (fetched through the cloud proxy,
  so CORS doesn't matter). Format detected automatically (shared/convert/detect.js): HitAPI collection / scenario /
  backup, Postman collection v2.0/2.1 (scripts → tests and Set vars where possible), Postman environment,
  OpenAPI 3 / Swagger 2 (JSON or YAML), HAR, Insomnia v4, cURL.
- R2. Preview before importing: name, requests/folders count, environments, what could not be converted.
- R3. **Export** a collection: HitAPI, Postman v2.1, OpenAPI 3 (JSON / YAML); environments as Postman env.
  Secrets removed unless the user ticks "include secrets" (with a warning).
- R4. Code snippets for one request (already in W1).
- R5. Signed in: "Import from a HitAPI project" (W3 R8) appears in the same dialog.

## Non-functional
- 5 MB OpenAPI file imports in < 3 s; conversion runs off the main thread if it blocks the UI (Web Worker).

## Backend changes
- URL fetch for import: use `/api/public/request` (GET, response up to 2 MB) — larger specs: ask the user to
  upload the file. Optional later: a dedicated `/api/public/fetch-spec` with a 10 MB limit.

## Reuse from the extension
`shared/convert/*` and `lib/js-yaml.mjs` (whole folder).

## Acceptance checklist
- [ ] The sample files used by the extension tests import with the same results.
- [ ] Exported Postman collection imports into Postman (manual check); exported OpenAPI validates.
- [ ] No secret values in exports without "include secrets".
