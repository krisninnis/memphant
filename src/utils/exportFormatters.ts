/**
 * Platform-specific export formatters.
 * Each formatter takes a ProjectMemory + optional task + mode and returns a string.
 * CRITICAL: linkedFolder.path is NEVER included in any output.
 */
import type { ProjectMemory, Platform, ExportMode } from '../types/project-brain-types';

// ─── Secret sanitiser ─────────────────────────────────────────────────────────

const STANDARD_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /ghp_[A-Za-z0-9]{36}/g,
  /xoxb-[A-Za-z0-9-]+/g,
  /-----BEGIN [A-Z ]+ KEY-----/g,
  /eyJ[A-Za-z0-9+/=]{20,}/g,
];

// Strict mode adds database URLs, password= patterns, and generic secrets
const STRICT_EXTRA_PATTERNS = [
  /(postgres|mysql|mongodb|redis):\/\/[^\s"']+/gi,
  /password\s*[=:]\s*\S+/gi,
  /secret\s*[=:]\s*\S+/gi,
  /token\s*[=:]\s*["']?[A-Za-z0-9_\-]{20,}["']?/gi,
  /api[_-]?key\s*[=:]\s*["']?[A-Za-z0-9_\-]{16,}["']?/gi,
];

let _scannerLevel: 'standard' | 'strict' = 'standard';

/** Call this once before any export to configure the scanner level. */
export function setScannerLevel(level: 'standard' | 'strict'): void {
  _scannerLevel = level;
}

function sanitize(text: string): string {
  let out = text;
  for (const pattern of STANDARD_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  if (_scannerLevel === 'strict') {
    for (const pattern of STRICT_EXTRA_PATTERNS) {
      out = out.replace(pattern, '[REDACTED]');
    }
  }
  return out;
}

function sanitizeList(items: string[]): string[] {
  return items.map(sanitize);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bulletList(items: string[], indent = '  '): string {
  if (!items.length) return `${indent}(none)`;
  return items.map((i) => `${indent}- ${sanitize(i)}`).join('\n');
}

function numberedList(items: string[], indent = ''): string {
  if (!items.length) return `${indent}(none)`;
  return items.map((i, idx) => `${indent}${idx + 1}. ${sanitize(i)}`).join('\n');
}

function decisionsBlock(decisions: ProjectMemory['decisions'], indent = '  '): string {
  if (!decisions.length) return `${indent}(none)`;
  return decisions
    .map((d) => {
      const lines = [`${indent}- ${sanitize(d.decision)}`];
      if (d.rationale) lines.push(`${indent}  Rationale: ${sanitize(d.rationale)}`);
      return lines.join('\n');
    })
    .join('\n');
}

const RESPONSE_FORMAT = `
When you finish, include a project update block at the end of your response like this:

project_brain_update
{
  "summary": "one-sentence summary of the project",
  "currentState": "what is true right now after your work",
  "goals": ["any new goals to add"],
  "decisions": [{"decision": "any new decisions", "rationale": "why"}],
  "nextSteps": ["any new next steps to add"]
}`;

// ─── Claude (XML structured) ──────────────────────────────────────────────────

function formatForClaude(project: ProjectMemory, task?: string): string {
  const lines: string[] = [];

  lines.push(`<project_context>`);
  lines.push(`  <name>${sanitize(project.name)}</name>`);
  lines.push(`  <summary>${sanitize(project.summary || '(no summary yet)')}</summary>`);
  lines.push(`  <current_state>${sanitize(project.currentState || '(not set)')}</current_state>`);

  lines.push(`  <goals>`);
  lines.push(bulletList(project.goals));
  lines.push(`  </goals>`);

  lines.push(`  <rules>`);
  lines.push(bulletList(project.rules));
  lines.push(`  </rules>`);

  lines.push(`  <key_decisions>`);
  lines.push(decisionsBlock(project.decisions));
  lines.push(`  </key_decisions>`);

  lines.push(`  <next_steps>`);
  lines.push(bulletList(project.nextSteps));
  lines.push(`  </next_steps>`);

  lines.push(`  <open_questions>`);
  lines.push(bulletList(project.openQuestions));
  lines.push(`  </open_questions>`);

  const safeAssets = sanitizeList(project.importantAssets);
  if (safeAssets.length > 0) {
    lines.push(`  <important_assets>`);
    lines.push(bulletList(safeAssets));
    lines.push(`  </important_assets>`);
  }

  if (task && task.trim()) {
    lines.push(`  <task>`);
    lines.push(`    <description>${sanitize(task)}</description>`);
    lines.push(`    <boundaries>Focus only on this task. Do not modify anything outside the scope of this task.</boundaries>`);
    lines.push(`  </task>`);
  }

  if (project.aiInstructions) {
    lines.push(`  <ai_instructions>${sanitize(project.aiInstructions)}</ai_instructions>`);
  }

  lines.push(`</project_context>`);
  lines.push(RESPONSE_FORMAT);

  return lines.join('\n');
}

// ─── ChatGPT (conversational prose) ──────────────────────────────────────────

function formatForChatGPT(project: ProjectMemory, task?: string): string {
  const lines: string[] = [];

  lines.push(`# Project: ${sanitize(project.name)}`);
  lines.push('');
  lines.push(`Here's where we are with this project:`);
  lines.push('');
  lines.push(sanitize(project.summary || '(no summary yet)'));
  lines.push('');

  lines.push(`## Current Status`);
  lines.push(sanitize(project.currentState || '(not set)'));
  lines.push('');

  lines.push(`## Goals`);
  lines.push(numberedList(project.goals));
  lines.push('');

  lines.push(`## Rules to Follow`);
  lines.push(bulletList(project.rules));
  lines.push('');

  lines.push(`## Key Decisions Made`);
  lines.push(decisionsBlock(project.decisions, ''));
  lines.push('');

  lines.push(`## What's Next`);
  lines.push(numberedList(project.nextSteps));
  lines.push('');

  lines.push(`## Open Questions`);
  lines.push(bulletList(project.openQuestions));
  lines.push('');

  const safeAssets = sanitizeList(project.importantAssets);
  if (safeAssets.length > 0) {
    lines.push(`## Important Files & Assets`);
    lines.push(bulletList(safeAssets));
    lines.push('');
  }

  if (task && task.trim()) {
    lines.push(`---`);
    lines.push(`## Your Task`);
    lines.push(sanitize(task));
    lines.push('');
    lines.push(`Please focus only on this task. Don't modify anything outside its scope.`);
    lines.push('');
  }

  if (project.aiInstructions) {
    lines.push(sanitize(project.aiInstructions));
    lines.push('');
  }

  lines.push(RESPONSE_FORMAT);

  return lines.join('\n');
}

// ─── Grok (compressed minimal) ────────────────────────────────────────────────

function formatForGrok(project: ProjectMemory, task?: string): string {
  const lines: string[] = [];

  lines.push(`PROJECT: ${sanitize(project.name)}`);
  lines.push(`STATUS: ${sanitize(project.currentState || 'not set')}`);
  if (task && task.trim()) lines.push(`TASK: ${sanitize(task)}`);
  lines.push(`GOALS: ${sanitizeList(project.goals).join(', ') || 'none'}`);
  lines.push(`RULES: ${sanitizeList(project.rules).join(', ') || 'none'}`);

  if (project.decisions.length > 0) {
    lines.push(`DECISIONS:`);
    project.decisions.forEach((d) => {
      lines.push(`  - ${sanitize(d.decision)}`);
      if (d.rationale) lines.push(`    (${sanitize(d.rationale)})`);
    });
  }

  lines.push(`NEXT: ${sanitizeList(project.nextSteps).join(', ') || 'none'}`);
  lines.push(`QUESTIONS: ${sanitizeList(project.openQuestions).join(', ') || 'none'}`);

  if (task && task.trim()) {
    lines.push(`SCOPE: Focus on the task above. Don't change anything else.`);
  }

  if (project.aiInstructions) {
    lines.push('');
    lines.push(sanitize(project.aiInstructions));
  }

  lines.push('');
  lines.push(`When done, include: project_brain_update {"summary":"...","goals":[...],"currentState":"...","nextSteps":[...]}`);

  return lines.join('\n');
}

// ─── Perplexity (research-framed) ────────────────────────────────────────────

function formatForPerplexity(project: ProjectMemory, task?: string): string {
  const lines: string[] = [];

  lines.push(`I'm working on a project called ${sanitize(project.name)}.`);
  lines.push('');
  lines.push(sanitize(project.summary || '(no summary yet)'));
  lines.push('');
  lines.push(`Current state: ${sanitize(project.currentState || 'not set')}`);
  lines.push('');

  if (task && task.trim()) {
    lines.push(`I need help with this specific research task: ${sanitize(task)}`);
  } else if (project.openQuestions.length > 0) {
    lines.push(`Here's what I need help researching:`);
    lines.push(numberedList(project.openQuestions));
  }
  lines.push('');

  if (project.decisions.length > 0) {
    lines.push(`For context, here are the key decisions we've made so far:`);
    lines.push(decisionsBlock(project.decisions, ''));
    lines.push('');
  }

  if (project.rules.length > 0) {
    lines.push(`And the rules we're following:`);
    lines.push(bulletList(project.rules));
    lines.push('');
  }

  if (project.aiInstructions) {
    lines.push(sanitize(project.aiInstructions));
    lines.push('');
  }

  lines.push(RESPONSE_FORMAT);

  return lines.join('\n');
}

// ─── Gemini (ChatGPT-style with ## headings and bold emphasis) ────────────────

function formatForGemini(project: ProjectMemory, task?: string): string {
  const lines: string[] = [];

  lines.push(`## Project: **${sanitize(project.name)}**`);
  lines.push('');
  lines.push(sanitize(project.summary || '(no summary yet)'));
  lines.push('');

  lines.push(`## Current Status`);
  lines.push(`**${sanitize(project.currentState || 'not set')}**`);
  lines.push('');

  lines.push(`## Goals`);
  lines.push(numberedList(project.goals));
  lines.push('');

  lines.push(`## Rules to Follow`);
  lines.push(bulletList(project.rules));
  lines.push('');

  lines.push(`## Key Decisions Made`);
  lines.push(decisionsBlock(project.decisions, ''));
  lines.push('');

  lines.push(`## What's Next`);
  lines.push(numberedList(project.nextSteps));
  lines.push('');

  lines.push(`## Open Questions`);
  lines.push(bulletList(project.openQuestions));
  lines.push('');

  if (task && task.trim()) {
    lines.push(`---`);
    lines.push(`## Your Task`);
    lines.push(`**${sanitize(task)}**`);
    lines.push('');
    lines.push(`Please focus only on this task. Don't modify anything outside its scope.`);
    lines.push('');
  }

  if (project.aiInstructions) {
    lines.push(sanitize(project.aiInstructions));
    lines.push('');
  }

  lines.push(RESPONSE_FORMAT);

  return lines.join('\n');
}

// ─── Delta mode (condensed — just status + next steps) ───────────────────────

function formatDelta(project: ProjectMemory, task?: string): string {
  const lines: string[] = [];
  lines.push(`Project: ${sanitize(project.name)}`);
  lines.push(`Status: ${sanitize(project.currentState || 'not set')}`);
  lines.push('');
  lines.push(`Next Steps:`);
  lines.push(numberedList(project.nextSteps));
  if (project.openQuestions.length > 0) {
    lines.push('');
    lines.push(`Open Questions:`);
    lines.push(bulletList(project.openQuestions));
  }
  if (task && task.trim()) {
    lines.push('');
    lines.push(`Task: ${sanitize(task)}`);
  }
  if (project.aiInstructions) {
    lines.push('');
    lines.push(sanitize(project.aiInstructions));
  }
  lines.push(RESPONSE_FORMAT);
  return lines.join('\n');
}

// ─── Specialist mode (task-focused — summary + task + rules/decisions only) ──

function formatSpecialist(project: ProjectMemory, task?: string): string {
  const lines: string[] = [];
  lines.push(`Project: ${sanitize(project.name)}`);
  lines.push(sanitize(project.summary || '(no summary yet)'));
  lines.push('');
  if (task && task.trim()) {
    lines.push(`Task to complete:`);
    lines.push(sanitize(task));
    lines.push('');
  }
  if (project.rules.length > 0) {
    lines.push(`Rules:`);
    lines.push(bulletList(project.rules));
    lines.push('');
  }
  if (project.decisions.length > 0) {
    lines.push(`Key Decisions:`);
    lines.push(decisionsBlock(project.decisions, ''));
    lines.push('');
  }
  if (project.aiInstructions) {
    lines.push(sanitize(project.aiInstructions));
    lines.push('');
  }
  lines.push(RESPONSE_FORMAT);
  return lines.join('\n');
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function formatForPlatform(
  project: ProjectMemory,
  platform: Platform,
  task?: string,
  mode: ExportMode = 'full',
): string {
  // Condensed modes are platform-agnostic — use them directly
  if (mode === 'delta') return formatDelta(project, task);
  if (mode === 'specialist') return formatSpecialist(project, task);

  // Full mode: use platform-specific formatters
  switch (platform) {
    case 'claude':      return formatForClaude(project, task);
    case 'chatgpt':     return formatForChatGPT(project, task);
    case 'grok':        return formatForGrok(project, task);
    case 'perplexity':  return formatForPerplexity(project, task);
    case 'gemini':      return formatForGemini(project, task);
    default:            return formatForChatGPT(project, task);
  }
}
