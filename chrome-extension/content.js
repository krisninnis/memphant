/**
 * Memephant — Content Script
 *
 * Runs on ChatGPT, Claude, Grok, Perplexity, and Gemini pages.
 *
 * Two jobs:
 *  1. DETECT — Watch AI responses for memphant_update JSON blocks,
 *              show a floating "Apply to Memephant" button when manual mode is active.
 *  2. INJECT — Add a small "🐘 Copy for Memephant" button to every AI
 *              message so users can grab the full response easily.
 */

'use strict';

// ─── Platform detection ────────────────────────────────────────────────────────

const PLATFORM = (() => {
  const h = location.hostname;
  if (h.includes('chatgpt.com') || h.includes('chat.openai.com')) return 'chatgpt';
  if (h.includes('claude.ai')) return 'claude';
  if (h.includes('grok.com') || h.includes('x.com')) return 'grok';
  if (h.includes('perplexity.ai')) return 'perplexity';
  if (h.includes('gemini.google')) return 'gemini';
  return 'unknown';
})();

const PLATFORM_LABEL = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  grok: 'Grok',
  perplexity: 'Perplexity',
  gemini: 'Gemini',
  unknown: 'AI',
}[PLATFORM];

// ─── Settings ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  /**
   * manual:
   *   Show the bottom-right "Memphant update detected" floater.
   *
   * automatic:
   *   Suppress the floater. Automatic bridge mode should not ask the user
   *   to copy/apply visible memphant_update blocks from the AI page.
   */
  memephantMemoryMode: 'manual',
};

let extensionSettings = { ...DEFAULT_SETTINGS };

function canUseChromeStorage() {
  return Boolean(
    typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.local,
  );
}

function isAutomaticMemoryMode() {
  return (
    extensionSettings.memephantMemoryMode === 'automatic' ||
    extensionSettings.memephantAutomaticMode === true ||
    extensionSettings.memoryBridgeMode === 'automatic'
  );
}

function loadSettings() {
  return new Promise((resolve) => {
    if (!canUseChromeStorage()) {
      resolve({ ...DEFAULT_SETTINGS });
      return;
    }

    chrome.storage.local.get(DEFAULT_SETTINGS, (items) => {
      const error = chrome.runtime?.lastError;

      if (error) {
        console.warn('Memephant: could not load extension settings', error);
        resolve({ ...DEFAULT_SETTINGS });
        return;
      }

      resolve({
        ...DEFAULT_SETTINGS,
        ...(items || {}),
      });
    });
  });
}

function listenForSettingsChanges() {
  if (
    typeof chrome === 'undefined' ||
    !chrome.storage ||
    !chrome.storage.onChanged
  ) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    const relevantKeys = [
      'memephantMemoryMode',
      'memephantAutomaticMode',
      'memoryBridgeMode',
    ];

    const hasRelevantChange = relevantKeys.some((key) => changes[key]);
    if (!hasRelevantChange) return;

    for (const key of relevantKeys) {
      if (changes[key]) {
        extensionSettings[key] = changes[key].newValue;
      }
    }

    extensionSettings = {
      ...DEFAULT_SETTINGS,
      ...extensionSettings,
    };

    if (isAutomaticMemoryMode()) {
      dismissFloater();
    }

    console.log('Memephant: extension settings updated', extensionSettings);
  });
}

// ─── State ────────────────────────────────────────────────────────────────────

let lastDetectedJson = null;
let toastTimeout = null;
let observerActive = false;

// ─── Detection logic ──────────────────────────────────────────────────────────

const PROJECT_FIELDS = [
  'summary',
  'currentState',
  'goals',
  'rules',
  'decisions',
  'nextSteps',
  'openQuestions',
  'importantAssets',
];

function hasProjectFields(obj) {
  return typeof obj === 'object' && obj !== null &&
    PROJECT_FIELDS.some((f) => f in obj);
}

