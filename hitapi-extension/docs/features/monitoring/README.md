# API Monitoring and Request Capture

Capture the API calls a browser tab makes, then save them as test steps or report them as bugs.

## Use

1. Open a website, then open the HitAPI popup.
2. Sign in and select or create a project.
3. Select **▶ Start**. The popup shows **● Capturing this tab**.
4. Use the site. Requests appear in the **Capture** tab as they happen.
5. Select a request to add it to a suite or report it as a bug. **Clear** empties the list; **■ Stop** ends capture.

## What is captured

- Every `fetch` / `XMLHttpRequest` the tab makes, **including calls to other domains** (for example `app.example.com` calling `api.example.com`).
- Method, URL, status, duration, request headers, request body (up to 10,000 characters), and response headers.
- Requests that fail without a response (connection refused, CORS errors) are listed as **ERR** with the reason.
- Not captured: analytics and telemetry hosts, static files (scripts, styles, images, fonts), CORS preflight (`OPTIONS`) requests, and requests cancelled by page navigation.

## How it behaves

- Capture is per tab. Each tab's toolbar badge shows its own count, and capture keeps running while you use other tabs.
- The list updates live while the popup is open. Your scroll position, an open request, a chosen suite and anything you've typed are kept as new requests arrive.
- Captured requests are kept in `chrome.storage.session`, so capture keeps working when Chrome pauses the extension's background worker. They are held in memory only, never written to disk, and are cleared when you close the tab or quit Chrome.
- Each tab keeps the 100 most recent requests.

## Privacy

Request headers and bodies can contain credentials or personal data. They stay in the extension until you choose to save a request to HitAPI. When you do, credentials and browser-set headers are removed first (see [Flow suites](../flow-suites/README.md)).
