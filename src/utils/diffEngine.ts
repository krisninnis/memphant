/**
 * Diff engine — detects, computes, and applies AI project updates.
 * Used by the Paste Zone to process AI responses.
 */
import type {
  Decision,
  DiffResult,
  Platform,
  ProjectCheckpoint,
  ProjectCheckpointSnapshot,
  PlatformState,
  ProjectMemory,
} from '../types/memphant-types';

/** The structure of an AI update block */
export interface DetectedUpdate {
  summary?: string;
  currentState?: string;
  goals?: string[];
  rules?: string[];
  decisions?: Array<{ decision: string; rationale?: string }>;
  nextSteps?: string[];
  openQuestions?: string[];
  importantAssets?: string[];
  /**
   * REPLACE-ALL merge rule.
   * When present (including as []), replaces the entire inProgress array.
   * An empty array [] is a valid value meaning "clear the field".
   * When absent from the update, existing value is left untouched.
   */
  inProgress?: string[];
  /**
   * REPLACE merge rule.
   * When present, replaces the existing lastSessionSummary string.
   * When absent from the update, existing value is left untouched.
   */
  lastSessionSummary?: string;
  /**
   * REPLACE merge rule.
   * When present, replaces the existing openQuestion string.
   * When absent from the update, existing value is left untouched.
   */
  openQuestion?: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normaliseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const cleaned = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);

  return cleaned.length > 0 ? cleaned : undefined;
}

function normaliseDecisions(
  value: unknown,
): Array<{ decision: string; rationale?: string }> | undefined {
  if (!Array.isArray(value)) return undefined;

  const cleaned = value
    .map((item) => {
      if (typeof item === 'string') {
        const decision = item.trim();
        return decision ? { decision } : null;
      }

      if (typeof item === 'object' && item !== null) {
        const record = item as Record<string, unknown>;
        const decision = typeof record.decision === 'string' ? record.decision.trim() : '';
        const rationale =
          typeof record.rationale === 'string' && record.rationale.trim().length > 0
            ? record.rationale.trim()
            : undefined;

        if (!decision) return null;

        return { decision, rationale };
      }

      return null;
    })
    .filter(
      (
        item,
      ): item is {
        decision: string;
        rationale?: string;
      } => item !== null,
    );

  return cleaned.length > 0 ? cleaned : undefined;
}

function hasProjectFields(obj: unknown): obj is DetectedUpdate {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;

  return Boolean(
    o.summary ||
      o.goals ||
      o.decisions ||
      o.currentState ||
      o.nextSteps ||
      o.openQuestions ||
      o.rules ||
      o.importantAssets ||
      // inProgress: undefined means absent; [] (empty array) is a valid "clear" signal
      o.inProgress !== undefined ||
      o.lastSessionSummary ||
      o.openQuestion,
  );
}

// Supported schemaVersion MAJOR — anything higher than this is a breaking change
// and should be rejected gracefully rather than parsed incorrectly.
const SUPPORTED_SCHEMA_MAJOR = 1;

/**
 * Parse and validate the schemaVersion field (if present).
 * Returns false if the version is present but represents an incompatible major version.
 * Missing schemaVersion is accepted (pre-1.0.0 blocks stay compatible).
 */
function isSchemaVersionCompatible(parsed: Record<string, unknown>): boolean {
  const raw = parsed.schemaVersion;
  if (raw === undefined || raw === null) return true; // legacy block — accept
  if (typeof raw !== 'string') return true; // malformed field — ignore and accept

  const major = parseInt(raw.split('.')[0] ?? '1', 10);
  if (isNaN(major)) return true;

  if (major > SUPPORTED_SCHEMA_MAJOR) {
    console.warn(
      `[memphant] memphant_update block has schemaVersion "${raw}" — ` +
        `this app only understands major version ${SUPPORTED_SCHEMA_MAJOR}. ` +
        `Please update Memephant to read this update.`,
    );
    return false;
  }
  return true;
}

