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
