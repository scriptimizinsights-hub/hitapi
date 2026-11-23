/**
 * background/index.js — service worker entry point.
 *
 * Only wiring lives here. Every listener is registered synchronously at the
 * top level, which is what lets Chrome wake the worker for those events.
 *
 *   api/        HitAPI backend client
 *   auth/       sign in / out, expired sessions
 *   capture/    webRequest capture, per-tab state, detected tokens
 *   flows/      projects and flow suites
 *   bugs/       bug reports
 *   openapi/    OpenAPI / Swagger import
 *   agent/      Local Agent (runs localhost steps for HitAPI)
 *   workbench/  Request Workbench: open it, protected headers, network errors, scheduled runs
 *   ui/         toolbar badge, context menu
 *   live.js     pushes changes to open popups / DevTools panels
 *   router.js   message type → handler
 */

import { registerRouter } from './router.js';
import { registerLivePort } from './live.js';
import { registerCaptureListeners } from './capture/listeners.js';
import { registerSessionExpiry, onSessionChange } from './auth/session.js';
import { registerLocalAgent, start as startAgent, isEnabled as agentEnabled, stop as stopAgent } from './agent/local-agent.js';
import { registerContextMenu } from './ui/context-menu.js';
import { registerNetErrors } from './workbench/net-errors.js';
import { registerWorkbenchEntry } from './workbench/entry.js';
import { registerScheduler } from './workbench/scheduler.js';
import { clearStaleRules } from './workbench/protected-headers.js';
import { removeLegacyData } from './storage.js';
import * as badge from './ui/badge.js';
import * as captureStore from './capture/store.js';

registerRouter();
registerLivePort();
registerCaptureListeners();
registerSessionExpiry();
registerLocalAgent();
registerContextMenu();
registerNetErrors();
registerWorkbenchEntry();
registerScheduler();

onSessionChange('login', () => agentEnabled().then(on => on && startAgent()));
onSessionChange('logout', () => { stopAgent(); badge.clearAll(); });

captureStore.ready();
removeLegacyData();
clearStaleRules();