function parseCandidateJson(candidate: string): DetectedUpdate | null {
  const trimmed = candidate.trim();

  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (!hasProjectFields(parsed)) return null;
    if (!isSchemaVersionCompatible(parsed)) return null;

    const normalised: DetectedUpdate = {};

    if (isNonEmptyString(parsed.summary)) {
      normalised.summary = parsed.summary.trim();
    }

    if (isNonEmptyString(parsed.currentState)) {
      normalised.currentState = parsed.currentState.trim();
    }

    const goals = normaliseStringArray(parsed.goals);
    if (goals) normalised.goals = goals;

    const rules = normaliseStringArray(parsed.rules);
    if (rules) normalised.rules = rules;

    const nextSteps = normaliseStringArray(parsed.nextSteps);
    if (nextSteps) normalised.nextSteps = nextSteps;

    const openQuestions = normaliseStringArray(parsed.openQuestions);
    if (openQuestions) normalised.openQuestions = openQuestions;

    const importantAssets = normaliseStringArray(parsed.importantAssets);
    if (importantAssets) normalised.importantAssets = importantAssets;

    const decisions = normaliseDecisions(parsed.decisions);
    if (decisions) normalised.decisions = decisions;

    // ── 1.1.0 fields ─────────────────────────────────────────────────────────

    // inProgress: REPLACE-ALL — preserve [] (means "clear"); absent field → not set.
    if (Array.isArray(parsed.inProgress)) {
      normalised.inProgress = (parsed.inProgress as unknown[])
        .filter((item): item is string => typeof item === 'string')
        .map((s) => s.trim())
        .filter(Boolean);
      // Note: if parsed.inProgress was [] or all-blank-strings, normalised.inProgress is [].
      // This is intentional — an empty array is a valid "clear" instruction.
    }

    if (isNonEmptyString(parsed.lastSessionSummary)) {
      normalised.lastSessionSummary = parsed.lastSessionSummary.trim();
    }

    if (isNonEmptyString(parsed.openQuestion)) {
      normalised.openQuestion = parsed.openQuestion.trim();
    }

    return hasProjectFields(normalised) ? normalised : null;
  } catch {
    return null;
  }
}

function parseNaturalLanguage(text: string): DetectedUpdate | null {
  const update: DetectedUpdate = {};
  
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();

  // Never treat raw memphant marker text or obvious malformed update attempts
  // as a natural-language project update.
  if (
    lowered === 'memphant_update' ||
    lowered.startsWith('memphant_update\n') ||
    lowered.startsWith('memphant_update\r\n') ||
    /^memphant_update\s*\{?/i.test(trimmed)
  ) {
    return null;
  }

  const hasStructuredLanguage =
    /(summary:|current state:|current status:|goals:|rules:|decisions?:|next steps?:|open questions?:|important assets?:)/i.test(
      trimmed,
    ) ||
    /(?:we decided|decision:|we chose|currently|right now|the app is|open question:|question:)/i.test(
      trimmed,
    );

  // If the text does not look like structured project-update language,
  // do not infer anything.
  if (!hasStructuredLanguage) {
    return null;
  }

  // Summary: only from explicit labels, not arbitrary first lines
  const summaryMatch = trimmed.match(/(?:^|\n)\s*(?:summary|project summary)\s*:\s*(.+)/i);
  if (summaryMatch?.[1]?.trim()) {
    update.summary = summaryMatch[1].trim().replace(/\.$/, '');
  }

  // Current state
  const stateMatch = trimmed.match(
    /(?:^|\n)\s*(?:current state|current status|what this project is about)\s*:\s*(.+)/i,
  );
  if (stateMatch?.[1]?.trim()) {
    update.currentState = stateMatch[1].trim().replace(/\.$/, '');
  }

  // Goals
  const goalMatches = trimmed.match(/(?:add|should add|we should|need to)\s+([^.]+)/gi);
  if (goalMatches) {
    const goals = goalMatches
      .map((goal) =>
        goal
          .replace(/(?:add|should add|we should|need to)/i, '')
          .trim()
          .replace(/\.$/, ''),
      )
      .filter(Boolean);

    if (goals.length > 0) {
      update.goals = goals;
    }
  }

  // Decisions
  const decisionMatches = trimmed.match(/(?:we decided|decision:|we chose)\s+([^.]+)/gi);
  if (decisionMatches) {
    const decisions = decisionMatches
      .map((decision) =>
        decision.replace(/(?:we decided|decision:|we chose)/i, '').trim(),
      )
      .filter(Boolean)
      .map((decision) => ({ decision }));

    if (decisions.length > 0) {
      update.decisions = decisions;
    }
  }

  // Open questions
  const questionMatches = trimmed.match(
    /(?:question:|open question:|unclear|not sure)\s+([^.]+)/gi,
  );
  if (questionMatches) {
    const openQuestions = questionMatches
      .map((question) =>
        question.replace(/(?:question:|open question:|unclear|not sure)/i, '').trim(),
      )
      .filter(Boolean);

    if (openQuestions.length > 0) {
      update.openQuestions = openQuestions;
    }
  }

  return Object.keys(update).length > 0 ? update : null;
}

export type DetectionSource =
  | 'strict_json'
  | 'code_block'
  | 'bare_json'
  | 'natural_language'
  | 'smart_local_fallback'
  | 'none';

export interface DetectionResult {
  update: DetectedUpdate | null;
  source: DetectionSource;
  confidence: number;
}

function extractBalancedJsonFrom(text: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let started = false;
  let result = '';

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];

    if (!started) {
      if (char !== '{') continue;
      started = true;
    }

    result += char;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') depth++;
    if (char === '}') depth--;

    if (started && depth === 0) {
      return result.trim();
    }
  }

  return null;
}

