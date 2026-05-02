(function () {
  'use strict';

  window.PromptGuard = window.PromptGuard || {};

  window.PromptGuard.attachChatGptPasteListener = function (onPasteText) {
    const readComposerText = () => {
      const input =
        document.querySelector('#prompt-textarea') ||
        document.querySelector('div[contenteditable="true"]') ||
        document.querySelector('textarea');

      return input?.innerText || input?.textContent || input?.value || '';
    };

    const isInsideComposer = (target) => {
      const activeElement = document.activeElement;

      const targetIsInside =
        target instanceof Element &&
        Boolean(
          target.closest('#prompt-textarea') ||
            target.closest('div[contenteditable="true"]') ||
            target.closest('textarea'),
        );

      const activeElementIsInside =
        activeElement instanceof Element &&
        Boolean(
          activeElement.closest('#prompt-textarea') ||
            activeElement.closest('div[contenteditable="true"]') ||
            activeElement.closest('textarea'),
        );

      return targetIsInside || activeElementIsInside;
    };

    const isLikelySendButton = (target) => {
      if (!(target instanceof Element)) return false;

      const button = target.closest('button');
      if (!button) return false;

      const label = [
        button.getAttribute('aria-label'),
        button.getAttribute('data-testid'),
        button.getAttribute('title'),
        button.id,
        button.className,
        button.textContent,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (
        label.includes('send') ||
        label.includes('submit') ||
        label.includes('composer-submit') ||
        label.includes('send-button')
      ) {
        return true;
      }

      const form = button.closest('form');
      const composer = document.querySelector('#prompt-textarea');
      return Boolean(form && composer && form.contains(composer));
    };

    const hidePromptGuardOverlay = () => {
      if (typeof window.PromptGuard.hideOverlay === 'function') {
        window.PromptGuard.hideOverlay();
      }
    };

    const hidePromptGuardAfterSubmit = () => {
      hidePromptGuardOverlay();

      window.setTimeout(hidePromptGuardOverlay, 50);
      window.setTimeout(hidePromptGuardOverlay, 250);
      window.setTimeout(hidePromptGuardOverlay, 700);
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
        const text = readComposerText();

        if (!text.trim()) {
          hidePromptGuardOverlay();
          return;
        }

        handleText(text);
      }, 50);
    };

    const shouldTreatEnterAsSubmit = (event) => {
      if (event.defaultPrevented) return false;
      if (event.key !== 'Enter') return false;
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
      if (event.isComposing) return false;
      if (!isInsideComposer(event.target)) return false;

      return readComposerText().trim().length > 0;
    };

    const handleKeyDown = (event) => {
      if (!shouldTreatEnterAsSubmit(event)) return;
      hidePromptGuardAfterSubmit();
    };

    const handleKeyUp = (event) => {
      if (!shouldTreatEnterAsSubmit(event)) return;
      hidePromptGuardAfterSubmit();
    };

    const handleClick = (event) => {
      if (!isLikelySendButton(event.target)) return;

      const draft = readComposerText();
      if (!draft.trim()) return;

      hidePromptGuardAfterSubmit();
    };

    const handleSubmit = () => {
      hidePromptGuardAfterSubmit();
    };

    document.addEventListener('paste', handlePaste, true);
    document.addEventListener('beforeinput', handleBeforeInput, true);
    document.addEventListener('input', handleInput, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('submit', handleSubmit, true);

    return () => {
      document.removeEventListener('paste', handlePaste, true);
      document.removeEventListener('beforeinput', handleBeforeInput, true);
      document.removeEventListener('input', handleInput, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keyup', handleKeyUp, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('submit', handleSubmit, true);
    };
  };
})();