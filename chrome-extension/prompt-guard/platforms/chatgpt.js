(function () {
  'use strict';

  window.PromptGuard = window.PromptGuard || {};

  window.PromptGuard.attachChatGptPasteListener = function (onPasteText) {
    const readComposerText = () => {
      const input = document.querySelector('#prompt-textarea') ||
                    document.querySelector('div[contenteditable="true"]') ||
                    document.querySelector('textarea');
      return input?.innerText || input?.textContent || input?.value || '';
    };

    const handleText = (text) => {
      const normalizedText = text || '';

      if (normalizedText.trim()) {
        onPasteText(normalizedText);
      }
    };

    const handlePaste = (event) => {
      const direct = event.clipboardData?.getData('text/plain') || '';
      if (direct.trim()) {
        handleText(direct);
        return;
      }

      setTimeout(() => {
        handleText(readComposerText());
      }, 50);
    };

    const handleBeforeInput = (event) => {
      if (event.inputType !== 'insertFromPaste') return;

      const direct =
        event.dataTransfer?.getData('text/plain') ||
        event.data ||
        '';

      if (direct.trim()) {
        handleText(direct);
        return;
      }

      setTimeout(() => {
        handleText(readComposerText());
      }, 50);
    };

    const handleInput = () => {
      setTimeout(() => {
        handleText(readComposerText());
      }, 50);
    };

    document.addEventListener('paste', handlePaste, true);
    document.addEventListener('beforeinput', handleBeforeInput, true);
    document.addEventListener('input', handleInput, true);

    return () => {
      document.removeEventListener('paste', handlePaste, true);
      document.removeEventListener('beforeinput', handleBeforeInput, true);
      document.removeEventListener('input', handleInput, true);
    };
  };
})();
