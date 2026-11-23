/**
 * ui/app.js — builds the screen and decides which part redraws when.
 * Shared by the toolbar popup (popup/) and the DevTools panel (devtools/).
 *
 * Each region redraws only when the state it shows changes. The scrolling
 * area itself is never replaced, so the list keeps its scroll position.
 */

import { h, mount } from './core/dom.js';
import { createStore } from './core/store.js';
import { subscribe } from './core/bridge.js';
import { createActions } from './actions.js';
import { LoginView } from './views/login.js';
import { HeaderView } from './views/header.js';
import { AgentBarView } from './views/agent-bar.js';
import { MonitorBarView } from './views/monitor-bar.js';
import { TabsView } from './views/tabs.js';
import { ProjectBarView } from './views/project-bar.js';
import { createCapturePanel } from './views/capture-panel.js';
import { SuitesPanelView } from './views/suites-panel.js';
import { FooterView } from './views/footer.js';
import { WorkbenchCardView } from './views/workbench-card.js';
import { SignInPromptView } from './views/sign-in-prompt.js';

const INITIAL = {
  screen: 'loading',      // 'loading' | 'login' | 'main'
  user: null,
  authMessage: '',
  tabId: null,
  tabInfo: null,
  monitor: { active: false, origin: null, token: null },
  requests: [],
  addedIds: new Set(),
  projects: [],
  projectId: null,
  projectsLoading: false,
  projectsError: '',
  suites: [],
  suitesLoading: false,
  runs: {},               // suiteId → { state, passed, failed, error }
  agent: { enabled: false },
  tab: 'capture',          // 'capture' | 'suites' | 'workbench' (DevTools panel only)
  mode: 'popup',           // 'popup' | 'panel'
  wbShortcut: '',          // keyboard shortcut for the Workbench, as Chrome reports it
  wbNew: false,            // show "New" on the Workbench card after updating to 1.7
  showNewProject: false,
  showImport: false,
};

/**
 * @param {HTMLElement} root
 * @param {number} tabId   the tab this UI shows
 * @param {{ mode?: 'popup'|'panel' }} [opts]
 */
export function startApp(root, tabId, { mode = 'popup' } = {}) {
  const store = createStore({ ...INITIAL, mode });
  const actions = createActions(store);

  // Regions of the main screen
  const regions = {
    header: h('div'),
    hero: h('div'),
    agent: h('div'),
    monitor: h('div'),
    tabs: h('div'),
    top: h('div'),
    main: h('div'),
    footer: h('div'),
  };
  const content = h('div', { class: 'content', id: 'content' }, regions.top, regions.main);
  // DevTools panel: the Workbench page, embedded once and kept (moving an iframe reloads it)
  const workbenchPane = h('div', { class: 'wb-pane-embed', hidden: true });
  const shell = h('div', { class: 'shell' },
    regions.header, regions.hero, regions.agent, regions.monitor, regions.tabs, content, workbenchPane, regions.footer);

  let capturePanel = null;

  const draw = {
    header: () => mount(regions.header, HeaderView(store, actions)),
    hero: () => mount(regions.hero, store.state.mode === 'popup' ? WorkbenchCardView(store, actions) : null),
    agent: () => mount(regions.agent, store.state.user ? AgentBarView(store, actions) : null),
    monitor: () => mount(regions.monitor, MonitorBarView(store, actions)),
    tabs: () => mount(regions.tabs, TabsView(store, actions)),
    top: () => mount(regions.top, store.state.user ? ProjectBarView(store, actions) : SignInPromptView(store, actions)),
    footer: () => mount(regions.footer, FooterView(store)),
    main: () => {
      const { tab } = store.state;
      const onWorkbench = tab === 'workbench';
      content.hidden = onWorkbench;
      workbenchPane.hidden = !onWorkbench;
      regions.monitor.hidden = onWorkbench;
      if (onWorkbench) {
        if (!workbenchPane.firstChild) {
          workbenchPane.append(h('iframe', {
            class: 'wb-frame', title: 'HitAPI Workbench',
            src: chrome.runtime.getURL('workbench/workbench.html?embed=panel'),
          }));
        }
        return;
      }
      if (tab === 'capture') {
        capturePanel = createCapturePanel(store, actions);
        mount(regions.main, capturePanel.el);
      } else {
        capturePanel = null;
        mount(regions.main, SuitesPanelView(store, actions));
      }
    },
  };

  function drawScreen() {
    const { screen } = store.state;
    if (screen === 'loading') { mount(root, h('div', { class: 'empty' }, h('span', { class: 'spinner' }))); return; }
    if (screen === 'login') { mount(root, LoginView(store, actions)); return; }
    Object.values(draw).forEach(fn => fn());
    mount(root, shell);
  }

  const onMain = (fn) => () => { if (store.state.screen === 'main') fn(); };

  store.watch(['screen'], drawScreen);
  store.watch(['user'], onMain(() => { draw.header(); draw.agent(); draw.top(); draw.footer(); draw.tabs(); draw.main(); }));
  store.watch(['wbShortcut', 'wbNew'], onMain(draw.hero));
  store.watch(['agent'], onMain(draw.agent));
  store.watch(['monitor', 'tabInfo'], onMain(() => { draw.monitor(); capturePanel?.onMonitor(); }));
  store.watch(['requests', 'suites', 'tab'], onMain(draw.tabs));
  store.watch(['projects', 'projectId', 'projectsLoading', 'projectsError', 'showNewProject', 'showImport'], onMain(draw.top));
  store.watch(['projects', 'projectId'], onMain(draw.footer));
  store.watch(['tab'], onMain(draw.main));
  store.watch(['requests'], onMain(() => capturePanel?.onRequests()));
  store.watch(['suites', 'projectId', 'addedIds'], onMain(() => capturePanel?.onSuites()));
  store.watch(['suites', 'runs', 'suitesLoading', 'projectId'], onMain(() => { if (store.state.tab === 'suites') draw.main(); }));

  drawScreen();
  const unsubscribe = subscribe(tabId, actions.onLiveEvent);
  window.addEventListener('pagehide', unsubscribe);
  actions.init(tabId);
  return { store, actions };
}