function tryParseJson(str) {
  try {
    const parsed = JSON.parse(str.trim());
    return hasProjectFields(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractUpdateFromText(text) {
  if (!text || text.length < 20) return null;

  const m1 = text.match(/memphant_update\s*[\r\n]*(\{[\s\S]*?\})/i);
  if (m1) {
    const parsed = tryParseJson(m1[1]);
    if (parsed) return parsed;
  }

  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const parsed = tryParseJson(m[1]);
    if (parsed) return parsed;
  }

  const m3 = text.match(
    /\{[\s\S]*?"(?:summary|goals|decisions|currentState|nextSteps|openQuestions)"[\s\S]*?\}/,
  );
  if (m3) {
    const parsed = tryParseJson(m3[0]);
    if (parsed) return parsed;
  }

  return null;
}

// ─── DOM selectors per platform ───────────────────────────────────────────────

const RESPONSE_SELECTORS = {
  chatgpt: '[data-message-author-role="assistant"], .markdown.prose',
  claude: '[data-testid="assistant-message"], .font-claude-message',
  grok: '[class*="ModelResponse"], [class*="message-bubble"]',
  perplexity: '[class*="AnswerBody"], [class*="prose"]',
  gemini: 'model-response, [class*="model-response"]',
  unknown: 'article, main',
};

function getPageText() {
  const seen = new Set();
  let combined = '';
  const selector = `${RESPONSE_SELECTORS[PLATFORM] || ''}, article, main`;

  try {
    document.querySelectorAll(selector).forEach((node) => {
      if (!seen.has(node)) {
        seen.add(node);
        combined += `\n${node.innerText}`;
      }
    });
  } catch {
    // Ignore selector/runtime issues on unsupported page shapes.
  }

  return combined;
}

// ─── Floating banner ──────────────────────────────────────────────────────────

function getOrCreateFloater() {
  let el = document.getElementById('mph-floater');

  if (!el) {
    el = document.createElement('div');
    el.id = 'mph-floater';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }

  return el;
}

function showFloater(updateJson) {
  lastDetectedJson = updateJson;

  if (isAutomaticMemoryMode()) {
    dismissFloater();
    console.log('Memephant: update floater suppressed in automatic memory mode');
    return;
  }

  const floater = getOrCreateFloater();
  const fieldCount = PROJECT_FIELDS.filter((f) => updateJson[f] !== undefined).length;
  const arrayFields = ['goals', 'rules', 'decisions', 'nextSteps', 'openQuestions', 'importantAssets'];
  const itemCount = arrayFields.reduce(
    (sum, field) => sum + (Array.isArray(updateJson[field]) ? updateJson[field].length : 0),
    0,
  );

  const summary = itemCount > 0
    ? `${itemCount} item${itemCount !== 1 ? 's' : ''} across ${fieldCount} field${fieldCount !== 1 ? 's' : ''}`
    : `${fieldCount} field${fieldCount !== 1 ? 's' : ''} updated`;

  floater.innerHTML = `
    <div class="mph-floater__inner">
      <span class="mph-floater__icon">🐘</span>
      <div class="mph-floater__body">
        <span class="mph-floater__title">Memephant update detected</span>
        <span class="mph-floater__summary">${summary}</span>
      </div>
      <button class="mph-floater__btn" id="mph-copy-btn">Copy &amp; apply</button>
      <button class="mph-floater__dismiss" id="mph-dismiss-btn" aria-label="Dismiss">✕</button>
    </div>`;

  floater.classList.add('mph-floater--visible');

  document.getElementById('mph-copy-btn')?.addEventListener('click', handleCopy);
  document.getElementById('mph-dismiss-btn')?.addEventListener('click', dismissFloater);
}

function dismissFloater() {
  const el = document.getElementById('mph-floater');
  if (el) el.classList.remove('mph-floater--visible');
}

function showToast(message, isError = false) {
  if (isAutomaticMemoryMode()) {
    dismissFloater();
    return;
  }

  const floater = getOrCreateFloater();

  floater.innerHTML = `
    <div class="mph-floater__inner mph-floater__inner--toast${isError ? ' mph-floater__inner--error' : ''}">
      <span class="mph-floater__icon">${isError ? '⚠️' : '✅'}</span>
      <span class="mph-floater__toast-msg">${message}</span>
    </div>`;

  floater.classList.add('mph-floater--visible');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(dismissFloater, 3000);
}

async function handleCopy() {
  if (!lastDetectedJson) return;

  const payload = `memphant_update\n${JSON.stringify(lastDetectedJson, null, 2)}`;

  try {
    await navigator.clipboard.writeText(payload);
    showToast('Copied! Switch to Memphant and paste.');
    sendRuntimeMessageSafely({ type: 'UPDATE_COPIED' });
  } catch {
    showToast('Could not copy — try again.', true);
  }
}

// ─── Hide floater after prompt submit ─────────────────────────────────────────

function isComposerElement(target) {
  if (!target || !(target instanceof Element)) return false;

  return Boolean(
    target.closest('#prompt-textarea') ||
      target.closest('textarea') ||
      target.closest('div[contenteditable="true"]'),
  );
}

function isSendButton(target) {
  if (!target || !(target instanceof Element)) return false;

  const button = target.closest('button');
  if (!button) return false;

  const label = [
    button.getAttribute('aria-label') || '',
    button.getAttribute('data-testid') || '',
    button.title || '',
    button.textContent || '',
  ].join(' ').toLowerCase();

  return (
    label.includes('send') ||
    label.includes('submit') ||
    label.includes('stop streaming')
  );
}

function attachSubmitDismissWatcher() {
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter') return;
      if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      if (!isComposerElement(event.target)) return;

      setTimeout(dismissFloater, 0);
      setTimeout(dismissFloater, 300);
      setTimeout(dismissFloater, 1200);
    },
    true,
  );

  document.addEventListener(
    'click',
    (event) => {
      if (!isSendButton(event.target)) return;

      setTimeout(dismissFloater, 0);
      setTimeout(dismissFloater, 300);
      setTimeout(dismissFloater, 1200);
    },
    true,
  );
}

