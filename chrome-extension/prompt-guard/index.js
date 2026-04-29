/**
 * Prompt Guard — Entry point
 *
 * Phase 2: wires ChatGPT paste detection to a console-only
 * project-context confidence check. No overlay yet.
 */

'use strict';

window.PromptGuard = window.PromptGuard || {};

const PROMPT_GUARD_KEYWORDS = [
  'Project:',
  'Goals:',
  'Decisions:',
  'Next Steps:',
  'Current Status:',
  'memphant_update',
  'Rules:',
  'Open Questions:',
  'Important Files',
];

const PROMPT_GUARD_LENGTH_THRESHOLD = 800;
const PROMPT_GUARD_CONFIDENCE_THRESHOLD = 3;

function isChatGptSite() {
  return (
    location.hostname.includes('chatgpt.com') ||
    location.hostname.includes('chat.openai.com')
  );
}

function analysePromptGuardText(text) {
  const normalizedText = text || '';
  const hasMemphantUpdate = normalizedText.toLowerCase().includes('memphant_update');
  const keywordCount = PROMPT_GUARD_KEYWORDS.filter((keyword) =>
    normalizedText.includes(keyword),
  ).length;

  let confidence = 0;

  if (normalizedText.length >= PROMPT_GUARD_LENGTH_THRESHOLD) {
    confidence += 1;
  }

  confidence += Math.min(keywordCount, 4);

  if (hasMemphantUpdate) {
    confidence += 2;
  }

  return {
    confidence,
    detected: hasMemphantUpdate || confidence >= PROMPT_GUARD_CONFIDENCE_THRESHOLD,
  };
}

function handlePromptGuardPaste(text) {
  const result = analysePromptGuardText(text);

  if (result.detected) {
    console.log(`Prompt Guard: project context detected, confidence: ${result.confidence}`);
    return;
  }

  console.log(`Prompt Guard: below threshold, confidence: ${result.confidence}`);
}

function startPromptGuard() {
  if (!isChatGptSite()) {
    return;
  }

  if (typeof window.PromptGuard.attachChatGptPasteListener !== 'function') {
    console.warn('Prompt Guard: ChatGPT adapter not available');
    return;
  }

  window.PromptGuard.attachChatGptPasteListener(handlePromptGuardPaste);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startPromptGuard);
} else {
  startPromptGuard();
}
