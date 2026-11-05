# Local Agent

HitAPI's servers can't reach `localhost` on your machine. The Local Agent lets suite steps that call your local API run from your browser instead.

## Use

1. Sign in to the extension.
2. Turn on **Local Agent**. Within a couple of seconds it shows **Connected**, and the dashboard shows the agent as connected.
3. Run a suite on hitapi.dev or from the popup. Steps whose URL is local are sent to the extension, run in your browser, and the results go back to HitAPI.

## How it works

- While it's on, the extension asks HitAPI for work every 2 seconds. HitAPI waits up to 25 seconds for each local step, so steps are picked up well in time.
- A Chrome alarm restarts polling if Chrome pauses the background worker, and polling resumes after you sign in again.
- Each job has 20 seconds to respond. If your local server is down, the step fails with "Couldn't reach … Is your local server running?". If the agent is off, the step fails after 25 seconds with a message asking you to turn it on.

## Safety

- The agent only calls local or private-network addresses: `localhost`, `127.x`, `::1`, `*.local`, `10.x`, `192.168.x` and `172.16–31.x`. Anything else is refused.
- Requests are sent without your browser cookies.
- Turn the agent off when you don't need it.
