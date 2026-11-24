# W7. Import and export

**Extension feature covered:** 10 Import and export.
**Who:** everyone.
**Status:** ✅ Built.

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

## What was built
- **Import dialog** (Collections → Import): drop or choose a file, paste text, or fetch a URL. URLs are
  downloaded through HitAPI cloud (so the server's CORS doesn't matter; up to 2 MB, larger files: download and
  drop them), localhost URLs from this browser. "Import from a HitAPI project…" is in the same dialog.
- **Formats** (detected automatically, the extension's converters): Postman collection v2.0/v2.1 (auth, folders,
  variables; simple test scripts → checks, `pm.environment.set` → Set vars; the rest counted), Postman
  environment and globals, OpenAPI 3 and Swagger 2 (JSON or YAML; folder per tag, example bodies from schemas,
  security → auth), HAR (only API calls / skip repeats / one host), Insomnia v4 (collections and environments),
  HitAPI collection, **HitAPI scenario** (the CLI file → a scenario; its collection variables filled in), cURL
  (into a collection you pick).
- **Preview** before importing: the detected format, a summary (requests, folders, variables, environments, base
  URL) and what couldn't be converted. Files it can't read are explained and Import stays off.
- **After importing:** collections are added (and shown opened), environments added (a name already used gets
  "(2)"), globals merged, a cURL request opened, a scenario opened.
- **Export** a collection: HitAPI (.hitapi.json), Postman v2.1 (tests and Set vars become scripts), OpenAPI 3
  JSON or YAML. Secrets are left out unless "Include tokens, passwords, API keys and secret variables" is ticked
  (with a warning; not offered for OpenAPI). File names match the extension's (`Pet_Shop.postman_collection.json`).
  Environments export as Postman environments (W4). Code snippets: W1.
- **Speed:** a 5.1 MB OpenAPI file previews and imports in about 0.5 s on the main thread, so no Web Worker.
- **Files:** `import-convert.js`, `ImportDialog.jsx` (new); `CollectionDialogs.jsx` (export formats),
  `Workbench.jsx`, `CollectionsPanel.jsx`, `workbench.css`; `vite.config.js` (`@hitapi/lib` alias for js-yaml).
  No worker change.

## Acceptance checklist
- [x] The sample files used by the extension tests import with the same results (same summaries and counts).
- [ ] Exported Postman collection imports into Postman (manual check). Exported OpenAPI has the required fields
  and imports again; a formal validator run is still to do.
- [x] No secret values in exports without "include secrets".
