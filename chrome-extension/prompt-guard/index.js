/**
 * Prompt Guard - Entry point
 *
 * Wires ChatGPT paste/draft detection to the local analyzer and overlay.
 * Runtime behaviour respects popup settings stored in chrome.storage.local.
 */

(function () {
  'use strict';

  window.PromptGuard = window.PromptGuard || {};

  const DEFAULT_PROMPT_GUARD_SETTINGS = {
    promptGuardEnabled: true,
    promptGuardChatgptEnabled: true,
    promptGuardThreshold: 'medium_and_high',
  };

  let promptGuardSettings = { ...DEFAULT_PROMPT_GUARD_SETTINGS };

  function isChatGptSite() {
    return (
      location.hostname.includes('chatgpt.com') ||
      location.hostname.includes('chat.openai.com')
    );
  }

  function canUseChromeStorage() {
    return Boolean(
      typeof chrome !== 'undefined' &&
        chrome.storage &&
        chrome.storage.local,
    );
  }

  function loadPromptGuardSettings() {
    return new Promise((resolve) => {
      if (!canUseChromeStorage()) {
        resolve({ ...DEFAULT_PROMPT_GUARD_SETTINGS });
        return;
      }

      chrome.storage.local.get(DEFAULT_PROMPT_GUARD_SETTINGS, (items) => {
        const error = chrome.runtime?.lastError;

        if (error) {
          console.warn('Prompt Guard: could not load settings', error);
          resolve({ ...DEFAULT_PROMPT_GUARD_SETTINGS });
          return;
        }

        resolve({
          ...DEFAULT_PROMPT_GUARD_SETTINGS,
          ...(items || {}),
        });
      });
    });
  }

  function shouldShowForThreshold(result) {
    const severity = result?.severity;

    if (promptGuardSettings.promptGuardThreshold === 'high_only') {
      return severity === 'high';
    }

    return severity === 'medium' || severity === 'high';
  }

  function shouldShowPromptGuard(result) {
    if (!promptGuardSettings.promptGuardEnabled) {
      return false;
    }

    if (isChatGptSite() && !promptGuardSettings.promptGuardChatgptEnabled) {
      return false;
    }

    return shouldShowForThreshold(result);
  }

  function hidePromptGuardOverlay() {
    if (typeof window.PromptGuard.hideOverlay === 'function') {
      window.PromptGuard.hideOverlay();
    }
  }

  function handlePromptGuardDraft(text) {
    if (
    !promptGuardSettings.promptGuardEnabled ||
    (isChatGptSite() && !promptGuardSettings.promptGuardChatgptEnabled)
    ) {
    hidePromptGuardOverlay();
    return;
    }

    if (typeof window.PromptGuard.analyzePrompt !== 'function') {
    console.warn('Prompt Guard: analyzer not available');
    return;
    }

    const result = window.PromptGuard.analyzePrompt(text);

    console.log('Prompt Guard: analyzer result', result);

    if (!shouldShowPromptGuard(result)) {
    hidePromptGuardOverlay();
    return;
    }
    if (typeof window.PromptGuard.updateOverlay === 'function') {
      window.PromptGuard.updateOverlay(text, result);
      return;
    }

    console.warn('Prompt Guard: overlay not available');
  }

  function listenForSettingsChanges() {
    if (
      typeof chrome === 'undefined' ||
      !chrome.storage ||
      !chrome.storage.onChanged
    ) {
      return;
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') {
        return;
      }

      const relevantKeys = [
        'promptGuardEnabled',
        'promptGuardChatgptEnabled',
        'promptGuardThreshold',
      ];

      const hasPromptGuardChange = relevantKeys.some((key) => changes[key]);

      if (!hasPromptGuardChange) {
        return;
      }

      for (const key of relevantKeys) {
        if (changes[key]) {
          promptGuardSettings[key] = changes[key].newValue;
        }
      }

      promptGuardSettings = {
        ...DEFAULT_PROMPT_GUARD_SETTINGS,
        ...promptGuardSettings,
      };

      hidePromptGuardOverlay();

      console.log('Prompt Guard: settings updated', promptGuardSettings);
    });
  }

  async function startPromptGuard() {
    if (!isChatGptSite()) {
      return;
    }

    promptGuardSettings = await loadPromptGuardSettings();
    listenForSettingsChanges();

    if (typeof window.PromptGuard.attachChatGptPasteListener !== 'function') {
      console.warn('Prompt Guard: ChatGPT adapter not available');
      return;
    }

    window.PromptGuard.attachChatGptPasteListener(handlePromptGuardDraft);

    console.log('Prompt Guard: started with settings', promptGuardSettings);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      startPromptGuard().catch((err) => {
        console.error('Prompt Guard: failed to start', err);
      });
    });
  } else {
    startPromptGuard().catch((err) => {
      console.error('Prompt Guard: failed to start', err);
    });
  }
})();