/**
 * Memory Core File Protocol v1
 * Generates the content for `.memephant/hippocampus.md`.
 *
 * This file represents the project's persistent memory snapshot,
 * readable by AI agents directly from the filesystem.
 *
 * CRITICAL: linkedFolder.path is NEVER included in output.
 * All secrets are always sanitised using standard and strict patterns.
 * This module does NOT write to the filesystem. The caller is responsible.
 */
import type { ProjectMemory } from '../types/memphant-types';
import { isMemphantPlaceholderValue } from './memphantPlaceholders';

export const HIPPOCAMPUS_SCHEMA_VERSION = '1.0';

const IMPORTANT_ASSET_LIMIT = 20;

// hippocampus.md may be written to disk and read by AI agents, so it always
// applies both standard and strict sanitisation patterns regardless of app settings.
const ALL_PATTERNS: RegExp[] = [
  // OpenAI
  /sk-[A-Za-z0-9]{20,}/g,
  // Anthropic
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  // AWS access key IDs
  /AKIA[0-9A-Z]{16}/g,
  // GitHub personal access tokens
  /ghp_[A-Za-z0-9]{36}/g,
  /github_pat_[A-Za-z0-9_]{82}/g,
  // Slack tokens
  /xoxb-[A-Za-z0-9-]+/g,
  /xoxp-[A-Za-z0-9-]+/g,
  // Stripe live secret keys
  /sk_live_[A-Za-z0-9]{24,}/g,
  // Google API keys
  /AIza[0-9A-Za-z_-]{35}/g,
  // HuggingFace tokens
  /hf_[A-Za-z0-9]{30,}/g,
  // PEM private key headers
  /-----BEGIN [A-Z ]+ KEY-----/g,
  // JWT tokens
  /eyJ[A-Za-z0-9+/=]{20,}/g,
  // Database connection strings
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

const SUSPICIOUS_ASSET_PATTERNS: RegExp[] = [
  /(^|[/\\])\.env(\.|$)/i,
  /(^|[/\\])id_rsa($|\.)/i,
  /(^|[/\\])id_dsa($|\.)/i,
  /(^|[/\\])id_ed25519($|\.)/i,
  /(^|[/\\])pword/i,
  /\bpassword/i,
  /\bpasswd/i,
  /\bsecret/i,
  /\btoken/i,
  /\bcredential/i,
  /\bprivate[-_ ]?key/i,
  /\.(pem|p12|pfx|key|crt|cer)$/i,
];

const NOISY_ASSET_PATTERNS: RegExp[] = [
  /(^|[/\\])task name\d*\.txt$/i,
  /(^|[/\\])untitled\.txt$/i,
  /(^|[/\\])new text document\.txt$/i,
  /(^|[/\\])desktop\.ini$/i,
  /(^|[/\\])thumbs\.db$/i,
];

// Common mojibake / broken filename characters seen when old file names were
// decoded with the wrong encoding. Emoji are allowed; these characters are not.
const MOJIBAKE_PATTERN = /[�┤┼ÈÔ÷Ã¡â▄¨╔¯]/;

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

function stripPlaceholderLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const lineText = line
        .trim()
        .replace(/^[-*]\s+/, '')
        .replace(/^Rationale:\s*/i, '')
        .trim();

      return !isMemphantPlaceholderValue(lineText);
    })
    .join('\n')
    .trim();
}

/** Filter template placeholders, sanitise secrets, then redact the linked folder path. */
function clean(project: ProjectMemory, text: string): string {
  return redactPath(project, sanitize(stripPlaceholderLines(text)));
}

function cleanOptional(project: ProjectMemory, text: string | undefined | null): string | null {
  if (!hasContent(text)) return null;

  const cleaned = clean(project, text);
  return hasContent(cleaned) ? cleaned : null;
}

function cleanList(project: ProjectMemory, items: string[]): string[] {
  return items
    .map((item) => clean(project, item))
    .filter((item) => item.trim());
}