// ─── Inject "Copy for Memphant" buttons ───────────────────────────────────────

function injectCopyButton(node) {
  if (!node || node.dataset.mphInjected) return;

  node.dataset.mphInjected = 'true';

  const btn = document.createElement('button');
  btn.className = 'mph-inject-btn';
  btn.title = `Copy this ${PLATFORM_LABEL} response into Memphant`;
  btn.innerHTML = '🐘 Copy for Memphant';

  btn.addEventListener('click', async (event) => {
    event.stopPropagation();

    const text = node.innerText || '';
    const payload = `--- ${PLATFORM_LABEL} response (paste into Memphant) ---\n\n${text}`;

    try {
      await navigator.clipboard.writeText(payload);
      btn.textContent = '✅ Copied!';
      setTimeout(() => {
        btn.innerHTML = '🐘 Copy for Memphant';
      }, 2000);
    } catch {
      btn.textContent = '⚠️ Failed';
    }
  });

  const anchor =
    node.querySelector('[class*="action"], [class*="footer"], [class*="toolbar"]') || node;

  anchor.appendChild(btn);
}

function injectAllButtons() {
  const selectorMap = {
    chatgpt: '[data-message-author-role="assistant"]',
    claude: '[data-testid="assistant-message"]',
    grok: '[class*="ModelResponse"]',
    perplexity: '[class*="AnswerBody"]',
    gemini: 'model-response',
  };

  const selector = selectorMap[PLATFORM];

  if (selector) {
    document.querySelectorAll(selector).forEach(injectCopyButton);
  }
}

// ─── Observer ─────────────────────────────────────────────────────────────────

let scanDebounce = null;

function sendRuntimeMessageSafely(message) {
  try {
    if (
      typeof chrome === 'undefined' ||
      !chrome.runtime ||
      !chrome.runtime.id ||
      typeof chrome.runtime.sendMessage !== 'function'
    ) {
      return;
    }

    chrome.runtime.sendMessage(message, () => {
      // Swallow lastError so stale tabs do not throw after extension reloads.
      void chrome.runtime.lastError;
    });
  } catch {
    // Extension may have reloaded while this page still had an old content script.
  }
}

function scheduleScan() {
  clearTimeout(scanDebounce);

  scanDebounce = setTimeout(() => {
    const text = getPageText();
    const update = extractUpdateFromText(text);

    if (update && JSON.stringify(update) !== JSON.stringify(lastDetectedJson)) {
      lastDetectedJson = update;

      if (isAutomaticMemoryMode()) {
        dismissFloater();
      } else {
        showFloater(update);
        sendRuntimeMessageSafely({ type: 'UPDATE_FOUND', data: update });
      }
    }

    injectAllButtons();
  }, 700);
}

async function startObserver() {
  if (observerActive) return;

  extensionSettings = await loadSettings();
  listenForSettingsChanges();
  attachSubmitDismissWatcher();

  observerActive = true;

  new MutationObserver(scheduleScan).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  scheduleScan();

  console.log('Memephant: content script started', {
    platform: PLATFORM,
    settings: extensionSettings,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    startObserver().catch((error) => {
      console.error('Memephant: content script failed to start', error);
    });
  });
} else {
  startObserver().catch((error) => {
    console.error('Memephant: content script failed to start', error);
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'GET_CURRENT_UPDATE') {
    return Promise.resolve({ update: lastDetectedJson });
  }

  if (msg.type === 'COPY_UPDATE') {
    void handleCopy();
  }

  if (msg.type === 'HIDE_MEMEPHANT_FLOATER') {
    dismissFloater();
  }
});