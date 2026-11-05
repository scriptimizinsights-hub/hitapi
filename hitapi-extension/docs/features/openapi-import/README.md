# OpenAPI Import

Import an OpenAPI 3 or Swagger 2 spec, in **JSON or YAML**, into the selected project.

## Use

1. Select a project and select **📥** next to the project picker.
2. Paste the spec URL, for example `http://localhost:3000/openapi.json`, `/v3/api-docs` or `/openapi.yaml`. If the current tab is showing a spec file, its URL is filled in for you.
3. Select **Import**. The popup shows how many new endpoints were added and how many existing ones were updated.

## How it works

- The extension downloads the spec itself. It has permission to reach any site, so CORS doesn't block it, and localhost works.
- If that fails, it retries from inside the current tab, which helps for docs behind a login.
- The spec is checked before it is sent. You get a specific message if the URL is a web page (such as the Swagger UI page) instead of a spec, if the file isn't valid JSON or YAML, if it has no `openapi`/`swagger` field, or if it has no paths.
- Importing the same spec again doesn't create duplicates. Endpoints that already exist (same method and path, including ones captured by the extension) are updated with the spec's details.

## Privacy

The spec is sent to HitAPI. Don't import specs that contain secrets.
