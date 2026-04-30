/**
 * Memephant â€” Background Service Worker (MV3)
 *
 * Responsibilities:
 * - Badge the extension icon when an update is detected on a tab
 * - Clear the badge when the user copies the update
 * - Track per-tab update state so the popup knows what to show
 */

'use strict';

// â”€â”€â”€ Badge helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function setBadge(tabId) {
  chrome.action.setBadgeText({ text: '1', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#d97706', tabId });
}

function clearBadge(tabId) {
  chrome.action.setBadgeText({ text: '', tabId });
}

// â”€â”€â”€ Message handling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;

  if (msg.type === 'UPDATE_FOUND' && tabId) {
    setBadge(tabId);
  }

  if (msg.type === 'UPDATE_COPIED' && tabId) {
    clearBadge(tabId);
  }
});

// â”€â”€â”€ Clear badge when user navigates away â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    clearBadge(tabId);
  }
});
