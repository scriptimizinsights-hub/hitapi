# Account and Project Management

The popup connects to a HitAPI account and uses its projects as the workspace for imported API specs, captured requests, and flow suites.

## Available actions

- Sign in with a HitAPI email and password.
- Sign out and clear the saved HitAPI login token and user record from extension storage.
- List projects associated with the signed-in account and select the active project.
- Create a project with a name and base URL. New projects are created with the `development` environment.

When the account has at least one project, the popup selects the first project by default. Project and suite data are fetched from the HitAPI API; the login token is stored in `chrome.storage.local` and attached to authenticated API requests.

## Requirements and limits

- An active network connection and a valid HitAPI account are required for account and project operations.
- This extension UI does not currently provide password reset, account creation, project editing, or project deletion. Account registration is linked from the sign-in view to hitapi.dev.
- Signing out removes the HitAPI login token and user record. It does not clear captured requests or detected bearer tokens.