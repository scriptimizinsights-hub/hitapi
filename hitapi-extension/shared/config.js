/**
 * shared/config.js — every tunable value in one place.
 * Imported by the background worker, the popup and the DevTools panel.
 */

export const API_BASE = 'https://services.hitapi.dev/api';
export const DASHBOARD_URL = 'https://hitapi.dev';

export const CAPTURE = {
  MAX_REQUESTS: 100,          // per tab, newest first
  MAX_BODY_CHARS: 10_000,     // request bodies are truncated beyond this
  PERSIST_DEBOUNCE_MS: 250,   // batch storage writes while a page fires many requests
};

export const AGENT = {
  ALARM: 'hitapi-local-agent-poll',  // wakes the worker if Chrome stopped it
  ALARM_PERIOD_MIN: 0.5,             // Chrome's minimum
  FAST_POLL_MS: 2_000,               // HitAPI waits up to 25 s per local step
  REQUEST_TIMEOUT_MS: 20_000,        // must stay below the worker's 25 s wait
  MAX_RESPONSE_CHARS: 200_000,
};

export const RUN = {
  POLL_MS: 2_000,
  MAX_WAIT_MS: 10 * 60 * 1000,
};

/** Port name the popup / DevTools panel use for live updates. */
export const LIVE_PORT = 'hitapi-live';