function extractJsonAfterMarker(text: string, markerRegex: RegExp): string | null {
  const match = markerRegex.exec(text);
  if (!match || match.index === undefined) return null;

  const markerEnd = match.index + match[0].length;
  return extractBalancedJsonFrom(text, markerEnd);
}

function extractLastJsonObject(text: string): string | null {
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === '{') {
      const candidate = extractBalancedJsonFrom(text, i);
      if (candidate) return candidate;
    }
  }
  return null;
}

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

/**
 * Scan pasted text for a project update block.
 * Tries several strategies in order of reliability and returns metadata.
 */
export function detectUpdate(text: string): DetectionResult {
  const trimmed = text.trim();

  if (/<script|iframe|onerror=|javascript:/i.test(text)) {
    return { update: null, source: 'none', confidence: 0 };
  }

  if (!trimmed) {
    return { update: null, source: 'none', confidence: 0 };
  }

  // 1. memphant_update marker + balanced JSON
  const strictJson = extractJsonAfterMarker(trimmed, /memphant_update\s*/i);
  if (strictJson) {
    const parsed = parseCandidateJson(strictJson);
    if (parsed) {
      return { update: parsed, source: 'strict_json', confidence: 1.0 };
    }
  }

  // 2. XML wrapper
  const xmlMatch = trimmed.match(/<memphant_update>([\s\S]*?)<\/memphant_update>/i);
  if (xmlMatch?.[1]) {
    const xmlInner = stripCodeFences(xmlMatch[1]);
    const parsed = parseCandidateJson(xmlInner);
    if (parsed) {
      return { update: parsed, source: 'code_block', confidence: 0.95 };
    }
  }

  // 3. fenced code block (STRICT)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch?.[1]) {
    const cleaned = stripCodeFences(codeBlockMatch[1]);
    const parsed = parseCandidateJson(cleaned);
    if (parsed) {
      return { update: parsed, source: 'code_block', confidence: 0.9 };
    }
  }

  // 3.5 SUPER FALLBACK — try ANY code block content
  const anyCodeBlock = trimmed.match(/```[\s\S]*?```/g);

  if (anyCodeBlock) {
    for (const block of anyCodeBlock) {
      const cleaned = stripCodeFences(block);
      const parsed = parseCandidateJson(cleaned);
      if (parsed) {
        return { update: parsed, source: 'code_block', confidence: 0.7 };
      }
    }
  }

  // 4. last likely JSON object
  const lastJson = extractLastJsonObject(trimmed);
  if (lastJson) {
    const parsed = parseCandidateJson(lastJson);
    if (parsed) {
      return { update: parsed, source: 'bare_json', confidence: 0.75 };
    }
  }

  // 4.5 FINAL FALLBACK — brute-force JSON scan
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '{') {
      const candidate = extractBalancedJsonFrom(trimmed, i);
      if (candidate && candidate.includes('currentState')) {
        const parsed = parseCandidateJson(candidate);
        if (parsed) {
          return { update: parsed, source: 'bare_json', confidence: 0.65 };
        }
      }
    }
  }

  // 5. natural language fallback
  const natural = parseNaturalLanguage(trimmed);
  if (natural) {
    return { update: natural, source: 'natural_language', confidence: 0.4 };
  }

  return { update: null, source: 'none', confidence: 0 };
}

