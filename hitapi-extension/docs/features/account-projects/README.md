# Account and Project Management

Signing in is **optional**. Without an account the popup opens straight to the app: the Workbench and
capture work, and a **Sign in to save to HitAPI** card explains what an account adds. Sign in from that
card or the **Sign in** button in the header; **← Continue without signing in** goes back.

An account is needed to save captured requests to a project, run flow suites, report bugs, import a spec
into a project and use the Local Agent (its switch is hidden while signed out).

## Available actions

- Sign in with your HitAPI email and password. If the password is wrong, the error is shown and your email stays filled in.
- Sign out. This removes the saved login from the extension; the popup stays open in signed-out mode.
- Choose a project. The popup remembers the last project you used.
- Create a project with **+ New**. The base URL is pre-filled with the current tab's site.

## Expired sessions

If HitAPI rejects the saved login (expired or revoked), the extension removes it and every open popup shows the sign-in screen with "Your session has expired. Please sign in again." You can sign in again or continue without an account.

## Storage

The login token and your name are kept in `chrome.storage.local` and sent only to the HitAPI API.

## Not available in the extension

Account creation (linked to hitapi.dev), password reset, and editing or deleting projects are done on the dashboard.
