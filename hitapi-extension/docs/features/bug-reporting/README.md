# Bug Reporting

Open a captured request and select **🐛 Report as bug**.

1. Choose a severity. It defaults to **high** for 5xx and failed requests, otherwise **medium**.
2. Optionally describe what went wrong.
3. Select **Report bug**.

The bug is created in the selected project with:

- a title such as `GET /api/cart — HTTP 404`
- your note
- the full request (method and URL), status, duration and capture time
- request headers, request body (pretty-printed when it's JSON, up to 4,000 characters) and response headers

Credentials (`Authorization`, cookies, API keys, CSRF tokens) are masked before anything is sent.

If reporting fails (no network, project removed, session expired), the popup shows the reason. It never shows a false "✓ Bug reported".
