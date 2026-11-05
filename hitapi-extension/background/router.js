/**
 * background/router.js — maps each message type to the module that handles it.
 *
 * Every reply has the same shape:
 *   { success: true,  data }
 *   { success: false, error, code }
 */

import { MSG } from '../shared/messages.js';
import * as session from './auth/session.js';
import * as capture from './capture/service.js';
import * as projects from './flows/projects.js';
import * as flows from './flows/flows.js';
import * as bugs from './bugs/bugs.js';
import * as openapi from './openapi/import.js';
import * as agent from './agent/local-agent.js';

const handlers = {
  [MSG.LOGIN]: (m) => session.login(m.email, m.password),
  [MSG.LOGOUT]: () => session.logout(),
  [MSG.GET_AUTH_STATE]: () => session.getAuthState(),

  [MSG.GET_TAB_INFO]: (m) => capture.getTabInfo(m.tabId),
  [MSG.START_MONITORING]: (m) => capture.startMonitoring(m.tabId),
  [MSG.STOP_MONITORING]: (m) => capture.stopMonitoring(m.tabId),
  [MSG.GET_MONITOR_STATE]: (m) => capture.getMonitorState(m.tabId),
  [MSG.CLEAR_CAPTURED]: (m) => capture.clearCaptured(m.tabId),

  [MSG.LIST_PROJECTS]: () => projects.listProjects(),
  [MSG.CREATE_PROJECT]: (m) => projects.createProject(m),
  [MSG.LIST_FLOW_SUITES]: (m) => flows.listSuites(m.projectId),
  [MSG.RUN_FLOW_SUITE]: (m) => flows.runSuite(m.projectId, m.flowId),
  [MSG.GET_FLOW_RUN_STATUS]: (m) => flows.getRunStatus(m.projectId, m.flowId, m.runId),
  [MSG.SHOW_RUN_RESULT]: (m) => flows.showRunResult(m),
  [MSG.QUICK_CREATE_FROM_CAPTURE]: (m) => flows.quickCreate(m),

  [MSG.REPORT_BUG]: (m) => bugs.reportBug(m),

  [MSG.IMPORT_OPENAPI]: (m) => openapi.importOpenApi(m),

  [MSG.GET_AGENT_STATE]: () => agent.getState(),
  [MSG.SET_AGENT_STATE]: (m) => agent.setEnabled(!!m.enabled),
};

export function registerRouter() {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Only our own pages (popup, DevTools panel) may call the background.
    if (sender.id !== chrome.runtime.id || !String(sender.url || '').startsWith(chrome.runtime.getURL(''))) return false;

    const handler = handlers[msg?.type];
    if (!handler) {
      sendResponse({ success: false, error: `Unknown message: ${msg?.type}` });
      return false;
    }
    Promise.resolve()
      .then(() => handler(msg))
      .then(data => sendResponse({ success: true, data: data ?? null }))
      .catch(err => {
        console.warn('[HitAPI]', msg.type, err?.message);
        sendResponse({ success: false, error: err?.message || 'Something went wrong', code: err?.code || null });
      });
    return true; // reply is async
  });
}
