/**
 * Working Memory File Protocol v1
 * Generates the content for `.memephant/prefrontal.md`.
 *
 * prefrontal.md = short-term working memory  (what is happening right now)
 * hippocampus.md = stable long-term memory    (project identity, goals, charter, decisions)
 *
 * CRITICAL: linkedFolder.path is NEVER included in output.
 * All secrets are always sanitised (standard + strict patterns).
 * This module does NOT write to the filesystem. The caller is responsible.
 */
import type { ProjectMemory } from '../types/memphant-types';
import {
  removeMemphantPlaceholderStrings,
  removeMemphantPlaceholderText,
} from './memphantPlaceholders';

export const PREFRONTAL_SCHEMA_VERSION = '1.0';

const IN_PROGRESS_CAP = 5;
const NEXT_STEPS_CAP = 7;
const MENTIONED_ASSETS_CAP = 10;

// ─── Secret sanitisation ──────────────────────────────────────────────────────
// prefrontal.md may be written to disk and read by any AI agent, so it always
// applies both standard and strict patterns regardless of app settings.

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hasContent(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function bulletList(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

/** Deduplicate case-insensitively, preserving first occurrence. */
function deduplicateStrings(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeAssetPath(path: string): string {
  return path
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/');
}

function normalizeMentionText(text: string): string {
  return text.replace(/\\/g, '/').toLowerCase();
}

function getAssetBasename(path: string): string {
  return normalizeAssetPath(path).split('/').filter(Boolean).pop()?.toLowerCase() ?? '';
}

/**
 * Build mention text from only the working-memory fields that are actually
 * emitted into prefrontal.md.
 *
 * Important: visibleInProgress and visibleNextSteps are already cleaned,
 * deduplicated, placeholder-filtered, and capped. This prevents hidden stale
 * nextSteps from creating misleading Referenced Files.
 */
function buildReferencedFileMentionText(
  project: ProjectMemory,
  visibleInProgress: string[],
  visibleNextSteps: string[],
): string {
  return [
    removeMemphantPlaceholderText(project.currentState) ?? '',
    removeMemphantPlaceholderText(project.lastSessionSummary) ?? '',
    ...visibleInProgress,
    ...visibleNextSteps,
    removeMemphantPlaceholderText(project.openQuestion) ?? '',
  ].join('\n');
}

function countTextOccurrences(needle: string, haystack: string): number {
  if (!needle) return 0;

  let count = 0;
  let position = 0;

  while ((position = haystack.indexOf(needle, position)) !== -1) {
    count += 1;
    position += needle.length;
  }

  return count;
}

function countBasenameMentions(assetPath: string, text: string): number {
  const basename = getAssetBasename(assetPath);
  if (!basename) return 0;

  return countTextOccurrences(basename, normalizeMentionText(text));
}

/**
 * Counts explicit path/suffix mentions.
 *
 * Example:
 * - asset: public-site/demo-cafe/index.html
 * - explicit mentions that match:
 *   - public-site/demo-cafe/index.html
 *   - demo-cafe/index.html
 *
 * A plain basename like index.html is intentionally not counted here.
 */
function countExplicitPathMentions(assetPath: string, text: string): number {
  const normalizedAsset = normalizeAssetPath(assetPath).toLowerCase();
  const normalizedText = normalizeMentionText(text);
  const parts = normalizedAsset.split('/').filter(Boolean);

  if (parts.length < 2) return 0;

  const suffixes = new Set<string>();

  for (let start = 0; start < parts.length - 1; start += 1) {
    suffixes.add(parts.slice(start).join('/'));
  }

  return Array.from(suffixes).reduce(
    (total, suffix) => total + countTextOccurrences(suffix, normalizedText),
    0,
  );
}

function referencedAssetPriority(path: string): number {
  const lower = normalizeAssetPath(path).toLowerCase();

  // Strong product/page defaults for BrightFoundry-style public sites.
  if (lower === 'public-site/index.html') return 0;
  if (lower === 'public-site/website-design.html') return 1;
  if (lower === 'public-site/pricing.html') return 2;
  if (lower === 'public-site/services.html') return 3;

  // Prefer primary public pages over demos/examples when only basename is mentioned.
  if (lower.includes('/demo-')) return 80;
  if (lower.includes('/examples/')) return 85;
  if (lower.includes('/fixtures/')) return 86;
  if (lower.includes('/test/') || lower.includes('/tests/')) return 87;

  if (lower.startsWith('public-site/') && lower.endsWith('.html')) return 20;
  if (lower.startsWith('src/') && /\.(ts|tsx|js|jsx|css|scss)$/.test(lower)) return 30;
  if (lower.startsWith('server/') && /\.(js|ts|json)$/.test(lower)) return 40;
  if (lower.endsWith('.html')) return 50;
  if (lower.endsWith('.md')) return 55;

  return 60;
}

/**
 * Filters placeholder strings, deduplicates case-insensitively,
 * then sanitises each item.
 */
function prepareList(project: ProjectMemory, items: string[]): string[] {
  return deduplicateStrings(
    removeMemphantPlaceholderStrings(items.filter((item) => item.trim())),
  ).map((item) => clean(project, item));
}

type MentionedAssetCandidate = {
  asset: string;
  basename: string;
  index: number;
  basenameMentionCount: number;
  explicitMentionCount: number;
  priority: number;
};

function sortMentionedAssetCandidates(
  a: MentionedAssetCandidate,
  b: MentionedAssetCandidate,
): number {
  const explicitDiff = b.explicitMentionCount - a.explicitMentionCount;
  if (explicitDiff !== 0) return explicitDiff;

  const basenameDiff = b.basenameMentionCount - a.basenameMentionCount;
  if (basenameDiff !== 0) return basenameDiff;

  const priorityDiff = a.priority - b.priority;
  if (priorityDiff !== 0) return priorityDiff;

  return a.index - b.index;
}

function chooseBestCandidateForBasenameOnlyMention(
  candidates: MentionedAssetCandidate[],
): MentionedAssetCandidate {
  return [...candidates].sort(sortMentionedAssetCandidates)[0];
}

/**
 * Returns only importantAssets whose basenames are directly mentioned in
 * the visible prefrontal.md working-memory context.
 *
 * If a full path/suffix is mentioned, that exact/suffix asset is included.
 * If only a basename is mentioned and several assets share it, only the best
 * priority asset is included to avoid noisy duplicate index.html matches.
 *
 * Windows paths are normalised before basename matching and output.
 * Capped to MENTIONED_ASSETS_CAP.
 */
function prepareMentionedAssets(
  project: ProjectMemory,
  visibleInProgress: string[],
  visibleNextSteps: string[],
): string[] {
  const mentionText = buildReferencedFileMentionText(
    project,
    visibleInProgress,
    visibleNextSteps,
  );
  const seen = new Set<string>();

  const candidates = (project.importantAssets ?? [])
    .map(normalizeAssetPath)
    .filter((asset) => asset.trim())
    .filter((asset) => {
      const key = asset.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((asset, index): MentionedAssetCandidate => {
      const explicitMentionCount = countExplicitPathMentions(asset, mentionText);
      const basenameMentionCount = countBasenameMentions(asset, mentionText);

      return {
        asset,
        basename: getAssetBasename(asset),
        index,
        explicitMentionCount,
        basenameMentionCount,
        priority: referencedAssetPriority(asset),
      };
    })
    .filter(
      (candidate) =>
        candidate.basename &&
        (candidate.explicitMentionCount > 0 || candidate.basenameMentionCount > 0),
    );

  const explicitCandidates = candidates.filter((candidate) => candidate.explicitMentionCount > 0);
  const explicitBasenames = new Set(explicitCandidates.map((candidate) => candidate.basename));

  const basenameOnlyGroups = new Map<string, MentionedAssetCandidate[]>();

  for (const candidate of candidates) {
    if (candidate.explicitMentionCount > 0) continue;
    if (explicitBasenames.has(candidate.basename)) continue;

    const group = basenameOnlyGroups.get(candidate.basename) ?? [];
    group.push(candidate);
    basenameOnlyGroups.set(candidate.basename, group);
  }

  const selected = [
    ...explicitCandidates,
    ...Array.from(basenameOnlyGroups.values()).map(chooseBestCandidateForBasenameOnlyMention),
  ];

  return selected
    .sort(sortMentionedAssetCandidates)
    .slice(0, MENTIONED_ASSETS_CAP)
    .map((candidate) => clean(project, candidate.asset));
}

function formatLastAiSession(project: ProjectMemory): string | null {
  const session = project.lastAiSession;
  if (!session) return null;

  const date = (() => {
    try {
      return new Date(session.sessionAt).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return session.sessionAt;
    }
  })();

  const parts: string[] = [`Platform: ${session.platform} | Mode: ${session.mode} | ${date}`];

  if (hasContent(session.userTaskSummary)) {
    parts.push(`Task: ${clean(project, session.userTaskSummary.trim())}`);
  }
  if (hasContent(session.userSwitchReason)) {
    parts.push(`Switch reason: ${clean(project, session.userSwitchReason.trim())}`);
  }

  return parts.join('\n');
}

function formatRecentCheckpoint(project: ProjectMemory): string | null {
  const { checkpoints } = project;
  if (!checkpoints || checkpoints.length === 0) return null;

  const latest = [...checkpoints].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )[0];

  if (!hasContent(latest.summary)) return null;

  const date = (() => {
    try {
      return new Date(latest.timestamp).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return latest.timestamp;
    }
  })();

  return `${latest.platform} (${date}): ${clean(project, latest.summary.trim())}`;
}

// ─── Main formatter ───────────────────────────────────────────────────────────

/**
 * Generates the markdown content for `.memephant/prefrontal.md`.
 *
 * Includes only non-empty, non-placeholder sections. All secrets and the
 * linkedFolder path are sanitised. Does not write to the filesystem.
 */
export function generatePrefrontalMarkdown(project: ProjectMemory): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  // ─── Header ─────────────────────────────────────────────────────────────
  lines.push('<!-- prefrontal.md — Working Memory File Protocol v1 -->');
  lines.push('<!-- Generated by Memephant. Edit in Memephant or regenerate. -->');
  lines.push(
    `<!-- schema: prefrontal/${PREFRONTAL_SCHEMA_VERSION} | project-id: ${project.id} | generated: ${now} -->`,
  );
  lines.push('');

  // ─── Title ──────────────────────────────────────────────────────────────
  lines.push(`# ${clean(project, project.name)} — Working Memory`);
  lines.push('');

  // ─── Working Rules (always present) ─────────────────────────────────────
  // Tells every AI how to treat these two companion files.
  lines.push('## Working Rules');
  lines.push('');
  lines.push('- **prefrontal.md** is short-term working memory — what is happening right now.');
  lines.push('- **hippocampus.md** is stable long-term memory — project identity, charter, goals, decisions.');
  lines.push('- Do not infer long-term project direction from this file. Read hippocampus.md for that.');
  lines.push('- This file is volatile: it reflects the current session and may change after every update.');
  lines.push('');

  // ─── Current State ──────────────────────────────────────────────────────
  const currentState = removeMemphantPlaceholderText(project.currentState);
  if (hasContent(currentState)) {
    lines.push('## Current State');
    lines.push('');
    lines.push(clean(project, currentState.trim()));
    lines.push('');
  }

  // ─── Last Session Summary ────────────────────────────────────────────────
  const lastSessionSummary = removeMemphantPlaceholderText(project.lastSessionSummary);
  if (hasContent(lastSessionSummary)) {
    lines.push('## Last Session Summary');
    lines.push('');
    lines.push(clean(project, lastSessionSummary.trim()));
    lines.push('');
  }

  // ─── In Progress (cap 5) ────────────────────────────────────────────────
  const inProgress = prepareList(project, project.inProgress ?? []).slice(0, IN_PROGRESS_CAP);
  if (inProgress.length > 0) {
    lines.push('## In Progress');
    lines.push('');
    lines.push(bulletList(inProgress));
    lines.push('');
  }

  // ─── Immediate Next Steps (cap 7) ───────────────────────────────────────
  const nextSteps = prepareList(project, project.nextSteps ?? []).slice(0, NEXT_STEPS_CAP);
  if (nextSteps.length > 0) {
    lines.push('## Immediate Next Steps');
    lines.push('');
    lines.push(bulletList(nextSteps));
    lines.push('');
  }

  // ─── Open Question ───────────────────────────────────────────────────────
  const openQuestion = removeMemphantPlaceholderText(project.openQuestion);
  if (hasContent(openQuestion)) {
    lines.push('## Open Question');
    lines.push('');
    lines.push(clean(project, openQuestion.trim()));
    lines.push('');
  }

  // ─── Last AI Session ─────────────────────────────────────────────────────
  const aiSessionText = formatLastAiSession(project);
  if (aiSessionText) {
    lines.push('## Last AI Session');
    lines.push('');
    lines.push(aiSessionText);
    lines.push('');
  }

  // ─── Recent Checkpoint ───────────────────────────────────────────────────
  const checkpointText = formatRecentCheckpoint(project);
  if (checkpointText) {
    lines.push('## Recent Checkpoint');
    lines.push('');
    lines.push(checkpointText);
    lines.push('');
  }

  // ─── Referenced Files ────────────────────────────────────────────────────
  // Only assets directly mentioned in the visible working-memory sections.
  const mentionedAssets = prepareMentionedAssets(project, inProgress, nextSteps);
  if (mentionedAssets.length > 0) {
    lines.push('## Referenced Files');
    lines.push('');
    lines.push(bulletList(mentionedAssets));
    lines.push('');
  }

  // ─── Footer ──────────────────────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push(
    '*Generated by Memephant Working Memory File Protocol v1. Regenerate when session context changes.*',
  );

  return lines.join('\n');
}
