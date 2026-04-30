/**
 * Prompt Guard - Entry point
 *
 * Phase 4: wires ChatGPT paste/draft detection to the local analyzer
 * and overlay. The analyzer console log stays enabled for debugging.
 */

(function () {
  'use strict';

  window.PromptGuard = window.PromptGuard || {};

  function isChatGptSite() {
    return (
      location.hostname.includes('chatgpt.com') ||
      location.hostname.includes('chat.openai.com')
    );
  }

  function handlePromptGuardDraft(text) {
    if (typeof window.PromptGuard.analyzePrompt !== 'function') {
      console.warn('Prompt Guard: analyzer not available');
      return;
    }

    const result = window.PromptGuard.analyzePrompt(text);

    console.log('Prompt Guard: analyzer result', result);

    if (typeof window.PromptGuard.updateOverlay === 'function') {
      window.PromptGuard.updateOverlay(text, result);
      return;
    }

    console.warn('Prompt Guard: overlay not available');
  }

  function startPromptGuard() {
    if (!isChatGptSite()) {
      return;
    }

    if (typeof window.PromptGuard.attachChatGptPasteListener !== 'function') {
      console.warn('Prompt Guard: ChatGPT adapter not available');
      return;
    }

    window.PromptGuard.attachChatGptPasteListener(handlePromptGuardDraft);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPromptGuard);
  } else {
    startPromptGuard();
  }
})();
