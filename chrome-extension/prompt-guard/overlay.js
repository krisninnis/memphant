/**
 * Prompt Guard - Overlay v2
 *
 * Displays analyzer warnings and safe local actions.
 * It never uploads prompts, sends messages, or auto-replaces draft text.
 */

(function () {
  'use strict';

  window.PromptGuard = window.PromptGuard || {};

  const OVERLAY_ID = 'prompt-guard-overlay';
  const SIGNIFICANT_CHANGE_BUCKET_SIZE = 250;
  const MAX_PREVIEW_CHARS = 5000;
  const SPLIT_TARGET_CHARS = 1800;

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

  function createSmallButton(label, action, isPrimary) {
    const button = createButton(label, action, isPrimary);
    button.style.fontSize = '12px';
    button.style.padding = '7px 10px';
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
    overlayEl.style.width = 'min(460px, calc(100vw - 32px))';
    overlayEl.style.maxHeight = 'min(420px, calc(100vh - 180px))';
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

    if (result.recommendedAction === 'compress') {
      return 'This draft may be longer than it needs to be.';
    }

    return 'This draft may waste AI usage.';
  }

  async function copyToClipboard(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      console.log(successMessage);
      return true;
    } catch (err) {
      console.warn('Prompt Guard: clipboard copy failed', err);
      return false;
    }
  }

  function normalizeLines(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, '  ')
      .split('\n')
      .map((line) => line.trimEnd());
  }

  function looksLikeNoisyLogLine(line) {
    const trimmed = line.trim();

    if (!trimmed) return false;

    return (
      /^Fetch finished loading:/i.test(trimmed) ||
      /^XHR finished loading:/i.test(trimmed) ||
      /^The resource .* was preloaded/i.test(trimmed) ||
      /^at\s+\S+/.test(trimmed) ||
      /^\(?index\)?:\d+/i.test(trimmed) ||
      /^https:\/\/chatgpt\.com\/cdn\//i.test(trimmed)
    );
  }

  function compressDraft(text) {
    const lines = normalizeLines(text);
    const seen = new Set();
    const output = [];
    let removedBlankLines = 0;
    let removedDuplicateLines = 0;
    let removedNoisyLines = 0;
    let shortenedLines = 0;
    let previousWasBlank = false;

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      if (!trimmed) {
        if (!previousWasBlank) {
          output.push('');
          previousWasBlank = true;
        } else {
          removedBlankLines += 1;
        }
        continue;
      }

      previousWasBlank = false;

      if (looksLikeNoisyLogLine(line)) {
        removedNoisyLines += 1;
        continue;
      }

      const dedupeKey = trimmed.toLowerCase();

      if (trimmed.length > 12 && seen.has(dedupeKey)) {
        removedDuplicateLines += 1;
        continue;
      }

      seen.add(dedupeKey);

      if (line.length > 280) {
        output.push(`${line.slice(0, 240)} … [line shortened]`);
        shortenedLines += 1;
        continue;
      }

      output.push(line);
    }

    const compressed = output.join('\n').trim();

    const stats = [
      removedBlankLines ? `${removedBlankLines} repeated blank lines removed` : null,
      removedDuplicateLines ? `${removedDuplicateLines} duplicate lines removed` : null,
      removedNoisyLines ? `${removedNoisyLines} noisy log/network lines removed` : null,
      shortenedLines ? `${shortenedLines} long lines shortened` : null,
    ].filter(Boolean);

    return {
      text: compressed || String(text || '').trim(),
      stats,
    };
  }

  function splitDraft(text) {
    const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
    const paragraphs = normalized.split(/\n\s*\n/);
    const chunks = [];
    let current = '';

    for (const paragraph of paragraphs) {
      const cleanParagraph = paragraph.trim();
      if (!cleanParagraph) continue;

      if ((current + '\n\n' + cleanParagraph).trim().length > SPLIT_TARGET_CHARS && current.trim()) {
        chunks.push(current.trim());
        current = cleanParagraph;
      } else {
        current = (current ? `${current}\n\n${cleanParagraph}` : cleanParagraph);
      }
    }

    if (current.trim()) {
      chunks.push(current.trim());
    }

    if (chunks.length <= 1 && normalized.length > SPLIT_TARGET_CHARS) {
      const forcedChunks = [];
      for (let i = 0; i < normalized.length; i += SPLIT_TARGET_CHARS) {
        forcedChunks.push(normalized.slice(i, i + SPLIT_TARGET_CHARS).trim());
      }
      return forcedChunks.filter(Boolean);
    }

    return chunks;
  }

  function buildSplitPlan(text) {
    const chunks = splitDraft(text);

    if (chunks.length <= 1) {
      return {
        chunks,
        text:
          'Prompt Guard could not find a clean split point. This draft may already be short enough, or it may need manual splitting.',
      };
    }

    const body = chunks
      .map((chunk, index) => {
        return [
          `--- Part ${index + 1} of ${chunks.length} ---`,
          chunk,
        ].join('\n');
      })
      .join('\n\n');

    return {
      chunks,
      text: body,
    };
  }

  function buildMemephantGuidance(text) {
    const trimmed = String(text || '').trim();

    return [
      'Prompt Guard found reusable project context.',
      '',
      'Recommended Memephant workflow:',
      '1. Open Memephant.',
      '2. Update the project memory there instead of pasting the same context into every AI chat.',
      '3. Use Memephant’s Copy for AI button to generate a cleaner platform-specific handoff.',
      '',
      'Why:',
      '- Saves tokens.',
      '- Keeps the project memory reusable.',
      '- Avoids repeatedly pasting stale context.',
      '',
      'Detected draft:',
      trimmed,
    ].join('\n');
  }

  function truncatePreview(text) {
    const value = String(text || '');

    if (value.length <= MAX_PREVIEW_CHARS) {
      return value;
    }

    return `${value.slice(0, MAX_PREVIEW_CHARS)}\n\n[Preview truncated. Copy still includes full generated text.]`;
  }

  function renderActionPreview(options) {
    const el = ensureOverlay();
    if (!el) return;

    const {
      title,
      subtitle,
      body,
      copyLabel,
      copyPayload,
      backPayload,
      stats,
    } = options;

    el.replaceChildren();

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.justifyContent = 'space-between';
    titleRow.style.gap = '12px';

    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    titleEl.style.fontWeight = '700';
    titleEl.style.fontSize = '14px';

    const safeBadge = document.createElement('div');
    safeBadge.textContent = 'Preview';
    safeBadge.style.borderRadius = '999px';
    safeBadge.style.background = '#dbeafe';
    safeBadge.style.color = '#1e40af';
    safeBadge.style.padding = '3px 8px';
    safeBadge.style.fontSize = '12px';

    titleRow.append(titleEl, safeBadge);

    const subtitleEl = document.createElement('div');
    subtitleEl.textContent = subtitle;
    subtitleEl.style.marginTop = '8px';

    const privacy = document.createElement('div');
    privacy.textContent = 'Nothing is sent or changed automatically. Review before copying.';
    privacy.style.marginTop = '6px';
    privacy.style.color = '#475569';
    privacy.style.fontSize = '12px';

    const preview = document.createElement('pre');
    preview.textContent = truncatePreview(body);
    preview.style.margin = '10px 0 0';
    preview.style.padding = '10px';
    preview.style.border = '1px solid rgba(148, 163, 184, 0.35)';
    preview.style.borderRadius = '6px';
    preview.style.background = '#f8fafc';
    preview.style.color = '#0f172a';
    preview.style.whiteSpace = 'pre-wrap';
    preview.style.wordBreak = 'break-word';
    preview.style.maxHeight = '180px';
    preview.style.overflow = 'auto';
    preview.style.font = '12px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

    const statsEl = document.createElement('div');
    if (Array.isArray(stats) && stats.length > 0) {
      statsEl.textContent = stats.join(' · ');
      statsEl.style.marginTop = '8px';
      statsEl.style.color = '#475569';
      statsEl.style.fontSize = '12px';
    }

    const buttons = document.createElement('div');
    buttons.style.display = 'flex';
    buttons.style.flexWrap = 'wrap';
    buttons.style.gap = '6px';
    buttons.style.marginTop = '10px';

    buttons.append(
      createSmallButton(copyLabel, 'copy_action_payload', true),
      createSmallButton('Back', 'back_to_warning', false),
      createSmallButton('Close', 'close', false),
    );

    buttons.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-prompt-guard-action]');
      if (!button) return;

      const action = button.dataset.promptGuardAction;

      if (action === 'copy_action_payload') {
        const copied = await copyToClipboard(copyPayload, `Prompt Guard: ${copyLabel} copied`);
        button.textContent = copied ? 'Copied' : 'Copy failed';
        return;
      }

      if (action === 'back_to_warning') {
        renderOverlay(backPayload.result, backPayload.draftSignature, backPayload.text);
        return;
      }

      if (action === 'close') {
        removeOverlay();
      }
    });

    el.append(titleRow, subtitleEl, privacy, preview);

    if (statsEl.textContent) {
      el.appendChild(statsEl);
    }

    el.appendChild(buttons);

    if (!isOverlayVisible) {
      isOverlayVisible = true;
      console.log('Prompt Guard: overlay shown');
    }
  }

  function renderOverlay(result, draftSignature, text) {
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

      if (action === 'compress') {
        const compressed = compressDraft(text);

        renderActionPreview({
          title: 'Compressed draft',
          subtitle: 'Review the shortened local version before using it.',
          body: compressed.text,
          copyLabel: 'Copy compressed',
          copyPayload: compressed.text,
          stats: compressed.stats,
          backPayload: { result, draftSignature, text },
        });

        console.log('Prompt Guard: compress preview opened', {
          originalChars: String(text || '').length,
          compressedChars: compressed.text.length,
        });
        return;
      }

      if (action === 'split') {
        const splitPlan = buildSplitPlan(text);

        renderActionPreview({
          title: 'Split draft',
          subtitle: `${splitPlan.chunks.length} part${splitPlan.chunks.length === 1 ? '' : 's'} prepared locally.`,
          body: splitPlan.text,
          copyLabel: 'Copy split plan',
          copyPayload: splitPlan.text,
          stats: [`${splitPlan.chunks.length} part${splitPlan.chunks.length === 1 ? '' : 's'}`],
          backPayload: { result, draftSignature, text },
        });

        console.log('Prompt Guard: split preview opened', {
          originalChars: String(text || '').length,
          parts: splitPlan.chunks.length,
        });
        return;
      }

      if (action === 'use_memephant') {
        const guidance = buildMemephantGuidance(text);

        renderActionPreview({
          title: 'Use Memephant',
          subtitle: 'Use this context in Memephant instead of repeatedly pasting it into AI chats.',
          body: guidance,
          copyLabel: 'Copy guidance',
          copyPayload: guidance,
          stats: ['Desktop bridge not wired yet'],
          backPayload: { result, draftSignature, text },
        });

        console.log('Prompt Guard: use_memephant preview opened');
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

    renderOverlay(result, draftSignature, text);
  }

  window.PromptGuard.updateOverlay = updateOverlay;
  window.PromptGuard.hideOverlay = removeOverlay;
})();