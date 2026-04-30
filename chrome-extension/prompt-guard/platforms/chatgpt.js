(function () {
  'use strict';

  window.PromptGuard = window.PromptGuard || {};

  window.PromptGuard.attachChatGptPasteListener = function (onPasteText) {
    const handlePaste = (event) => {
      const text = event.clipboardData?.getData('text/plain') || '';
      if (!text.trim()) return;
      onPasteText(text);
    };

    document.addEventListener('paste', handlePaste, true);

    return () => {
      document.removeEventListener('paste', handlePaste, true);
    };
  };
})();