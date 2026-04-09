/**
 * Diff engine — detects, computes, and applies AI project updates.
 * Used by the Paste Zone to process AI responses.
 */
import type { Decision, DiffResult, ProjectMemory } from '../types/project-brain-types';

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

function parseCandidateJson(candidate: string): DetectedUpdate | null {
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (!hasProjectFields(parsed)) return null;

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

    return hasProjectFields(normalised) ? normalised : null;
  } catch {
    return null;
  }
}
// 🧠 Natural language fallback parser
function parseNaturalLanguage(text: string): DetectedUpdate | null {
  const update: DetectedUpdate = {};
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  // Summary: only if the first line looks descriptive, not like an instruction
  if (lines.length > 0) {
  const firstLine = lines[0];

  // 🚫 NEVER treat decisions or actions as summary
  if (
    !/(add|should|need to|we should|fix|bug|decided|we decided|we chose|question)/i.test(
      firstLine,
    )
  ) {
    update.summary = firstLine;
  }
}

  // Goals
  const goalMatches = text.match(/(?:add|should add|we should|need to)\s+([^.]+)/gi);
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

  // Current state
  const stateMatch = text.match(/(?:currently|now|we are|the app is)\s+([^.]+)/i);
  if (stateMatch) {
    update.currentState = stateMatch[1].trim();
  }

  // Decisions
  const decisionMatches = text.match(/(?:we decided|decision:|we chose)\s+([^.]+)/gi);
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
  const questionMatches = text.match(/(?:question:|unclear|not sure)\s+([^.]+)/gi);
  if (questionMatches) {
    const openQuestions = questionMatches
      .map((question) =>
        question.replace(/(?:question:|unclear|not sure)/i, '').trim(),
      )
      .filter(Boolean);

    if (openQuestions.length > 0) {
      update.openQuestions = openQuestions;
    }
  }

  return Object.keys(update).length > 0 ? update : null;
}
/**
 * Scan pasted text for a project update block.
 * Tries three strategies in order of reliability.
 */
export function detectUpdate(text: string): DetectedUpdate | null {
  const markerMatch = text.match(/project_brain_update\s*([\s\S]*?\{[\s\S]*\})/i);
  if (markerMatch) {
    const parsed = parseCandidateJson(markerMatch[1].trim());
    if (parsed) return parsed;
  }

  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    const parsed = parseCandidateJson(codeBlockMatch[1].trim());
    if (parsed) return parsed;
  }

  const bareJsonMatch = text.match(
    /\{[\s\S]*"(?:summary|goals|decisions|currentState|nextSteps|openQuestions|importantAssets)"[\s\S]*\}/,
  );
  if (bareJsonMatch) {
    const parsed = parseCandidateJson(bareJsonMatch[0].trim());
    if (parsed) return parsed;
  }

  // 🧠 NEW: Natural language fallback
const natural = parseNaturalLanguage(text);
if (natural) return natural;

return null;
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
      o.importantAssets,
  );
}

/** Compute a human-readable diff between current project and an incoming update */
export function computeDiff(current: ProjectMemory, update: DetectedUpdate): DiffResult[] {
  const diffs: DiffResult[] = [];

  for (const field of ['summary', 'currentState'] as const) {
    if (isNonEmptyString(update[field]) && update[field] !== current[field]) {
      diffs.push({
        field,
        action: 'updated',
        oldValue: current[field],
        newValue: update[field],
      });
    }
  }

  for (const field of ['goals', 'rules', 'nextSteps', 'openQuestions', 'importantAssets'] as const) {
    const incoming = update[field];
    if (!incoming || !Array.isArray(incoming)) continue;

    const existing = current[field] ?? [];
    const added = incoming.filter((item) => !existing.includes(item));

    if (added.length > 0) {
      diffs.push({
        field,
        action: 'added',
        newValue: added,
      });
    }
  }

  if (update.decisions && Array.isArray(update.decisions)) {
    const existing = current.decisions ?? [];
    const added = update.decisions.filter(
      (decision) => !existing.some((e) => e.decision === decision.decision),
    );

    if (added.length > 0) {
      diffs.push({
        field: 'decisions',
        action: 'added',
        newValue: added,
      });
    }
  }

  return diffs;
}

/** Map internal field names to human-readable UI labels */
export function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    summary:        'Summary',
    currentState:   'What this project is about',
    goals:          'Goals',
    rules:          'Rules',
    decisions:      'Key Decisions',
    nextSteps:      'Next Steps',
    openQuestions:  'Open Questions',
    importantAssets:'Important Files & Assets',
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

/** Apply a detected update to the current project, producing a new project object */
export function applyUpdate(current: ProjectMemory, update: DetectedUpdate): ProjectMemory {
  const now = new Date().toISOString();
  const changelog = [...current.changelog];

  const merged: ProjectMemory = { ...current };

  if (isNonEmptyString(update.summary) && update.summary !== current.summary) {
    merged.summary = update.summary;
    changelog.push({
      timestamp: now,
      field: 'summary',
      action: 'updated',
      summary: 'Summary updated by AI',
    });
  }

  if (isNonEmptyString(update.currentState) && update.currentState !== current.currentState) {
    merged.currentState = update.currentState;
    changelog.push({
      timestamp: now,
      field: 'currentState',
      action: 'updated',
      summary: 'Status updated by AI',
    });
  }

  for (const field of ['goals', 'rules', 'nextSteps', 'openQuestions', 'importantAssets'] as const) {
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
      });
    }
  }

  merged.changelog = changelog;
  return merged;
}
