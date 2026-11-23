/**
 * background/workbench/entry.js — ways into the Workbench that don't need the popup:
 *
 *   - keyboard shortcut (manifest "commands": open-workbench, Alt+Shift+H by default (Alt+Shift+W is taken by Chrome))
 *   - first install: open the Workbench with a "Start here" note and a sample request
 *   - update from a version before 1.7: show "New" on the popup's Workbench card
 */

import { openWorkbench } from './open.js';
import { WB, setLocal } from '../storage.js';

export const COMMAND = 'open-workbench';

function olderThan(version, target) {
  const a = String(version || '0').split('.').map(Number);
  const b = target.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0);
  }
  return false;
}

export function registerWorkbenchEntry() {
  chrome.commands.onCommand.addListener((command) => {
    if (command === COMMAND) openWorkbench().catch(e => console.warn('[HitAPI] shortcut', e.message));
  });

  chrome.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
    if (reason === 'install') {
      openWorkbench({ welcome: true }).catch(e => console.warn('[HitAPI] welcome', e.message));
    } else if (reason === 'update' && olderThan(previousVersion, '1.7.0')) {
      setLocal({ [WB.WHATS_NEW]: true }).catch(() => {});
    }
  });
}