function hasContent(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasItems(arr: string[] | undefined | null): arr is string[] {
  return Array.isArray(arr) && arr.some((item) => typeof item === 'string' && item.trim().length > 0);
}

function bulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function normalizeAssetPath(path: string): string {
  return path
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/');
}

function isNoisyOrSuspiciousAsset(path: string): boolean {
  if (!path.trim()) return true;
  if (MOJIBAKE_PATTERN.test(path)) return true;
  if (SUSPICIOUS_ASSET_PATTERNS.some((pattern) => pattern.test(path))) return true;
  if (NOISY_ASSET_PATTERNS.some((pattern) => pattern.test(path))) return true;

  return false;
}

function assetPriority(path: string): number {
  const lower = path.toLowerCase();

  if (/(^|\/)readme\.md$/.test(lower)) return 0;
  if (/(^|\/)package\.json$/.test(lower)) return 1;
  if (/(^|\/)tauri\.conf\.json$/.test(lower)) return 2;
  if (/(^|\/)cargo\.toml$/.test(lower)) return 3;
  if (/(^|\/)vite\.config\.(ts|js)$/.test(lower)) return 4;

  if (lower === 'public-site/index.html') return 5;
  if (lower === 'public-site/website-design.html') return 6;
  if (lower === 'public-site/pricing.html') return 7;
  if (lower === 'public-site/services.html') return 8;
  if (lower === 'public-site/css/styles.css') return 9;

  if (lower.startsWith('src/') && /\.(ts|tsx|js|jsx|css|scss)$/.test(lower)) return 20;
  if (lower.startsWith('public-site/') && /\.(html|css|js)$/.test(lower)) return 30;
  if (lower.startsWith('server/') && /\.(js|ts|json)$/.test(lower)) return 40;
  if (lower.startsWith('docs/')) return 70;

  if (/(^|\/)package-lock\.json$/.test(lower)) return 80;
  if (/(^|\/)pnpm-lock\.yaml$/.test(lower)) return 81;
  if (lower.includes('/migrations/')) return 90;
  if (lower.endsWith('.txt')) return 95;

  return 60;
}

/**
 * Counts how many times an asset's basename appears in the given text.
 * Case-insensitive, counts non-overlapping occurrences.
 * Exported for unit testing.
 */
export function countMentionsInText(assetPath: string, text: string): number {
  const basename = assetPath.split('/').pop()?.toLowerCase() ?? '';
  if (!basename) return 0;

  const lower = text.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = lower.indexOf(basename, pos)) !== -1) {
    count++;
    pos += basename.length;
  }
  return count;
}

/**
 * Builds the combined mention text from the fields that describe active work.
 * Assets whose basenames appear here rank above unmentioned assets.
 */
function buildMentionText(project: ProjectMemory): string {
  return [
    project.currentState ?? '',
    ...(project.nextSteps ?? []),
    project.lastSessionSummary ?? '',
    project.openQuestion ?? '',
  ].join('\n');
}

function prepareImportantAssets(project: ProjectMemory): string[] {
  const seen = new Set<string>();
  const mentionText = buildMentionText(project);

  return (project.importantAssets ?? [])
    .map(normalizeAssetPath)
    .filter((path) => !isNoisyOrSuspiciousAsset(path))
    .filter((path) => {
      const key = path.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      // Mentioned assets (by basename) rank first, more-mentioned before less-mentioned.
      const mentionDiff = countMentionsInText(b, mentionText) - countMentionsInText(a, mentionText);
      if (mentionDiff !== 0) return mentionDiff;

      // Fall back to static priority, then alphabetical.
      const priorityDiff = assetPriority(a) - assetPriority(b);
      return priorityDiff !== 0 ? priorityDiff : a.localeCompare(b);
    })
    .slice(0, IMPORTANT_ASSET_LIMIT)
    .map((path) => clean(project, path));
}

/**
 * Synthesises a Memory Core from project fields when no explicit charter has
 * been authored. Returns unsanitised text; callers must pass it through clean().
 */
export function generateDefaultCharter(project: ProjectMemory): string {
  const lines: string[] = [];

  lines.push('This project should be handled with small, safe, user-controlled changes.');
  lines.push('');
  lines.push('- Preserve the existing project structure.');
  lines.push('- Prefer focused changes over broad rewrites.');
  lines.push('- Do not rewrite unrelated files.');
  lines.push('- Protect secrets, tokens, credentials, and private local paths.');
  lines.push('- Use the project state, goals, rules, and decisions below as long-term working context.');

  const context: string[] = [];
  const state =
    !isMemphantPlaceholderValue(project.currentState) && project.currentState?.trim()
      ? project.currentState.trim()
      : !isMemphantPlaceholderValue(project.summary) && project.summary?.trim()
        ? project.summary.trim()
        : '';

  if (state) {
    context.push(state);
  }

  const goals = project.goals
    .filter((goal) => goal.trim() && !isMemphantPlaceholderValue(goal))
    .slice(0, 3);
  if (goals.length > 0) {
    context.push(`Primary goals: ${goals.join('; ')}.`);
  }

  const rules = (project.rules ?? [])
    .filter((rule) => rule.trim() && !isMemphantPlaceholderValue(rule))
    .slice(0, 3);
  if (rules.length > 0) {
    context.push(`Working rules: ${rules.join('; ')}.`);
  }

  const decisions = project.decisions
    .filter(
      (decision) =>
        decision.decision.trim() && !isMemphantPlaceholderValue(decision.decision),
    )
    .slice(0, 3);

  if (decisions.length > 0) {
    context.push(`Key decisions: ${decisions.map((decision) => decision.decision).join('; ')}.`);
  }

  if (context.length > 0) {
    lines.push('');
    lines.push('*Auto-generated from project fields. Edit the Memory Core in Memephant to customise.*');
    lines.push('');
    lines.push(context.join(' '));
  }

  return lines.join('\n');
}

