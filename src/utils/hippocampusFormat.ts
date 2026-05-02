/**
 * Memory Core File Protocol v1
 * Generates the content for `.memephant/hippocampus.md`
 *
 * This file represents the project's persistent memory snapshot,
 * readable by AI agents directly from the filesystem.
 *
 * CRITICAL: linkedFolder.path is NEVER included in output.
 * All secrets are always sanitised (standard + strict patterns).
 * This module does NOT write to the filesystem — the caller is responsible.
 */
import type { ProjectMemory } from '../types/memphant-types';

// Current protocol version — increment MAJOR for breaking schema changes,
// MINOR for new optional fields, PATCH for doc-only fixes.
export const HIPPOCAMPUS_SCHEMA_VERSION = '1.0';

// ─── Secret sanitisation ──────────────────────────────────────────────────────
// hippocampus.md is written to disk and may be read by any AI agent,
// so we always run both standard and strict patterns regardless of app settings.

const ALL_PATTERNS: RegExp[] = [
  // OpenAI
  /sk-[A-Za-z0-9]{20,}/g,
  // Anthropic (sk-ant-api03-... or any sk-ant- variant)
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  // AWS access key IDs
  /AKIA[0-9A-Z]{16}/g,
  // GitHub personal access tokens (classic + fine-grained)
  /ghp_[A-Za-z0-9]{36}/g,
  /github_pat_[A-Za-z0-9_]{82}/g,
  // Slack bot tokens
  /xoxb-[A-Za-z0-9-]+/g,
  // Slack user tokens
  /xoxp-[A-Za-z0-9-]+/g,
  // Stripe live secret keys
  /sk_live_[A-Za-z0-9]{24,}/g,
  // Google API keys
  /AIza[0-9A-Za-z_-]{35}/g,
  // HuggingFace tokens
  /hf_[A-Za-z0-9]{30,}/g,
  // PEM private key headers
  /-----BEGIN [A-Z ]+ KEY-----/g,
  // JWT tokens (base64url header prefix)
  /eyJ[A-Za-z0-9+/=]{20,}/g,
  // Database connection strings (any protocol)
  /(postgres|postgresql|mysql|mongodb|redis|mongodb\+srv):\/\/[^\s"']+/gi,
  // SendGrid API keys
  /SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}/g,
  // Databricks / Spark tokens
  /dapi[a-f0-9]{32}/g,
  // Azure storage connection strings
  /DefaultEndpointsProtocol=https;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]{44,}/gi,
  // Generic secret patterns
  /password\s*[=:]\s*\S+/gi,
  /secret\s*[=:]\s*\S+/gi,
  /token\s*[=:]\s*["']?[A-Za-z0-9_-]{20,}["']?/gi,
  /api[_-]?key\s*[=:]\s*["']?[A-Za-z0-9_-]{16,}["']?/gi,
];

function sanitize(text: string): string {
  let out = text;
  for (const pattern of ALL_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactPath(project: ProjectMemory, text: string): string {
  const path = project.linkedFolder?.path;
  if (!path) return text;

  const variants = new Set([
    path,
    path.replace(/\\/g, '/'),
    path.replace(/\//g, '\\'),
  ]);

  return Array.from(variants).reduce(
    (out, variant) =>
      variant ? out.replace(new RegExp(escapeRegExp(variant), 'g'), '[REDACTED]') : out,
    text,
  );
}

/** Sanitise secrets then redact the linked folder path. */
function clean(project: ProjectMemory, text: string): string {
  return redactPath(project, sanitize(text));
}

function cleanList(project: ProjectMemory, items: string[]): string[] {
  return items.map((item) => clean(project, item));
}

// ─── Default charter synthesis ───────────────────────────────────────────────

/**
 * Synthesises a Memory Core from project fields when no explicit charter has
 * been authored.  Returns unsanitised text — the caller must pass the result
 * through clean() before writing to output.
 *
 * Exported so it can be unit-tested independently.
 */
export function generateDefaultCharter(project: ProjectMemory): string {
  const parts: string[] = [];

  // Opening sentence: what the project is doing right now.
  const state = project.currentState?.trim() || project.summary?.trim();
  if (state) parts.push(state);

  // Goals.
  const goals = project.goals.filter((g) => g.trim());
  if (goals.length === 1) {
    parts.push(`Goal: ${goals[0]}.`);
  } else if (goals.length > 1) {
    parts.push(`Goals: ${goals.join('; ')}.`);
  }

  // Rules.
  const rules = (project.rules ?? []).filter((r) => r.trim());
  if (rules.length === 1) {
    parts.push(`Working rule: ${rules[0]}.`);
  } else if (rules.length > 1) {
    parts.push(`Working rules: ${rules.join('; ')}.`);
  }

  // Key decisions (text only — rationale lives in the Decisions section).
  const decisions = project.decisions.filter((d) => d.decision.trim());
  if (decisions.length === 1) {
    parts.push(`Key decision: ${decisions[0].decision}.`);
  } else if (decisions.length > 1) {
    parts.push(`Key decisions: ${decisions.map((d) => d.decision).join('; ')}.`);
  }

  if (parts.length === 0) return '';

  return [
    '*Auto-generated from project fields — add a Memory Core in the app to customise.*',
    '',
    parts.join(' '),
  ].join('\n');
}

// ─── Markdown helpers ─────────────────────────────────────────────────────────

function bulletList(items: string[]): string {
  if (!items.length) return '(none)';
  return items.map((i) => `- ${i}`).join('\n');
}

function hasContent(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasItems(arr: string[] | undefined | null): arr is string[] {
  return Array.isArray(arr) && arr.some((s) => typeof s === 'string' && s.trim().length > 0);
}

// ─── Main formatter ───────────────────────────────────────────────────────────

/**
 * Generates the markdown content for `.memephant/hippocampus.md`.
 *
 * All secrets and the linkedFolder path are always sanitised.
 * Does not write to the filesystem — caller is responsible for that.
 */
export function generateHippocampusMarkdown(project: ProjectMemory): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  // ─── Header ─────────────────────────────────────────────────────────────
  lines.push(`<!-- hippocampus.md — Memory Core File Protocol v1 -->`);
  lines.push(`<!-- Generated by Memephant. Do not edit manually. -->`);
  lines.push(
    `<!-- schema: hippocampus/${HIPPOCAMPUS_SCHEMA_VERSION} | project-id: ${project.id} | generated: ${now} -->`,
  );
  lines.push('');

  // ─── Title ──────────────────────────────────────────────────────────────
  lines.push(`# ${clean(project, project.name)} — Memory Core`);
  lines.push('');

  // ─── Charter ────────────────────────────────────────────────────────────
  lines.push('## Charter');
  lines.push('');
  const charterSource = hasContent(project.projectCharter)
    ? project.projectCharter.trim()
    : generateDefaultCharter(project);
  lines.push(charterSource ? clean(project, charterSource) : '*(no content yet)*');
  lines.push('');

  // ─── Current State ──────────────────────────────────────────────────────
  lines.push('## Current State');
  lines.push('');
  lines.push(
    hasContent(project.currentState) ? clean(project, project.currentState) : '(none)',
  );
  lines.push('');

  // ─── Goals ──────────────────────────────────────────────────────────────
  lines.push('## Goals');
  lines.push('');
  lines.push(bulletList(cleanList(project, project.goals.filter((g) => g.trim()))));
  lines.push('');

  // ─── Rules ──────────────────────────────────────────────────────────────
  if (hasItems(project.rules)) {
    lines.push('## Rules');
    lines.push('');
    lines.push(bulletList(cleanList(project, project.rules.filter((r) => r.trim()))));
    lines.push('');
  }

  // ─── Decisions ──────────────────────────────────────────────────────────
  if (project.decisions.length > 0) {
    lines.push('## Decisions');
    lines.push('');
    for (const d of project.decisions) {
      lines.push(`- **${clean(project, d.decision)}**`);
      if (hasContent(d.rationale)) {
        lines.push(`  Rationale: ${clean(project, d.rationale)}`);
      }
    }
    lines.push('');
  }

  // ─── Next Steps ─────────────────────────────────────────────────────────
  if (hasItems(project.nextSteps)) {
    lines.push('## Next Steps');
    lines.push('');
    lines.push(bulletList(cleanList(project, project.nextSteps.filter((s) => s.trim()))));
    lines.push('');
  }

  // ─── Open Questions ─────────────────────────────────────────────────────
  if (hasItems(project.openQuestions)) {
    lines.push('## Open Questions');
    lines.push('');
    lines.push(bulletList(cleanList(project, project.openQuestions.filter((q) => q.trim()))));
    lines.push('');
  }

  // ─── In Progress ────────────────────────────────────────────────────────
  if (hasItems(project.inProgress)) {
    lines.push('## In Progress');
    lines.push('');
    lines.push(
      bulletList(cleanList(project, (project.inProgress ?? []).filter((i) => i.trim()))),
    );
    lines.push('');
  }

  // ─── Important Assets ───────────────────────────────────────────────────
  if (hasItems(project.importantAssets)) {
    lines.push('## Important Assets');
    lines.push('');
    lines.push(bulletList(cleanList(project, project.importantAssets.filter((a) => a.trim()))));
    lines.push('');
  }

  // ─── Stack ──────────────────────────────────────────────────────────────
  if (hasItems(project.detectedStack)) {
    lines.push('## Stack');
    lines.push('');
    lines.push(cleanList(project, project.detectedStack!).join(', '));
    lines.push('');
  }

  // ─── Last Session Summary ───────────────────────────────────────────────
  if (hasContent(project.lastSessionSummary)) {
    lines.push('## Last Session Summary');
    lines.push('');
    lines.push(clean(project, project.lastSessionSummary));
    lines.push('');
  }

  // ─── Open Question ──────────────────────────────────────────────────────
  if (hasContent(project.openQuestion)) {
    lines.push('## Open Question');
    lines.push('');
    lines.push(clean(project, project.openQuestion));
    lines.push('');
  }

  // ─── Footer ─────────────────────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push(
    `*Memephant Memory Core File Protocol v1 — do not edit this file manually.*`,
  );

  return lines.join('\n');
}
