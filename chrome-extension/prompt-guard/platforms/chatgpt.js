/**
 * Prompt Guard — ChatGPT platform adapter
 *
 * Phase 2: detects paste events in the ChatGPT input and reports
 * the pasted text to the Prompt Guard entry point. No overlay yet.
 */

'use strict';

window.PromptGuard = window.PromptGuard || {};

const CHATGPT_INPUT_SELECTORS = [
  '#prompt-textarea',
  '[data-testid="prompt-textarea"]',
  'textarea',
  'div[contenteditable="true"]',
];

function findChatGptInput() {
  for (const selector of CHATGPT_INPUT_SELECTORS) {
    const input = document.querySelector(selector);
    if (input) return input;
  }

  return null;
}

window.PromptGuard.attachChatGptPasteListener = function (onPasteText) {
  let attachedInput = null;

  const attach = () => {
    const input = findChatGptInput();

    if (!input || input === attachedInput) {
      return;
    }

    if (attachedInput) {
      attachedInput.removeEventListener('paste', handlePaste);
    }

    attachedInput = input;
    attachedInput.addEventListener('paste', handlePaste);
  };

  const handlePaste = (event) => {
    const pastedText = event.clipboardData?.getData('text/plain') || '';

    if (!pastedText.trim()) {
      return;
    }

    onPasteText(pastedText);
  };

  attach();

  const observer = new MutationObserver(() => {
    attach();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return () => {
    if (attachedInput) {
      attachedInput.removeEventListener('paste', handlePaste);
    }

    observer.disconnect();
  };
};
