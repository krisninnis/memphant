/**
 * Memephant — Background Service Worker (MV3)
 *
 * Responsibilities:
 * - Badge the extension icon when an update is detected on a tab
 * - Clear the badge when the user copies the update
 * - Track per-tab update state so the popup knows what to show
 */

'use strict';

// ─── Badge helpers ────────────────────────────────────────────────────────────

function setBadge(tabId) {
  chrome.action.setBadgeText({ text: '1', tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#d97706', tabId });
}

function clearBadge(tabId) {
  chrome.action.setBadgeText({ text: '', tabId });
}

// ─── Message handling ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;

  if (msg.type === 'UPDATE_FOUND' && tabId) {
    setBadge(tabId);
  }

  if (msg.type === 'UPDATE_COPIED' && tabId) {
    clearBadge(tabId);
  }
});

// ─── Clear badge when user navigates away ────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    clearBadge(tabId);
  }
});
// ─── Prompt Guard injection ───────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;

  const isChatGPT =
    tab.url.includes('chatgpt.com') ||
    tab.url.includes('chat.openai.com');

  if (!isChatGPT) return;

  chrome.scripting
    .executeScript({
      target: { tabId },
      files: [
        'prompt-guard/platforms/chatgpt.js',
        'prompt-guard/index.js',
      ],
    })
    .catch(() => {});
});