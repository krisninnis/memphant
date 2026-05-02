/**
 * Prompt Guard - Local prompt analyzer
 *
 * Pure, deterministic checks only. This module does not upload, store, or
 * mutate prompt text.
 */

(function () {
  'use strict';

  window.PromptGuard = window.PromptGuard || {};

  const ISSUE_TYPES = {
    LONG_PROMPT: 'long_prompt',
    REPEATED_CONTEXT: 'repeated_context',
    TOO_MANY_TASKS: 'too_many_tasks',
    PROJECT_CONTEXT: 'project_context',
    CODE_OR_LOG_DUMP: 'code_or_log_dump',
  };

  const PROJECT_CONTEXT_PATTERNS = [
    /\bproject\s*:/i,
    /\bcurrent status\s*:/i,
    /\bgoals?\s*:/i,
    /\bnext steps?\s*:/i,
    /\bimportant files?\s*:/i,
    /\bopen questions?\s*:/i,
    /\bdecisions?\s*:/i,
    /\brules?\s*:/i,
    /\bhere'?s where we are\b/i,
    /\bmemphant_update\b/i,
    /\bmemephant\b/i,
  ];

  const TASK_PATTERNS = [
    /\balso\b/gi,
    /\band then\b/gi,
    /\bcan you also\b/gi,
    /\bafter that\b/gi,
    /\bthen\b/gi,
    /\bwhile you'?re at it\b/gi,
  ];

  const CODE_OR_LOG_PATTERNS = [
    /```[\s\S]*```/,
    /\b(error|exception|traceback|stack trace|uncaught|failed loading|net::err_|xhr finished loading|fetch finished loading)\b/i,
    /^\s*(at\s+\S+\s+\(|\w+Error:|POST\s+https?:\/\/|GET\s+https?:\/\/)/im,
    /[{[]\s*["']?[A-Za-z0-9_-]+["']?\s*:/,
    /^\s*(import|export|function|const|let|var|class)\s+/m,
  ];

  const FULL_FILE_INTENT_PATTERNS = [
    /\b(full|whole|entire)\s+(file|component|script|module)\b/i,
    /\b(check|review|inspect|debug|fix)\s+(this|the)\s+(file|component|script|module)\b/i,
    /\bhere'?s\s+(the|my)\s+(file|component|script|module)\b/i,
    /\bpasted?\s+(the\s+)?(full|whole|entire)\s+(file|component|script|module)\b/i,
  ];

  const FILE_PATH_PATTERNS = [
    /\b[\w./-]+\.(ts|tsx|js|jsx|mjs|cjs|rs|py|css|scss|html|json|md|toml|yaml|yml|go|java|cs|php|rb|swift|kt|vue|svelte)\b/i,
    /\b(file|filename|path)\s*:\s*[\w./\\-]+\b/i,
  ];

  const CODE_LINE_PATTERNS = [
    /^\s*(import|export)\s+.+/i,
    /^\s*(function|class|interface|type|enum)\s+\w+/i,
    /^\s*(const|let|var)\s+\w+\s*=/i,
    /^\s*(async\s+)?function\s*\w*\s*\(/i,
    /^\s*(public|private|protected)?\s*(async\s+)?\w+\s*\([^)]*\)\s*[{:]?/i,
    /^\s*(if|for|while|switch|try|catch)\s*\(/i,
    /^\s*return\b/i,
    /^\s*<\/?[A-Za-z][A-Za-z0-9.-]*(\s|>|\/>)/,
    /^\s*[.#]?[A-Za-z0-9_-]+\s*[{]/,
    /^\s*use\s+[A-Za-z0-9_:]+;/,
    /^\s*fn\s+\w+/,
    /^\s*(impl|struct|enum|trait)\s+\w+/,
    /^\s*[}\])];?,?\s*$/,
  ];

  function clampConfidence(value) {
    return Math.max(0, Math.min(1, Number(value.toFixed(2))));
  }

  function getSeverity(score) {
    if (score >= 8) return 'high';
    if (score >= 4) return 'medium';
    if (score >= 1) return 'low';
    return 'none';
  }

  function countMatches(text, patterns) {
    return patterns.reduce((count, pattern) => {
      const matches = text.match(pattern);
      return count + (matches ? matches.length : 0);
    }, 0);
  }

  function getLines(text) {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function countRepeatedLines(lines) {
    const seen = new Map();
    let repeated = 0;

    lines.forEach((line) => {
      if (line.length < 12) return;
      const key = line.toLowerCase();
      const count = seen.get(key) || 0;
      if (count === 1) repeated += 1;
      seen.set(key, count + 1);
    });

    return repeated;
  }

  function countRepeatedHeadings(lines) {
    const headings = lines.filter((line) =>
      /^#{1,6}\s+\S|^[A-Za-z][A-Za-z0-9 /_-]{2,50}:$/.test(line),
    );

    return countRepeatedLines(headings);
  }

  function countBullets(lines) {
    return lines.filter((line) => /^[-*+] |\d+[.)]\s+/.test(line)).length;
  }

  function countCodeLikeLines(lines) {
    return lines.filter((line) =>
      CODE_LINE_PATTERNS.some((pattern) => pattern.test(line)),
    ).length;
  }

  function countFencedCodeLines(text) {
    const fencePattern = /```[\w-]*\n([\s\S]*?)```/g;
    let match = fencePattern.exec(text);
    let total = 0;

    while (match) {
      total += getLines(match[1] || '').length;
      match = fencePattern.exec(text);
    }

    return total;
  }

  function looksLikeStrongProjectContext(text, projectKeywordCount) {
    return projectKeywordCount >= 3 || /\bmemphant_update\b/i.test(text);
  }

  function looksLikeIntentionalFullFilePaste(text, lines, projectKeywordCount) {
    if (lines.length < 20) return false;

    const codeLikeLineCount = countCodeLikeLines(lines);
    const fencedCodeLineCount = countFencedCodeLines(text);
    const fileIntentCount = countMatches(text, FULL_FILE_INTENT_PATTERNS);
    const filePathSignalCount = countMatches(text, FILE_PATH_PATTERNS);
    const codeRatio = codeLikeLineCount / Math.max(lines.length, 1);

    const hasStrongCodeShape =
      codeLikeLineCount >= 14 ||
      codeRatio >= 0.4 ||
      fencedCodeLineCount >= 20;

    const hasFileSignal =
      fileIntentCount > 0 ||
      filePathSignalCount > 0 ||
      /^\s*(import|export|use\s+[A-Za-z0-9_:]+;|package\s+\w+)/m.test(text);

    if (!hasStrongCodeShape || !hasFileSignal) {
      return false;
    }

    return !looksLikeStrongProjectContext(text, projectKeywordCount);
  }

  function createIssue(type, confidence, message, suggestedActions) {
    return {
      type,
      confidence: clampConfidence(confidence),
      message,
      suggestedActions,
    };
  }

  function chooseRecommendedAction(issues) {
    const types = new Set(issues.map((issue) => issue.type));

    if (types.has(ISSUE_TYPES.PROJECT_CONTEXT)) return 'use_memephant';
    if (types.has(ISSUE_TYPES.TOO_MANY_TASKS)) return 'split';
    if (
      types.has(ISSUE_TYPES.REPEATED_CONTEXT) ||
      types.has(ISSUE_TYPES.LONG_PROMPT) ||
      types.has(ISSUE_TYPES.CODE_OR_LOG_DUMP)
    ) {
      return 'compress';
    }

    return 'none';
  }

  function chooseSeverity(score, recommendedAction) {
    const severity = getSeverity(score);

    if (recommendedAction === 'use_memephant' && severity === 'low') {
      return 'medium';
    }

    return severity;
  }

  function analyzePrompt(text) {
    const rawText = String(text || '');
    const trimmedText = rawText.trim();
    const lines = getLines(trimmedText);
    const issues = [];

    if (!trimmedText) {
      return {
        score: 0,
        severity: 'none',
        issues,
        recommendedAction: 'none',
      };
    }

    const charCount = trimmedText.length;
    const repeatedLineCount = countRepeatedLines(lines);
    const repeatedHeadingCount = countRepeatedHeadings(lines);
    const bulletCount = countBullets(lines);
    const taskPhraseCount = countMatches(trimmedText, TASK_PATTERNS);
    const projectKeywordCount = countMatches(trimmedText, PROJECT_CONTEXT_PATTERNS);
    const codeLogSignalCount = countMatches(trimmedText, CODE_OR_LOG_PATTERNS);

    if (looksLikeIntentionalFullFilePaste(trimmedText, lines, projectKeywordCount)) {
      return {
        score: 0,
        severity: 'none',
        issues,
        recommendedAction: 'none',
      };
    }

    if (charCount >= 3000) {
      issues.push(createIssue(
        ISSUE_TYPES.LONG_PROMPT,
        charCount >= 6000 ? 0.95 : 0.75,
        'This prompt is quite long and may use a lot of AI usage.',
        ['compress', 'split'],
      ));
    }

    if (repeatedLineCount >= 2 || repeatedHeadingCount >= 1) {
      issues.push(createIssue(
        ISSUE_TYPES.REPEATED_CONTEXT,
        repeatedLineCount >= 4 || repeatedHeadingCount >= 2 ? 0.9 : 0.7,
        'This looks like repeated context. You may not need to send all of it again.',
        ['compress', 'use_memephant'],
      ));
    }

    if (taskPhraseCount >= 4 || bulletCount >= 10) {
      issues.push(createIssue(
        ISSUE_TYPES.TOO_MANY_TASKS,
        taskPhraseCount >= 7 || bulletCount >= 18 ? 0.9 : 0.65,
        'This prompt contains several tasks. Splitting it may give better answers.',
        ['split'],
      ));
    }

    if (projectKeywordCount >= 3) {
      issues.push(createIssue(
        ISSUE_TYPES.PROJECT_CONTEXT,
        projectKeywordCount >= 5 ? 0.95 : 0.75,
        'This looks like project context. Save it to Memephant once instead of pasting it every time.',
        ['use_memephant', 'compress', 'create_handoff'],
      ));
    }

    if (codeLogSignalCount >= 2 || (codeLogSignalCount >= 1 && charCount >= 1500)) {
      issues.push(createIssue(
        ISSUE_TYPES.CODE_OR_LOG_DUMP,
        codeLogSignalCount >= 3 ? 0.9 : 0.65,
        'This looks like code or logs. Sending only the relevant excerpt may save usage.',
        ['compress', 'split'],
      ));
    }

    const score = issues.reduce((total, issue) => {
      const issueWeight = issue.confidence >= 0.9 ? 3 : issue.confidence >= 0.75 ? 2 : 1;
      return total + issueWeight;
    }, 0);

    const recommendedAction = chooseRecommendedAction(issues);

    return {
      score,
      severity: chooseSeverity(score, recommendedAction),
      issues,
      recommendedAction,
    };
  }

  window.PromptGuard.analyzePrompt = analyzePrompt;
})();