function getBaselineProject(
  current: ProjectMemory,
  checkpoint?: ProjectCheckpoint | null,
): ProjectCheckpointSnapshot {
  return checkpoint?.snapshot ?? current;
}

function isRiskyScalarOverwrite(
  current: ProjectMemory,
  baseline: ProjectCheckpointSnapshot,
  field: 'summary' | 'currentState',
  nextValue: string,
): boolean {
  return checkpointFieldChanged(current, baseline, field) && nextValue !== current[field];
}

function checkpointFieldChanged(
  current: ProjectMemory,
  baseline: ProjectCheckpointSnapshot,
  field: 'summary' | 'currentState',
): boolean {
  return current[field] !== baseline[field];
}

export function getLatestCheckpoint(
  project: ProjectMemory,
  platform?: Platform,
): ProjectCheckpoint | null {
  const checkpoints = Array.isArray(project.checkpoints) ? project.checkpoints : [];
  const candidates = platform
    ? checkpoints.filter((checkpoint) => checkpoint.platform === platform)
    : checkpoints;

  if (candidates.length === 0) return null;

  return [...candidates].sort((a, b) => {
    const aTime = new Date(a.timestamp).getTime();
    const bTime = new Date(b.timestamp).getTime();
    return bTime - aTime;
  })[0] ?? null;
}

export function countRiskyDiffs(diffs: DiffResult[]): number {
  return diffs.filter((diff) => diff.riskyOverwrite).length;
}

/** Compute a human-readable diff between current project and an incoming update */
export function computeDiff(
  current: ProjectMemory,
  update: DetectedUpdate,
  checkpoint?: ProjectCheckpoint | null,
): DiffResult[] {
  const diffs: DiffResult[] = [];
  const baseline = getBaselineProject(current, checkpoint);

  for (const field of ['summary', 'currentState'] as const) {
    if (isNonEmptyString(update[field]) && update[field] !== baseline[field]) {
      const riskyOverwrite = isRiskyScalarOverwrite(current, baseline, field, update[field]);
      diffs.push({
        field,
        action: 'updated',
        oldValue: current[field],
        newValue: update[field],
        checkpointValue: baseline[field],
        riskyOverwrite,
        checkpointId: checkpoint?.id,
      });
    }
  }

  for (const field of [
    'goals',
    'rules',
    'nextSteps',
    'openQuestions',
    'importantAssets',
  ] as const) {
    const incoming = update[field];
    if (!incoming || !Array.isArray(incoming)) continue;

    const existing = baseline[field] ?? [];
    const added = incoming.filter((item) => !existing.includes(item));

    if (added.length > 0) {
      diffs.push({
        field,
        action: 'added',
        newValue: added,
        checkpointValue: existing,
        checkpointId: checkpoint?.id,
      });
    }
  }

  if (update.decisions && Array.isArray(update.decisions)) {
    const existing = baseline.decisions ?? [];
    const added = update.decisions.filter(
      (decision) => !existing.some((e) => e.decision === decision.decision),
    );

    if (added.length > 0) {
      diffs.push({
        field: 'decisions',
        action: 'added',
        newValue: added,
        checkpointValue: existing,
        checkpointId: checkpoint?.id,
      });
    }
  }

  // ── 1.1.0 fields — REPLACE semantics (not append) ─────────────────────────

  // inProgress: REPLACE-ALL — diff whenever the incoming value differs from current
  // (including when incoming is [] = clear).
  if (update.inProgress !== undefined) {
    const existingInProgress = current.inProgress ?? [];
    const sameContent = JSON.stringify(existingInProgress.slice().sort()) === JSON.stringify(update.inProgress.slice().sort()) && existingInProgress.length === update.inProgress.length;
    if (!sameContent) {
      diffs.push({
        field: 'inProgress',
        action:
          update.inProgress.length === 0
            ? 'removed'
            : existingInProgress.length > 0
            ? 'updated'
            : 'added',
        oldValue: existingInProgress,
        newValue: update.inProgress,
        checkpointValue: baseline.inProgress ?? [],
        checkpointId: checkpoint?.id,
      });
    }
  }

  // lastSessionSummary / openQuestion: REPLACE — diff like other scalar fields
  for (const field of ['lastSessionSummary', 'openQuestion'] as const) {
    const incoming = update[field];
    if (isNonEmptyString(incoming) && incoming !== current[field]) {
      diffs.push({
        field,
        action: current[field] ? 'updated' : 'added',
        oldValue: current[field],
        newValue: incoming,
        checkpointValue: baseline[field],
        checkpointId: checkpoint?.id,
      });
    }
  }

  return diffs;
}

