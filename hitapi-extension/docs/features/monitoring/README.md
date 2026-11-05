# API Monitoring and Request Capture

The popup can monitor HTTP API requests for the origin of the active browser tab.

## Use

1. Open a regular website tab and open the HitAPI extension popup.
2. Sign in and select or create a HitAPI project.
3. Select **Start** in the monitor bar.
4. Interact with the site. Captured requests appear in the **Capture** tab.
5. Expand a request to add it to a flow suite or report a bug. Use **Clear** to remove the current list, or **Stop** to end monitoring.

## Captured data and filtering

For completed `xmlhttprequest` requests, the extension records method, URL, request headers, request body when available, timestamp, and response status. It displays the URL path, method, and status in the list. Requests with common analytics, telemetry, font, CDN, static-asset, and HitAPI service URL patterns are filtered out.

Monitoring is keyed by origin, not by individual tab. Requests to that origin can therefore be captured from other tabs while monitoring is active. The popup refreshes the displayed list every 1.5 seconds while open.

## Limits and privacy

- The capture list is held in background service-worker memory, is limited to 100 completed requests per origin, and is not restored after the worker or browser restarts.
- Only `xmlhttprequest` traffic is observed. Response bodies, response headers, and request duration are not captured.
- Requests that fail before completion are discarded from the list.
- Request headers and bodies may contain credentials or personal data. Capture is local to the extension until a user sends a request to HitAPI, such as adding it to a suite. Review sensitive values before doing so.