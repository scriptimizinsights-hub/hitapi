# Bearer Token Detection

While a tab is being captured, the extension looks for an `Authorization: Bearer …` header on its requests. When it finds one, the Capture tab shows **🔑 Bearer token detected** with a masked preview (for example `eyJh••••••oken`) and a **Copy** button.

## Using the token

When you create a **new** suite from a captured request that carried a token, you can choose to save the token on that suite. The suite's steps then run as you. The token is stored once, as the suite's login token, and is never copied into individual steps.

## Privacy

- The token is kept in `chrome.storage.session`: in memory only, never written to disk, and cleared when the tab closes or Chrome quits.
- Older versions kept detected tokens on disk (`detectedTokens` in `chrome.storage.local`). Version 1.6 deletes that data automatically.
- Detection by itself never sends a token anywhere.
