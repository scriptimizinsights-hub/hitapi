# Flow Suite Management and Execution

## Add a captured request to a suite

1. Select a project.
2. In **Capture**, select a request to open it.
3. Choose an existing suite, or **➕ New suite…** and type a name.
4. Select **+ Add**.

What gets saved:

- method, URL and request body (bodies over 10,000 characters are skipped, and the toast says so)
- headers your API needs, such as `Content-Type` or custom `X-…` headers
- **not saved:** credentials (`Authorization`, cookies, API keys, CSRF tokens) and headers the browser sets itself (`User-Agent`, `sec-*`, `Accept-Language`, `Origin`, `Referer`, and similar). The HitAPI server applies the same filter.
- **login token:** for a new suite, you can tick "Save this request's login token on the new suite". It is stored once as the suite's static token. Existing suites keep their own auth settings.

If saving fails, the popup shows the reason instead of a success message.

## Run a suite

1. Open **▶ Run suites**.
2. Select **▶ Run**. The card shows progress, then the passed and failed counts, and the toolbar badge shows the result.

- A suite with no steps can't be run; its button is disabled.
- If a run can't start, or a status check fails, the card shows the reason and the button is usable again.
- Suites whose steps call `localhost` need the [Local Agent](../local-agent/README.md).

## Not available in the extension

Editing steps and viewing per-step responses are done on the dashboard.
