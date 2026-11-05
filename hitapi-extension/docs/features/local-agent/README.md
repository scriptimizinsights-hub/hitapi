# Local Agent

The optional Local Agent lets HitAPI enqueue HTTP jobs for the browser extension to execute, including requests to local development APIs.

## Use

1. Sign in to HitAPI in the extension popup.
2. Turn on **Local Agent**.
3. Keep the extension installed and signed in while jobs are needed. The agent checks for jobs immediately when enabled and then approximately every 30 seconds.
4. Turn the toggle off to stop scheduled polling.

For each queued job, the extension sends the configured method, URL, headers, and body using the browser's `fetch`. It posts the response status and headers back to HitAPI, with a JSON response body or text truncated to 2,000 characters. Network errors are reported as job errors.

## Security note

The Local Agent executes request URLs and headers supplied by queued HitAPI jobs. Enable it only for an account and environment you trust, and be cautious with access to localhost and private-network services. The current popup does not show a host allowlist, job preview, or per-job approval. An authenticated HitAPI account is required for job polling and result reporting.