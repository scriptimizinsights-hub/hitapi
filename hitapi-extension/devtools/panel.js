/**
 * devtools/panel.js — the HitAPI panel inside DevTools. It is the same app as
 * the toolbar popup, shown for the tab DevTools is inspecting, so you can
 * capture and save requests without the popup closing on every click.
 */

import { startApp } from '../ui/app.js';

startApp(document.getElementById('app'), chrome.devtools.inspectedWindow.tabId);
