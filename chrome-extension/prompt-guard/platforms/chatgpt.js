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
  'div[contenteditable="true"][aria-label="Chat with ChatGPT"]',
  'div[contenteditable="true"]',
  'textarea',
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
  let isPasting = false;

  const handlePaste = () => {
    isPasting = true;
  };

  const handleInput = () => {
    if (!isPasting || !attachedInput) {
      return;
    }

    isPasting = false;

    const pastedText = attachedInput.innerText || attachedInput.textContent || attachedInput.value || '';

    if (!pastedText.trim()) {
      return;
    }

    onPasteText(pastedText);
  };

  const attach = () => {
    const input = findChatGptInput();

    if (!input || input === attachedInput) {
      return;
    }

    if (attachedInput) {
      attachedInput.removeEventListener('paste', handlePaste);
      attachedInput.removeEventListener('input', handleInput);
    }

    attachedInput = input;
    attachedInput.addEventListener('paste', handlePaste);
    attachedInput.addEventListener('input', handleInput);
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
      attachedInput.removeEventListener('input', handleInput);
    }

    observer.disconnect();
  };
};
