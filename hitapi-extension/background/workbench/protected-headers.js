/**
 * background/workbench/protected-headers.js — sends headers that fetch()
 * is not allowed to set (Cookie, Origin, Referer, User-Agent, …).
 *
 * Just before the Workbench sends a request, it asks for a temporary
 * declarativeNetRequest session rule that sets those headers on exactly that
 * request: started by this extension, same method, same URL, and (for the
 * Workbench tab) the same tab. The Workbench inside DevTools has no tab id. The rule is removed as soon as
 * the response arrives (and after 2 minutes at the latest).
 * Needs the "declarativeNetRequestWithHostAccess" permission.
 */

const FIRST_ID = 9000;          // rule ids used by the Workbench
const MAX_AGE_MS = 2 * 60 * 1000;
const STANDARD = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'connect'];

let nextId = FIRST_ID;
const timers = new Map();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {{ tabId: number, url: string, method: string, headers: Record<string,string>, remove?: string[] }} req
 * @returns {Promise<{ ruleId: number }>}
 */
export async function applyRule({ tabId, url, method, headers, remove = [] }) {
  const entries = Object.entries(headers || {}).filter(([k]) => k);
  const setNames = new Set(entries.map(([k]) => k.toLowerCase()));
  const removals = remove.filter(k => k && !setNames.has(String(k).toLowerCase()));
  if (!entries.length && !removals.length) return { ruleId: null };

  const id = nextId++;
  if (nextId > FIRST_ID + 900) nextId = FIRST_ID;
  const m = String(method || 'GET').toLowerCase();
  const condition = {
    initiatorDomains: [chrome.runtime.id],   // only requests this extension makes
    requestMethods: [STANDARD.includes(m) ? m : 'other'],
    resourceTypes: ['xmlhttprequest', 'other'],
  };
  if (typeof tabId === 'number' && tabId >= 0) condition.tabIds = [tabId];
  // A regex matches the URL exactly; very long URLs fall back to a prefix match.
  const regex = `^${escapeRegex(url)}$`;
  if (regex.length <= 1800) condition.regexFilter = regex;
  else condition.urlFilter = `|${url.slice(0, 1500)}`;

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [id],
    addRules: [{
      id,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        requestHeaders: [
          ...entries.map(([header, value]) => ({ header, operation: 'set', value: String(value) })),
          ...removals.map(header => ({ header, operation: 'remove' })),
        ],
      },
      condition,
    }],
  });
  timers.set(id, setTimeout(() => removeRule({ ruleId: id }), MAX_AGE_MS));
  return { ruleId: id };
}

export async function removeRule({ ruleId }) {
  if (ruleId == null) return { ok: true };
  clearTimeout(timers.get(ruleId));
  timers.delete(ruleId);
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] }).catch(() => {});
  return { ok: true };
}

/** Remove rules left over if the worker stopped while a request was running. */
export async function clearStaleRules() {
  try {
    const rules = await chrome.declarativeNetRequest.getSessionRules();
    const ids = rules.map(r => r.id).filter(id => id >= FIRST_ID && id < FIRST_ID + 1000);
    if (ids.length) await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids });
  } catch { /* API unavailable */ }
}
