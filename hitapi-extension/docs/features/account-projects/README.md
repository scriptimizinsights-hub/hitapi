# Account and Project Management

## Available actions

- Sign in with your HitAPI email and password. If the password is wrong, the error is shown and your email stays filled in.
- Sign out. This removes the saved login from the extension.
- Choose a project. The popup remembers the last project you used.
- Create a project with **+ New**. The base URL is pre-filled with the current tab's site.

## Expired sessions

If HitAPI rejects the saved login (expired or revoked), the extension removes it and every open popup returns to the sign-in screen with "Your session has expired. Please sign in again."

## Storage

The login token and your name are kept in `chrome.storage.local` and sent only to the HitAPI API.

## Not available in the extension

Account creation (linked to hitapi.dev), password reset, and editing or deleting projects are done on the dashboard.
