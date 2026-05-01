/**
 * Memephant — Content Script
 *
 * Runs on ChatGPT, Claude, Grok, Perplexity, and Gemini pages.
 *
 * Two jobs:
 *  1. DETECT — Watch AI responses for memephant_update JSON blocks,
 *              show a floating "Apply to Memephant" button when found.
 *  2. INJECT — Add a small "🐘 Copy for Memephant" button to every AI
 *              message so users can grab the full response easily.
 */

'use strict';

// ─── Platform detection ────────────────────────────────────────────────────────

const PLATFORM = (() => {
  const h = location.hostname;
  if (h.includes('chatgpt.com') || h.includes('chat.openai.com')) return 'chatgpt';
  if (h.includes('claude.ai'))      return 'claude';
  if (h.includes('grok.com') || h.includes('x.com')) return 'grok';
  if (h.includes('perplexity.ai'))  return 'perplexity';
  if (h.includes('gemini.google'))  return 'gemini';
  return 'unknown';
})();

const PLATFORM_LABEL = {
  chatgpt: 'ChatGPT', claude: 'Claude', grok: 'Grok',
  perplexity: 'Perplexity', gemini: 'Gemini', unknown: 'AI',
}[PLATFORM];

// ─── State ────────────────────────────────────────────────────────────────────

let lastDetectedJson = null;
let toastTimeout     = null;
let observerActive   = false;

// ─── Detection logic ──────────────────────────────────────────────────────────

const PROJECT_FIELDS = [
  'summary', 'currentState', 'goals', 'rules',
  'decisions', 'nextSteps', 'openQuestions', 'importantAssets',
];

function hasProjectFields(obj) {
  return typeof obj === 'object' && obj !== null &&
    PROJECT_FIELDS.some((f) => f in obj);
}

function tryParseJson(str) {
  try { const p = JSON.parse(str.trim()); return hasProjectFields(p) ? p : null; }
  catch { return null; }
}

function extractUpdateFromText(text) {
  if (!text || text.length < 20) return null;

  const m1 = text.match(/memphant_update\s*[\r\n]*(\{[\s\S]*?\})/i);
  if (m1) { const p = tryParseJson(m1[1]); if (p) return p; }

  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const p = tryParseJson(m[1]); if (p) return p;
  }

  const m3 = text.match(/\{[\s\S]*?"(?:summary|goals|decisions|currentState|nextSteps|openQuestions)"[\s\S]*?\}/);
  if (m3) { const p = tryParseJson(m3[0]); if (p) return p; }

  return null;
}

// ─── DOM selectors per platform ───────────────────────────────────────────────

const RESPONSE_SELECTORS = {
  chatgpt:    '[data-message-author-role="assistant"], .markdown.prose',
  claude:     '[data-testid="assistant-message"], .font-claude-message',
  grok:       '[class*="ModelResponse"], [class*="message-bubble"]',
  perplexity: '[class*="AnswerBody"], [class*="prose"]',
  gemini:     'model-response, [class*="model-response"]',
  unknown:    'article, main',
};

function getPageText() {
  const seen = new Set(); let combined = '';
  const sel = (RESPONSE_SELECTORS[PLATFORM] || '') + ', article, main';
  try {
    document.querySelectorAll(sel).forEach((node) => {
      if (!seen.has(node)) { seen.add(node); combined += '\n' + node.innerText; }
    });
  } catch { /* skip */ }
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
  const floater = getOrCreateFloater();
  const fieldCount = PROJECT_FIELDS.filter((f) => updateJson[f] !== undefined).length;
  const arr = ['goals','rules','decisions','nextSteps','openQuestions','importantAssets'];
  const itemCount = arr.reduce((s, f) => s + (Array.isArray(updateJson[f]) ? updateJson[f].length : 0), 0);
  const summary = itemCount > 0
    ? `${itemCount} item${itemCount !== 1 ? 's' : ''} across ${fieldCount} field${fieldCount !== 1 ? 's' : ''}`
    : `${fieldCount} field${fieldCount !== 1 ? 's' : ''} updated`;

  floater.innerHTML = `
    <div class="mph-floater__inner">
      <span class="mph-floater__icon">🐘</span>
      <div class="mph-floater__body">
        <span class="mph-floater__title">Memphant update detected</span>
        <span class="mph-floater__summary">${summary}</span>
      </div>
      <button class="mph-floater__btn" id="mph-copy-btn">Copy &amp; apply</button>
      <button class="mph-floater__dismiss" id="mph-dismiss-btn" aria-label="Dismiss">✕</button>
    </div>`;
  floater.classList.add('mph-floater--visible');
  document.getElementById('mph-copy-btn').addEventListener('click', handleCopy);
  document.getElementById('mph-dismiss-btn').addEventListener('click', dismissFloater);
}

function dismissFloater() {
  const el = document.getElementById('mph-floater');
  if (el) el.classList.remove('mph-floater--visible');
}

function showToast(message, isError = false) {
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
    chrome.runtime.sendMessage({ type: 'UPDATE_COPIED' });
  } catch { showToast('Could not copy — try again.', true); }
}

// ─── Inject "Copy for Memphant" buttons ──────────────────────────────────────

function injectCopyButton(node) {
  if (!node || node.dataset.mphInjected) return;
  node.dataset.mphInjected = 'true';

  const btn = document.createElement('button');
  btn.className = 'mph-inject-btn';
  btn.title = `Copy this ${PLATFORM_LABEL} response into Memphant`;
  btn.innerHTML = '🐘 Copy for Memphant';

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const text = node.innerText || '';
    const payload = `--- ${PLATFORM_LABEL} response (paste into Memphant) ---\n\n${text}`;
    try {
      await navigator.clipboard.writeText(payload);
      btn.textContent = '✅ Copied!';
      setTimeout(() => { btn.innerHTML = '🐘 Copy for Memphant'; }, 2000);
    } catch { btn.textContent = '⚠️ Failed'; }
  });

  // Try to find the message's action bar; otherwise just append
  const anchor = node.querySelector('[class*="action"], [class*="footer"], [class*="toolbar"]') || node;
  anchor.appendChild(btn);
}

function injectAllButtons() {
  const selMap = {
    chatgpt:    '[data-message-author-role="assistant"]',
    claude:     '[data-testid="assistant-message"]',
    grok:       '[class*="ModelResponse"]',
    perplexity: '[class*="AnswerBody"]',
    gemini:     'model-response',
  };
  const sel = selMap[PLATFORM];
  if (sel) document.querySelectorAll(sel).forEach(injectCopyButton);
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
    // The extension was probably reloaded while this page still had an old
    // content script instance alive. Ignore safely.
  }
}

function scheduleScan() {
  clearTimeout(scanDebounce);
  scanDebounce = setTimeout(() => {
    const text = getPageText();
    const update = extractUpdateFromText(text);
    if (update && JSON.stringify(update) !== JSON.stringify(lastDetectedJson)) {
      showFloater(update);
      sendRuntimeMessageSafely({ type: 'UPDATE_FOUND', data: update });
    }
    injectAllButtons();
  }, 700);
}

function startObserver() {
  if (observerActive) return;
  observerActive = true;
  new MutationObserver(scheduleScan).observe(document.body, {
    childList: true, subtree: true, characterData: true,
  });
  scheduleScan();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver);
} else {
  startObserver();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'GET_CURRENT_UPDATE') return Promise.resolve({ update: lastDetectedJson });
  if (msg.type === 'COPY_UPDATE') void handleCopy();
});
