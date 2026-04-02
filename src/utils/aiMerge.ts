/**
 * AI update merge logic for the new ProjectMemory type system.
 * Validates incoming AI updates and merges them into the project.
 */
import type { ProjectMemory, Decision, ChangelogEntry, Platform } from '../types/project-brain-types';

export interface AiUpdatePayload {
  updateFrom?: string;
  timestamp?: string;
  summary?: string;
  currentState?: string;
  add_goals?: string[];
  add_rules?: string[];
  add_decisions?: string[];
  add_nextSteps?: string[];
  add_openQuestions?: string[];
  session_note?: string;  // AI's one-sentence summary of what it worked on
}

/** Validate that the parsed JSON has the expected AI update structure */
export function validateAiUpdate(input: unknown): input is AiUpdatePayload {
  if (typeof input !== 'object' || input === null) return false;

  const obj = input as Record<string, unknown>;
  const requiredKeys = [
    'updateFrom',
    'timestamp',
    'add_goals',
    'add_rules',
    'add_decisions',
    'add_nextSteps',
    'add_openQuestions',
  ];

  for (const key of requiredKeys) {
    if (!(key in obj)) return false;
  }

  return true;
}

/** Parse a raw paste string into an AiUpdatePayload, or return null */
export function parseAiUpdate(text: string): AiUpdatePayload | null {
  try {
    // Try to extract JSON from the paste — sometimes AIs wrap it in markdown
    let jsonStr = text.trim();

    // Strip markdown code fences if present
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1];
    }

    const parsed = JSON.parse(jsonStr);
    if (validateAiUpdate(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Merge an AI update into a project, returning the updated project */
export function mergeAiUpdate(
  project: ProjectMemory,
  update: AiUpdatePayload,
): ProjectMemory {
  const now = new Date().toISOString();

  const summaryUpdated =
    typeof update.summary === 'string' && update.summary.trim().length > 0;
  const currentStateUpdated =
    typeof update.currentState === 'string' && update.currentState.trim().length > 0;

  // Convert string decisions to Decision objects
  const newDecisions: Decision[] = (update.add_decisions || []).map((d) => ({
    decision: d,
    source: update.updateFrom || 'ai',
    timestamp: now,
  }));

  const changelogSummary = update.session_note
    ? `AI update from ${update.updateFrom || 'AI'}: ${update.session_note}`
    : 'AI update applied';

  const changelogEntry: ChangelogEntry = {
    timestamp: now,
    field: 'general',
    action: 'updated',
    summary: changelogSummary,
    source: update.updateFrom || 'ai-import',
  };

  // Update platformState for the platform that sent this update
  const platform = update.updateFrom as Platform | undefined;
  const existingPlatformState = platform
    ? (project.platformState[platform] || {})
    : {};
  const updatedPlatformState = platform
    ? {
        ...project.platformState,
        [platform]: {
          ...existingPlatformState,
          lastReplyAt: now,
          ...(update.session_note
            ? { lastSessionNote: update.session_note }
            : {}),
        },
      }
    : project.platformState;

  return {
    ...project,
    summary: summaryUpdated ? update.summary!.trim() : project.summary,
    currentState: currentStateUpdated ? update.currentState!.trim() : project.currentState,
    goals: update.add_goals
      ? [...new Set([...project.goals, ...update.add_goals])]
      : project.goals,
    rules: update.add_rules
      ? [...new Set([...project.rules, ...update.add_rules])]
      : project.rules,
    decisions: newDecisions.length > 0
      ? [...project.decisions, ...newDecisions]
      : project.decisions,
    nextSteps: update.add_nextSteps
      ? [...new Set([...project.nextSteps, ...update.add_nextSteps])]
      : project.nextSteps,
    openQuestions: update.add_openQuestions
      ? [...new Set([...project.openQuestions, ...update.add_openQuestions])]
      : project.openQuestions,
    changelog: [...project.changelog, changelogEntry],
    platformState: updatedPlatformState,
  };
}

/** Count how many items were added in an update */
export function countUpdateChanges(update: AiUpdatePayload): string {
  const parts: string[] = [];
  const add = (label: string, arr?: string[]) => {
    if (arr && arr.length > 0) parts.push(`${arr.length} ${label}`);
  };
  add('goals', update.add_goals);
  add('rules', update.add_rules);
  add('decisions', update.add_decisions);
  add('next steps', update.add_nextSteps);
  add('open questions', update.add_openQuestions);

  if (update.summary) parts.push('summary updated');
  if (update.currentState) parts.push('current state updated');

  return parts.length > 0 ? parts.join(', ') : 'no changes';
}