/** Map internal field names to human-readable UI labels */
export function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    summary: 'Summary',
    currentState: 'What this project is about',
    goals: 'Goals',
    rules: 'Rules',
    decisions: 'Key Decisions',
    nextSteps: 'Next Steps',
    openQuestions: 'Open Questions',
    importantAssets: 'Important Files & Assets',
  };
  return labels[field] ?? field;
}

/** Count total number of individual items changed */
export function countDiffs(diffs: DiffResult[]): number {
  return diffs.reduce((total, diff) => {
    if (Array.isArray(diff.newValue)) return total + diff.newValue.length;
    if (Array.isArray(diff.oldValue)) return total + diff.oldValue.length;
    return total + 1;
  }, 0);
}

interface ApplyUpdateOptions {
  allowRiskyOverwrites?: boolean;
  diffs?: DiffResult[];
  checkpoint?: ProjectCheckpoint | null;
}

function findDiffForField(diffs: DiffResult[] | undefined, field: string): DiffResult | undefined {
  return diffs?.find((diff) => diff.field === field && diff.action === 'updated');
}

/** Apply a detected update to the current project, producing a new project object */
export function applyUpdate(
  current: ProjectMemory,
  update: DetectedUpdate,
  options: ApplyUpdateOptions = {},
): ProjectMemory {
  const now = new Date().toISOString();
  const changelog = [...current.changelog];
  const merged: ProjectMemory = {
    ...current,
    checkpoints: [...(current.checkpoints ?? [])],
    decisions: current.decisions.map((decision) => ({ ...decision })),
    changelog,
    importantAssets: [...current.importantAssets],
    goals: [...current.goals],
    rules: [...current.rules],
    nextSteps: [...current.nextSteps],
    openQuestions: [...current.openQuestions],
    inProgress: current.inProgress ? [...current.inProgress] : undefined,
    platformState: Object.fromEntries(
      Object.entries(current.platformState ?? {}).map(([platform, state]) => [
        platform,
        state ? { ...state } : state,
      ]),
    ) as Partial<Record<Platform, PlatformState>>,
  };
  const allowRiskyOverwrites = options.allowRiskyOverwrites ?? true;

  if (isNonEmptyString(update.summary) && update.summary !== current.summary) {
    const diff = findDiffForField(options.diffs, 'summary');
    if (!diff?.riskyOverwrite || allowRiskyOverwrites) {
      merged.summary = update.summary;
      changelog.push({
        timestamp: now,
        field: 'summary',
        action: 'updated',
        summary: diff?.riskyOverwrite
          ? 'Summary overwritten from AI checkpoint'
          : 'Summary updated by AI',
        source: options.checkpoint ? `checkpoint:${options.checkpoint.id}` : 'ai',
      });
    }
  }

  if (isNonEmptyString(update.currentState) && update.currentState !== current.currentState) {
    const diff = findDiffForField(options.diffs, 'currentState');
    if (!diff?.riskyOverwrite || allowRiskyOverwrites) {
      merged.currentState = update.currentState;
      changelog.push({
        timestamp: now,
        field: 'currentState',
        action: 'updated',
        summary: diff?.riskyOverwrite
          ? 'Current state overwritten from AI checkpoint'
          : 'Status updated by AI',
        source: options.checkpoint ? `checkpoint:${options.checkpoint.id}` : 'ai',
      });
    }
  }

  for (const field of [
    'goals',
    'rules',
    'nextSteps',
    'openQuestions',
    'importantAssets',
  ] as const) {
    const incoming = update[field];
    if (!incoming || !Array.isArray(incoming)) continue;

    const existing = current[field] ?? [];
    const added = incoming.filter((item) => !existing.includes(item));

    if (added.length > 0) {
      (merged[field] as string[]) = [...existing, ...added];
      changelog.push({
        timestamp: now,
        field,
        action: 'added',
        summary: `${added.length} item${added.length === 1 ? '' : 's'} added by AI`,
        source: options.checkpoint ? `checkpoint:${options.checkpoint.id}` : 'ai',
      });
    }
  }

  if (update.decisions && Array.isArray(update.decisions)) {
    const existing: Decision[] = current.decisions ?? [];
    const added = update.decisions.filter(
      (d) => !existing.some((e) => e.decision === d.decision),
    );

    if (added.length > 0) {
      merged.decisions = [...existing, ...added];
      changelog.push({
        timestamp: now,
        field: 'decisions',
        action: 'added',
        summary: `${added.length} decision${added.length === 1 ? '' : 's'} added by AI`,
        source: options.checkpoint ? `checkpoint:${options.checkpoint.id}` : 'ai',
      });
    }
  }

  // ── 1.1.0 fields ─────────────────────────────────────────────────────────────

  // inProgress: REPLACE-ALL.
  // An absent field (undefined) means "leave untouched".
  // An empty array [] means "clear the field" (still a valid replacement).
  if (update.inProgress !== undefined) {
    const existingInProgress = current.inProgress ?? [];
    const incoming = update.inProgress;
    const sameContent =
      incoming.length === existingInProgress.length &&
      JSON.stringify(incoming.slice().sort()) === JSON.stringify(existingInProgress.slice().sort());

    if (!sameContent) {
      // Set to [] rather than undefined when clearing — makes the intent explicit.
      merged.inProgress = [...incoming];
      changelog.push({
        timestamp: now,
        field: 'inProgress',
        action:
          incoming.length === 0
            ? 'removed'
            : existingInProgress.length > 0
            ? 'updated'
            : 'added',
        summary:
          incoming.length === 0
            ? 'In-progress items cleared by AI'
            : `In-progress replaced by AI (${incoming.length} item${incoming.length === 1 ? '' : 's'})`,
        source: options.checkpoint ? `checkpoint:${options.checkpoint.id}` : 'ai',
      });
    }
  }
  // If update.inProgress is absent (undefined), merged.inProgress keeps current value — no change.

  // lastSessionSummary: REPLACE.
  if (isNonEmptyString(update.lastSessionSummary) && update.lastSessionSummary !== current.lastSessionSummary) {
    merged.lastSessionSummary = update.lastSessionSummary;
    changelog.push({
      timestamp: now,
      field: 'lastSessionSummary',
      action: current.lastSessionSummary ? 'updated' : 'added',
      summary: 'Last session summary updated by AI',
      source: options.checkpoint ? `checkpoint:${options.checkpoint.id}` : 'ai',
    });
  }

  // openQuestion: REPLACE.
  if (isNonEmptyString(update.openQuestion) && update.openQuestion !== current.openQuestion) {
    merged.openQuestion = update.openQuestion;
    changelog.push({
      timestamp: now,
      field: 'openQuestion',
      action: current.openQuestion ? 'updated' : 'added',
      summary: 'Open question updated by AI',
      source: options.checkpoint ? `checkpoint:${options.checkpoint.id}` : 'ai',
    });
  }

  if (options.checkpoint) {
    merged.platformState = {
      ...merged.platformState,
      [options.checkpoint.platform]: {
        ...merged.platformState?.[options.checkpoint.platform],
        lastReplyAt: now,
      },
    };
  }

  merged.changelog = changelog;
  merged.updatedAt = now;
  return merged;
}
