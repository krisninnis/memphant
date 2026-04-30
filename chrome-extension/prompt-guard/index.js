/**
 * Prompt Guard - Entry point
 *
 * Phase 3: wires ChatGPT paste/draft detection to the local analyzer.
 * Console-only. No overlay yet.
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

    console.log('Prompt Guard: analyzer result', window.PromptGuard.analyzePrompt(text));
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
