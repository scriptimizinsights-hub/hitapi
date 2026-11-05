# Flow Suite Management and Execution

The popup can add captured requests to HitAPI flow suites and start suite runs.

## Add a captured request

1. Select a project in the popup.
2. Capture a request, then expand it.
3. Choose an existing suite and select **Add**, or create a new suite by name.

The extension sends the captured method, URL, request headers, and body to HitAPI to create a flow step. It omits `cookie`, `host`, `content-length`, `connection`, `origin`, and `referer` headers before sending the request to the backend.

## Run a suite

1. Open **Run Suites**.
2. Select **Run** on a suite.
3. The popup polls the run status until it completes and displays the passed and failed step counts. The extension badge shows the resulting count and pass/fail state.

## Current boundaries

- Suite contents and run details are managed by the HitAPI service; this popup shows suite names, step counts, run state, and aggregate pass/fail totals.
- The popup does not provide suite editing or per-step response inspection.
- A request marked as added is tracked in popup state only; that visual marker is not a persistent server-side indication.