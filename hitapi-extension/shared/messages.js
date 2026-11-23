/**
 * shared/messages.js — names of every message the UI sends to the background.
 * Using constants (not string literals) means a typo fails loudly.
 */

export const MSG = Object.freeze({
  // auth
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  GET_AUTH_STATE: 'GET_AUTH_STATE',

  // capture (all take a tabId)
  GET_TAB_INFO: 'GET_TAB_INFO',
  START_MONITORING: 'START_MONITORING',
  STOP_MONITORING: 'STOP_MONITORING',
  GET_MONITOR_STATE: 'GET_MONITOR_STATE',
  CLEAR_CAPTURED: 'CLEAR_CAPTURED',

  // projects & flow suites
  LIST_PROJECTS: 'LIST_PROJECTS',
  CREATE_PROJECT: 'CREATE_PROJECT',
  LIST_FLOW_SUITES: 'LIST_FLOW_SUITES',
  RUN_FLOW_SUITE: 'RUN_FLOW_SUITE',
  GET_FLOW_RUN_STATUS: 'GET_FLOW_RUN_STATUS',
  QUICK_CREATE_FROM_CAPTURE: 'QUICK_CREATE_FROM_CAPTURE',
  SHOW_RUN_RESULT: 'SHOW_RUN_RESULT',

  // bugs
  REPORT_BUG: 'REPORT_BUG',

  // OpenAPI import
  IMPORT_OPENAPI: 'IMPORT_OPENAPI',

  // Request Workbench
  OPEN_WORKBENCH: 'OPEN_WORKBENCH',            // { tabId?, requestId? }
  WB_APPLY_HEADER_RULE: 'WB_APPLY_HEADER_RULE', // { tabId, url, method, headers } → { ruleId }
  WB_REMOVE_HEADER_RULE: 'WB_REMOVE_HEADER_RULE', // { ruleId }
  WB_GET_NET_ERROR: 'WB_GET_NET_ERROR',        // { url } → { code, message } | null
  WB_LIST_TOKENS: 'WB_LIST_TOKENS',            // → [{ value, origin, at }] bearer tokens seen while capturing
  WB_PUSH_ENDPOINTS: 'WB_PUSH_ENDPOINTS',      // { projectId, endpoints } → { created, skipped, failed }
  WB_PULL_ENDPOINTS: 'WB_PULL_ENDPOINTS',      // { projectId } → { endpoints }
  WB_PUSH_FLOW: 'WB_PUSH_FLOW',                // { projectId, name, steps } → { suiteId, steps }
  WB_GET_FLOW: 'WB_GET_FLOW',                  // { projectId, suiteId } → { suite, steps }
  WB_SYNC_GET: 'WB_SYNC_GET',                  // → { docs }
  WB_SYNC_PUT: 'WB_SYNC_PUT',                  // { kind, data, baseVersion, device } → { version } | { conflict, current }
  WB_SYNC_DELETE: 'WB_SYNC_DELETE',            // remove the cloud copy
  WB_RUN_SCHEDULE: 'WB_RUN_SCHEDULE',          // run a scheduled run now → run record
  WB_NEXT_RUNS: 'WB_NEXT_RUNS',                // { scheduleId: next run time }

  // local agent
  GET_AGENT_STATE: 'GET_AGENT_STATE',
  SET_AGENT_STATE: 'SET_AGENT_STATE',
});

/** Events the background pushes to subscribed UIs over the live port. */
export const EVENT = Object.freeze({
  REQUESTS: 'requests',          // { tabId, requests }
  MONITOR: 'monitor',            // { tabId, active, origin, token }
  AUTH_EXPIRED: 'auth-expired',  // {}
  AGENT: 'agent',                // { enabled, lastPollOk, lastError }
});

/** Error codes the UI can react to. */
export const ERR = Object.freeze({
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  NOT_LOGGED_IN: 'NOT_LOGGED_IN',
  NETWORK: 'NETWORK',
});
