/**
 * Prompt Guard - Overlay v1
 *
 * Displays analyzer warnings only. It never modifies prompt text, sends data,
 * or stores raw drafts.
 */

(function () {
  'use strict';

  window.PromptGuard = window.PromptGuard || {};

  const OVERLAY_ID = 'prompt-guard-overlay';
  const SIGNIFICANT_CHANGE_BUCKET_SIZE = 250;

  let overlayEl = null;
  let ignoredDraftSignature = null;
  let isOverlayVisible = false;

  function shouldShow(result) {
    return result?.severity === 'medium' || result?.severity === 'high';
  }

  function getDraftSignature(text) {
    const normalizedText = String(text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const lengthBucket = Math.floor(normalizedText.length / SIGNIFICANT_CHANGE_BUCKET_SIZE);
    const start = normalizedText.slice(0, 160);
    const end = normalizedText.slice(-160);

    return `${lengthBucket}:${start}:${end}`;
  }

  function removeOverlay() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }

    if (isOverlayVisible) {
      isOverlayVisible = false;
      console.log('Prompt Guard: overlay hidden');
    }
  }

  function createButton(label, action, isPrimary) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.promptGuardAction = action;
    button.style.border = '1px solid rgba(148, 163, 184, 0.55)';
    button.style.borderRadius = '6px';
    button.style.background = isPrimary ? '#111827' : '#ffffff';
    button.style.color = isPrimary ? '#ffffff' : '#111827';
    button.style.font = '12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    button.style.padding = '7px 9px';
    button.style.cursor = 'pointer';
    button.style.whiteSpace = 'nowrap';
    return button;
  }

  function ensureOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      overlayEl = existing;
      return overlayEl;
    }

    overlayEl = document.createElement('section');
    overlayEl.id = OVERLAY_ID;
    overlayEl.setAttribute('role', 'status');
    overlayEl.setAttribute('aria-live', 'polite');
    overlayEl.style.position = 'fixed';
    overlayEl.style.left = '50%';
    overlayEl.style.bottom = '132px';
    overlayEl.style.transform = 'translateX(-50%)';
    overlayEl.style.zIndex = '2147483647';
    overlayEl.style.width = 'min(420px, calc(100vw - 32px))';
    overlayEl.style.maxHeight = 'min(320px, calc(100vh - 180px))';
    overlayEl.style.overflow = 'auto';
    overlayEl.style.boxSizing = 'border-box';
    overlayEl.style.border = '1px solid rgba(148, 163, 184, 0.45)';
    overlayEl.style.borderRadius = '8px';
    overlayEl.style.background = '#ffffff';
    overlayEl.style.color = '#111827';
    overlayEl.style.boxShadow = '0 16px 40px rgba(15, 23, 42, 0.18)';
    overlayEl.style.padding = '12px';
    overlayEl.style.font = '13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    overlayEl.style.pointerEvents = 'auto';

    if (!document.body) {
      return null;
    }

    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function getWarningMessage(result) {
    if (result.recommendedAction === 'use_memephant') {
      return 'This draft looks like reusable project context.';
    }

    if (result.recommendedAction === 'split') {
      return 'This draft may work better as smaller steps.';
    }

    return 'This draft may waste AI usage.';
  }

  function renderOverlay(result, draftSignature) {
    const el = ensureOverlay();
    if (!el) return;

    const issueMessages = (result.issues || [])
      .slice(0, 2)
      .map((issue) => issue.message);

    el.replaceChildren();

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.justifyContent = 'space-between';
    titleRow.style.gap = '12px';

    const title = document.createElement('div');
    title.textContent = 'Prompt Guard';
    title.style.fontWeight = '700';
    title.style.fontSize = '14px';

    const severity = document.createElement('div');
    severity.textContent = result.severity;
    severity.style.borderRadius = '999px';
    severity.style.background = result.severity === 'high' ? '#fee2e2' : '#fef3c7';
    severity.style.color = result.severity === 'high' ? '#991b1b' : '#92400e';
    severity.style.padding = '3px 8px';
    severity.style.fontSize = '12px';
    severity.style.textTransform = 'capitalize';

    titleRow.append(title, severity);

    const warning = document.createElement('div');
    warning.textContent = getWarningMessage(result);
    warning.style.marginTop = '8px';

    const issueList = document.createElement('ul');
    issueList.style.margin = '8px 0 0';
    issueList.style.paddingLeft = '18px';

    issueMessages.forEach((message) => {
      const item = document.createElement('li');
      item.textContent = message;
      item.style.marginTop = '4px';
      issueList.appendChild(item);
    });

    const recommendation = document.createElement('div');
    recommendation.textContent = `Recommended: ${result.recommendedAction.replace(/_/g, ' ')}`;
    recommendation.style.marginTop = '8px';
    recommendation.style.fontWeight = '600';

    const buttons = document.createElement('div');
    buttons.style.display = 'flex';
    buttons.style.flexWrap = 'wrap';
    buttons.style.gap = '6px';
    buttons.style.marginTop = '10px';

    buttons.append(
      createButton('Ignore', 'ignore', false),
      createButton('Use Memephant', 'use_memephant', result.recommendedAction === 'use_memephant'),
      createButton('Compress', 'compress', result.recommendedAction === 'compress'),
      createButton('Split', 'split', result.recommendedAction === 'split'),
    );

    buttons.addEventListener('click', (event) => {
      const button = event.target.closest('[data-prompt-guard-action]');
      if (!button) return;

      const action = button.dataset.promptGuardAction;

      if (action === 'ignore') {
        ignoredDraftSignature = draftSignature;
        removeOverlay();
        console.log('Prompt Guard: ignored current draft');
        return;
      }

      console.log(`Prompt Guard: ${action} clicked`, {
        recommendedAction: result.recommendedAction,
        severity: result.severity,
      });
    });

    el.append(titleRow, warning, issueList, recommendation, buttons);

    if (!isOverlayVisible) {
      isOverlayVisible = true;
      console.log('Prompt Guard: overlay shown');
    }
  }

  function updateOverlay(text, result) {
    const draftSignature = getDraftSignature(text);

    if (!shouldShow(result)) {
      removeOverlay();
      return;
    }

    if (ignoredDraftSignature && ignoredDraftSignature === draftSignature) {
      removeOverlay();
      return;
    }

    renderOverlay(result, draftSignature);
  }

  window.PromptGuard.updateOverlay = updateOverlay;
  window.PromptGuard.hideOverlay = removeOverlay;
})();
