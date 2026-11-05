# Bug Reporting

The **Report as bug** action is available after expanding a captured request. It creates a manual bug in the currently selected HitAPI project.

The submitted bug uses a title based on the request method and URL path, a standard description indicating it came from the browser extension, and `medium` severity. The current implementation does not include the captured request body, headers, response, or status in the bug report.

You must be signed in and have a project selected. The popup displays a success toast after the report request resolves; it does not currently show a bug detail view or let you edit the report before submission.