/**
 * background/ui/badge.js — the number / result shown on the toolbar icon.
 *
 * Capture counts are per tab, so each tab shows its own number.
 * A suite run result is shown on every tab that isn't capturing.
 */

const COLOR = { capture: '#8264ff', pass: '#23d18b', fail: '#ff5c5c' };

function safe(p) { return p?.catch?.(() => {}); }

export function showCaptureCount(tabId, count) {
  safe(chrome.action.setBadgeText({ tabId, text: String(count) }));
  safe(chrome.action.setBadgeBackgroundColor({ tabId, color: COLOR.capture }));
}

/** Remove the tab's own badge so the global one (if any) shows again. */
export function clearTab(tabId) {
  safe(chrome.action.setBadgeText({ tabId, text: '' }));
}

export function showRunResult(passed = 0, failed = 0) {
  const text = failed > 0 ? `${failed}✗` : `${passed}✓`;
  safe(chrome.action.setBadgeText({ text }));
  safe(chrome.action.setBadgeBackgroundColor({ color: failed > 0 ? COLOR.fail : COLOR.pass }));
}

export function clearAll() {
  safe(chrome.action.setBadgeText({ text: '' }));
}
