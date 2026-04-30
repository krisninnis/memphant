(function () {
  'use strict';

  window.PromptGuard = window.PromptGuard || {};

  window.PromptGuard.attachChatGptPasteListener = function (onPasteText) {
    const handlePaste = (event) => {
      // Try clipboard data first
      const direct = event.clipboardData?.getData('text/plain') || '';
      if (direct.trim()) {
        onPasteText(direct);
        return;
      }
      // Fallback: read from DOM after paste lands
      setTimeout(() => {
        const input = document.querySelector('#prompt-textarea') ||
                      document.querySelector('div[contenteditable="true"]');
        if (!input) return;
        const text = input.innerText || input.textContent || '';
        if (text.trim()) onPasteText(text);
      }, 50);
    };

    document.addEventListener('paste', handlePaste, true);

    return () => {
      document.removeEventListener('paste', handlePaste, true);
    };
  };
})();