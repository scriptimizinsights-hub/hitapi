# Bearer Token Detection

While monitoring an origin, the extension checks captured request headers for an `Authorization` value beginning with `Bearer `. A detected token is saved in `chrome.storage.local` with its origin and detection time. The popup shows a token-detected notice and offers a **Copy** action.

## Scope and privacy

- Detection applies to matching requests observed while monitoring is active.
- The extension stores the most recently detected token for each origin; stopping capture does not remove it.
- The popup currently offers no token deletion or redaction control. Clear extension data or remove the `detectedTokens` entry from extension storage to delete it.
- Treat the token as a secret. Anyone who can access the browser profile or extension storage may be able to access it. The token is not automatically sent to HitAPI by detection itself.