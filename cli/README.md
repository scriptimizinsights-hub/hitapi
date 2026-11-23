# hitapi-cli

Run the API tests you build in the **HitAPI** browser extension from the command line and in CI —
GitHub Actions, GitLab CI, Jenkins, Azure Pipelines, anything with Node.js 20+.

It uses the extension's own code for requests, `{{variables}}`, tests and "Set vars", so a run in CI
behaves like a run in the Workbench.

```bash
npx hitapi-cli run my-api.hitapi.json --env-file staging.env --junit results.xml
```

## What it runs

| File | Where it comes from |
|---|---|
| HitAPI collection (`*.hitapi.json`) | Workbench: collection ⋯ → **Export to a file**, or **Publish to GitHub** |
| HitAPI scenario (`*.scenario.json`) | Workbench: scenario ⋯ → **Export for the CLI (CI)**, or **Publish to GitHub** |
| HitAPI backup | Workbench: ☁ Backup → **Export all** (runs its scenarios; `--collection NAME` for a collection) |
| Postman collection v2.0 / v2.1 | Postman: Export. Test scripts are converted the same way as the Workbench import |

Pass several files (or a glob) to run them all: `hitapi run tests/*.json`.

## Variables

Exported files never contain secrets: a header or auth value is kept only when it is a `{{variable}}`
reference, and secret variables are left empty. Give the values when you run:

| Source | Example |
|---|---|
| `--env-file` | a Postman environment, a HitAPI backup (`--env Staging` picks one), `{"token": "…"}` JSON, or `NAME=value` lines |
| `HITAPI_VAR_<name>` | `HITAPI_VAR_token=${{ secrets.API_TOKEN }}` — the way to pass CI secrets |
| `--var name=value` | `--var baseUrl=https://staging.example.com` |

Later sources win (`--var` over `HITAPI_VAR_*` over the file). Values of `HITAPI_VAR_*` variables and of
variables whose name looks secret (token, key, password, secret…) are blanked out (`••••••`) of
everything the CLI prints and writes.

A missing variable fails that request with a message naming it, e.g.
`Not defined: {{token}} — give a value with --var, --env-file or HITAPI_VAR_token`.

## Options

```
hitapi run <file…>
  --env-file <file>     --env <name>     --var <name=value> (repeat)
  --folder <name>       only one folder of a collection ("Orders" or "Shop/Orders")
  --scenario <name>     --collection <name>   (backup files)
  --data <file>         CSV or JSON rows: one run per row
  --reporter cli|json|junit   what is printed (default cli)
  --junit <file>        also write JUnit XML     --json <file>  also write JSON
  --bail                stop at the first failure
  --timeout <ms>        per request (default: the request's own setting, 30 s)
  --delay <ms>          wait between requests
  --export-env <file>   write the variables at the end, including ones set by "Set vars"
```

Exit code: **0** all passed · **1** a request failed · **2** wrong usage or unreadable file.

A request passes when all its tests pass; with no tests, when the status is below 400 — the same rule as
the Workbench.

## Run a cloud flow suite

```bash
HITAPI_API_KEY=hk_… npx hitapi-cli cloud run --project <project-id> --suite <suite-id> --junit cloud.xml
```

Create the key in HitAPI (sidebar → key icon → **API keys**). The command starts the suite, waits for it
(`--timeout` seconds, default 600; `--no-wait` to just start it) and exits 1 if a step failed.
`--api` (or `HITAPI_API_URL`) points it at another HitAPI server.

## CI examples

- [GitHub Actions](examples/github-actions.yml) — the extension's **Publish to GitHub** writes this for you
- [GitLab CI](examples/gitlab-ci.yml)

## Differences from the Workbench

- No browser: headers such as `Cookie`, `Origin` and `User-Agent` are sent exactly as written; there is no cookie jar ("Send cookies" is ignored).
- XPath tests need a browser and fail with "XPath is not available here". JSONPath, header, status, time, body and JSON Schema tests work.
- Binary and file form fields are not sent (no file picker).
- OAuth 2.0 client-credentials tokens are fetched once per run.

## Development

The shared code lives in `../hitapi-extension/shared` and is copied into `src/shared` by
`npm run copy-shared` (also run by `npm test` and before `npm pack` / `npm publish`).

```bash
npm test            # copies the shared code, then runs test/*.test.mjs
npm publish         # publishes hitapi-cli to npm (the workflow above uses npx hitapi-cli)
```
