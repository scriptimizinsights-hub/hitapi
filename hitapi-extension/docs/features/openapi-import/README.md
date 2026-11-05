# OpenAPI Import

Import an OpenAPI/Swagger JSON document into the selected HitAPI project.

## Use

1. Open the extension popup and select a project.
2. Enter a URL that returns an OpenAPI JSON document in **Import Swagger from this tab**.
3. Select **Import**. The popup reports how many endpoints were imported when the service responds successfully.

The extension fetches the URL from the active tab's page context, reads the response as JSON, and posts the specification to the HitAPI project import endpoint.

## Requirements and limits

- The user must be signed in and have a project selected.
- The active tab must permit the page-context fetch. Browser origin and CORS restrictions may prevent fetching a URL from a different origin.
- The current implementation expects JSON; it does not parse YAML or upload a local file.
- The OpenAPI document is sent to HitAPI for import. Avoid importing specifications containing secrets or data that should not be shared with the service.