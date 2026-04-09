/**
 * Project Brain — Content Script
 *
 * Runs on ChatGPT, Claude, Grok, Perplexity, and Gemini pages.
 * Watches for `project_brain_update` JSON blocks in AI responses,
 * then shows a floating "Apply to Project Brain" button.
 *
 * On click → copies the extracted JSON to clipboard so the user can
 * switch to the Project Brain app and have it auto-detected in the paste zone.
 */

'use strict';

// ─── State ───────────────────────────────────────────────────────────────────

let lastDetectedJson = null;
let toastTimeout = null;
let observerActive = false;

// ─── Detection logic (mirrors diffEngine.ts) ─────────────────────────────────

const PROJECT_FIELDS = [
  'summary', 'currentState', 'goals', 'rules',
  'decisions', 'nextSteps', 'openQuestions', 'importantAssets',
];

function hasProjectFields(obj) {
  if (typeof obj !== 'object' || obj === null) return false;
  return PROJECT_FIELDS.some((field) => field in obj);
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

  // Strategy 1: explicit project_brain_update marker
  const markerMatch = text.match(/project_brain_update\s*[\r\n]*(\{[\s\S]*?\})/i);
  if (markerMatch) {
    const parsed = tryParseJson(markerMatch[1]);
    if (parsed) return parsed;
  }

  // Strategy 2: fenced code block containing JSON with project fields
  const codeBlockMatches = text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
  for (const match of codeBlockMatches) {
    const parsed = tryParseJson(match[1]);
    if (parsed) return parsed;
  }

  // Strategy 3: bare JSON object with project fields
  const bareMatch = text.match(
    /\{[\s\S]*?"(?:summary|goals|decisions|currentState|nextSteps|openQuestions)"[\s\S]*?\}/,
  );
  if (bareMatch) {
    const parsed = tryParseJson(bareMatch[0]);
    if (parsed) return parsed;
  }

  return null;
}

// ─── DOM scanning ─────────────────────────────────────────────────────────────

function getPageText() {
  // Each platform structures its response text differently.
  // We grab all likely response containers and join their text.
  const selectors = [
    // ChatGPT
    '[data-message-author-role="assistant"]',
    '.markdown.prose',
    // Claude
    '[data-testid="assistant-message"]',
    '.font-claude-message',
    // Grok
    '[class*="message-bubble"]',
    '[class*="response"]',
    // Perplexity
    '[class*="prose"]',
    '[class*="answer"]',
    // Gemini
    'model-response',
    '[class*="model-response"]',
    // Generic fallback
    'article',
    'main',
  ];

  const seen = new Set();
  let combined = '';

  for (const selector of selectors) {
    try {
      const nodes = document.querySelectorAll(selector);
      nodes.forEach((node) => {
        if (!seen.has(node)) {
          seen.add(node);
          combined += '\n' + node.innerText;
        }
      });
    } catch {
      // Selector may not be valid in some browsers — skip
    }
  }

  return combined;
}

// ─── UI ───────────────────────────────────────────────────────────────────────

function getOrCreateFloater() {
  let floater = document.getElementById('pb-floater');
  if (!floater) {
    floater = document.createElement('div');
    floater.id = 'pb-floater';
    floater.setAttribute('role', 'status');
    floater.setAttribute('aria-live', 'polite');
    document.body.appendChild(floater);
  }
  return floater;
}

function showFloater(updateJson) {
  lastDetectedJson = updateJson;
  const floater = getOrCreateFloater();

  // Count how many fields the update touches
  const fieldCount = PROJECT_FIELDS.filter(
    (f) => updateJson[f] !== undefined,
  ).length;

  const arrayFields = ['goals', 'rules', 'decisions', 'nextSteps', 'openQuestions', 'importantAssets'];
  const itemCount = arrayFields.reduce((sum, f) => {
    const val = updateJson[f];
    return sum + (Array.isArray(val) ? val.length : 0);
  }, 0);

  const summary = itemCount > 0
    ? `${itemCount} update${itemCount !== 1 ? 's' : ''} across ${fieldCount} field${fieldCount !== 1 ? 's' : ''}`
    : `${fieldCount} field${fieldCount !== 1 ? 's' : ''} updated`;

  floater.innerHTML = `
    <div class="pb-floater__inner">
      <span class="pb-floater__icon">🧠</span>
      <div class="pb-floater__body">
        <span class="pb-floater__title">Project update detected</span>
        <span class="pb-floater__summary">${summary}</span>
      </div>
      <button class="pb-floater__btn" id="pb-copy-btn" title="Copy update to clipboard">
        Copy &amp; apply
      </button>
      <button class="pb-floater__dismiss" id="pb-dismiss-btn" aria-label="Dismiss" title="Dismiss">✕</button>
    </div>
  `;

  floater.classList.add('pb-floater--visible');

  document.getElementById('pb-copy-btn').addEventListener('click', handleCopy);
  document.getElementById('pb-dismiss-btn').addEventListener('click', dismissFloater);
}

function dismissFloater() {
  const floater = document.getElementById('pb-floater');
  if (floater) floater.classList.remove('pb-floater--visible');
}

function showToast(message, isError = false) {
  const floater = getOrCreateFloater();
  floater.innerHTML = `
    <div class="pb-floater__inner pb-floater__inner--toast${isError ? ' pb-floater__inner--error' : ''}">
      <span class="pb-floater__icon">${isError ? '⚠️' : '✅'}</span>
      <span class="pb-floater__toast-msg">${message}</span>
    </div>
  `;
  floater.classList.add('pb-floater--visible');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(dismissFloater, 3000);
}

async function handleCopy() {
  if (!lastDetectedJson) return;

  // Format the JSON cleanly for the paste zone
  const jsonString = JSON.stringify(lastDetectedJson, null, 2);
  const payload = `project_brain_update\n${jsonString}`;

  try {
    await navigator.clipboard.writeText(payload);
    showToast('Copied! Switch to Project Brain and paste.');
    // Notify background to badge the icon
    chrome.runtime.sendMessage({ type: 'UPDATE_COPIED' });
  } catch {
    showToast('Could not copy — please copy manually.', true);
  }
}

// ─── Observer ────────────────────────────────────────────────────────────────

let scanDebounce = null;

function scheduleScan() {
  clearTimeout(scanDebounce);
  scanDebounce = setTimeout(() => {
    const text = getPageText();
    const update = extractUpdateFromText(text);

    if (update) {
      // Only show if the JSON changed since last detection
      const jsonStr = JSON.stringify(update);
      if (jsonStr !== JSON.stringify(lastDetectedJson)) {
        showFloater(update);
        // Tell background script so it can badge the icon
        chrome.runtime.sendMessage({ type: 'UPDATE_FOUND', data: update });
      }
    }
  }, 600);
}

function startObserver() {
  if (observerActive) return;
  observerActive = true;

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Run once immediately in case there's already content
  scheduleScan();
}

// ─── Init ─────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserver);
} else {
  startObserver();
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'GET_CURRENT_UPDATE') {
    return Promise.resolve({ update: lastDetectedJson });
  }
  if (msg.type === 'COPY_UPDATE') {
    void handleCopy();
  }
});
