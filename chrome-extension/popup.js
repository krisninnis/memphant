/**
 * Memphant — Popup Script
 * Queries the active tab's content script for any detected update,
 * then renders the appropriate panel.
 */

'use strict';

const PROJECT_FIELDS = [
  'summary', 'currentState', 'goals', 'rules',
  'decisions', 'nextSteps', 'openQuestions', 'importantAssets',
];

const ARRAY_FIELDS = ['goals', 'rules', 'decisions', 'nextSteps', 'openQuestions', 'importantAssets'];

const HINT_PROMPT =
  'Please end your reply with a memphant_update JSON block summarising ' +
  'any new goals, decisions, next steps, or changes to current state. ' +
  'Format: memphant_update\n{ "goals": [], "decisions": [], "nextSteps": [] }';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function describUpdate(update) {
  const itemCount = ARRAY_FIELDS.reduce((sum, f) => {
    const val = update[f];
    return sum + (Array.isArray(val) ? val.length : 0);
  }, 0);

  const fieldCount = PROJECT_FIELDS.filter((f) => update[f] !== undefined).length;

  if (itemCount > 0) {
    return `${itemCount} item${itemCount !== 1 ? 's' : ''} across ${fieldCount} field${fieldCount !== 1 ? 's' : ''}`;
  }
  return `${fieldCount} field${fieldCount !== 1 ? 's' : ''} updated`;
}

function showConfirmation(msg) {
  const el = document.getElementById('confirmation');
  el.textContent = msg;
  el.hidden = false;
  setTimeout(() => { el.hidden = true; }, 3000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Check if we're on a supported AI page
  const supportedHosts = [
    'chat.openai.com', 'chatgpt.com',
    'claude.ai',
    'x.com', 'grok.com',
    'www.perplexity.ai',
    'gemini.google.com',
  ];

  let isSupported = false;
  try {
    const url = new URL(tab.url || '');
    isSupported = supportedHosts.some((h) => url.hostname === h);
  } catch {
    isSupported = false;
  }

  let currentUpdate = null;

  if (isSupported && tab.id) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_UPDATE' });
      currentUpdate = response?.update ?? null;
    } catch {
      // Content script not yet injected (page still loading) — show idle state
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const updatePanel = document.getElementById('update-panel');
  const idlePanel = document.getElementById('idle-panel');
  const updateSummary = document.getElementById('update-summary');

  if (currentUpdate) {
    updatePanel.hidden = false;
    idlePanel.hidden = true;
    updateSummary.textContent = describUpdate(currentUpdate);
  } else {
    updatePanel.hidden = true;
    idlePanel.hidden = false;
  }

  // ── Buttons ───────────────────────────────────────────────────────────────

  document.getElementById('copy-btn')?.addEventListener('click', async () => {
    if (!currentUpdate || !tab.id) return;

    const jsonStr = JSON.stringify(currentUpdate, null, 2);
    const payload = `memphant_update\n${jsonStr}`;

    try {
      await navigator.clipboard.writeText(payload);
      showConfirmation('✅ Copied! Open Memphant and paste.');
      chrome.runtime.sendMessage({ type: 'UPDATE_COPIED' });
    } catch {
      // Clipboard may need focus — fall back to messaging content script
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'COPY_UPDATE' });
        showConfirmation('✅ Copied! Open Memphant and paste.');
      } catch {
        showConfirmation('⚠️ Could not copy — try the page button instead.');
      }
    }
  });

  document.getElementById('hint-btn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(HINT_PROMPT);
      showConfirmation('✅ Hint copied — paste into your AI chat.');
    } catch {
      showConfirmation('⚠️ Could not copy automatically.');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(console.error);
});