function pushSection(lines: string[], heading: string, content: string | null | undefined): void {
  if (!hasContent(content)) return;

  lines.push(`## ${heading}`);
  lines.push('');
  lines.push(content.trim());
  lines.push('');
}

function pushListSection(lines: string[], heading: string, items: string[]): void {
  const usefulItems = items.filter((item) => item.trim());
  if (usefulItems.length === 0) return;

  lines.push(`## ${heading}`);
  lines.push('');
  lines.push(bulletList(usefulItems));
  lines.push('');
}

function formatDecisions(project: ProjectMemory): string | null {
  const decisions = project.decisions.filter(
    (decision) =>
      decision.decision.trim() && !isMemphantPlaceholderValue(decision.decision),
  );
  if (decisions.length === 0) return null;

  return decisions
    .map((decision) => {
      const cleanedDecision = cleanOptional(project, decision.decision);
      if (!cleanedDecision) return null;

      const lines = [`- **${cleanedDecision}**`];
      const rationale = cleanOptional(project, decision.rationale);

      if (rationale) {
        lines.push(`  Rationale: ${rationale}`);
      }

      return lines.join('\n');
    })
    .filter((decision): decision is string => Boolean(decision))
    .join('\n');
}

/**
 * Generates the markdown content for `.memephant/hippocampus.md`.
 *
 * All secrets and the linkedFolder path are always sanitised.
 * Does not write to the filesystem.
 */
export function generateHippocampusMarkdown(project: ProjectMemory): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push('<!-- hippocampus.md — Memory Core File Protocol v1 -->');
  lines.push('<!-- Generated by Memephant. Edit in Memephant or regenerate. -->');
  lines.push(
    `<!-- schema: hippocampus/${HIPPOCAMPUS_SCHEMA_VERSION} | project-id: ${clean(
      project,
      project.id,
    )} | generated: ${now} -->`,
  );
  lines.push('');

  lines.push(`# ${clean(project, project.name)} — Memory Core`);
  lines.push('');

  const cleanSummary = cleanOptional(project, project.summary);
  const cleanRepo = cleanOptional(project, project.githubRepo);
  const identityLines = [
    `Name: ${clean(project, project.name)}`,
    cleanSummary ? `Summary: ${cleanSummary}` : '',
    cleanRepo ? `Repository: ${cleanRepo}` : '',
  ].filter(Boolean);

  pushSection(lines, 'Project Identity', identityLines.join('\n'));

  const explicitCharter = cleanOptional(project, project.projectCharter);
  const charterSource = explicitCharter ?? clean(project, generateDefaultCharter(project));

  pushSection(lines, 'Charter', charterSource);

  pushSection(
    lines,
    'Current State',
    cleanOptional(project, project.currentState),
  );

  pushListSection(lines, 'Goals', cleanList(project, project.goals.filter((goal) => goal.trim())));
  pushListSection(lines, 'Rules', cleanList(project, project.rules.filter((rule) => rule.trim())));

  pushSection(lines, 'Decisions', formatDecisions(project));

  pushListSection(
    lines,
    'Next Steps',
    cleanList(project, project.nextSteps.filter((step) => step.trim())),
  );

  pushListSection(
    lines,
    'Open Questions',
    cleanList(project, project.openQuestions.filter((question) => question.trim())),
  );

  pushListSection(
    lines,
    'In Progress',
    cleanList(project, (project.inProgress ?? []).filter((item) => item.trim())),
  );

  pushListSection(lines, 'Important Assets', prepareImportantAssets(project));

  if (hasItems(project.detectedStack)) {
    pushSection(lines, 'Stack', cleanList(project, project.detectedStack ?? []).join(', '));
  }

  pushSection(
    lines,
    'AI Collaboration Instructions',
    cleanOptional(project, project.aiInstructions),
  );

  pushSection(
    lines,
    'Last Session Summary',
    cleanOptional(project, project.lastSessionSummary),
  );

  pushSection(
    lines,
    'Open Question',
    cleanOptional(project, project.openQuestion),
  );

  pushListSection(lines, 'Boundaries', [
    'Never expose secrets, tokens, credentials, or private local paths.',
    'Never claim tests passed unless they were run.',
    'Follow this Memory Core unless the user explicitly overrides it.',
  ]);

  lines.push('---');
  lines.push('');
  lines.push(
    '*Generated by Memephant Memory Core File Protocol v1. Edit the Memory Core in Memephant or regenerate when project memory changes.*',
  );

  return lines.join('\n');
}
