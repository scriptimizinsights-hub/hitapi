/**
 * background/ui/context-menu.js — right-click menu on web pages.
 */

import { isWebUrl } from '../../shared/url.js';
import { startMonitoring } from '../capture/service.js';

const MENU = { OPEN: 'hitapi-open', CAPTURE: 'hitapi-capture' };

export function registerContextMenu() {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: MENU.OPEN, title: 'Open HitAPI', contexts: ['page'] });
      chrome.contextMenus.create({ id: MENU.CAPTURE, title: 'Capture API calls on this tab', contexts: ['page'] });
    });
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === MENU.CAPTURE && tab?.id != null && isWebUrl(tab.url)) {
      await startMonitoring(tab.id).catch(e => console.warn('[HitAPI] capture from menu', e.message));
    }
    // openPopup needs Chrome 127+; on older versions the badge still shows capture started.
    chrome.action.openPopup?.().catch?.(() => {});
  });
}
