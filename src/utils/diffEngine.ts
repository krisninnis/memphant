/**
 * Diff engine — detects, computes, and applies AI project updates.
 * Used by the Paste Zone to process AI responses.
 */
import type { ProjectMemory, DiffResult } from '../types/project-brain-types';

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

/**
 * Scan pasted text for a project update block.
 * Tries three strategies in order of reliability.
 */
export function detectUpdate(text: string): DetectedUpdate | null {
  // Strategy 1: Look for project_brain_update marker
  const markerMatch = text.match(/project_brain_update\s*\n?(\{[\s\S]*?\n\})/);
  if (markerMatch) {
    try {
      return JSON.parse(markerMatch[1]);
    } catch { /* fall through */ }
  }

  // Strategy 2: Look for ```json code blocks containing project fields
  const codeBlockMatch = text.match(/```(?:json)?\s*\n(\{[\s\S]*?\})\s*\n```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (hasProjectFields(parsed)) return parsed;
    } catch { /* fall through */ }
  }

  // Strategy 3: Find the largest bare JSON object with project fields
  const bareJsonMatch = text.match(/\{[\s\S]*?"(?:summary|goals|decisions|currentState|nextSteps)"[\s\S]*?\}/);
  if (bareJsonMatch) {
    try {
      const parsed = JSON.parse(bareJsonMatch[0]);
      if (hasProjectFields(parsed)) return parsed;
    } catch { /* fall through */ }
  }

  return null;
}

function hasProjectFields(obj: unknown): obj is DetectedUpdate {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return !!(o.summary || o.goals || o.decisions || o.currentState || o.nextSteps || o.openQuestions);
}

/** Compute a human-readable diff between current project and an incoming update */
export function computeDiff(current: ProjectMemory, update: DetectedUpdate): DiffResult[] {
  const diffs: DiffResult[] = [];

  // String fields
  for (const field of ['summary', 'currentState'] as const) {
    if (update[field] && update[field] !== current[field]) {
      diffs.push({ field, action: 'updated', oldValue: current[field], newValue: update[field] });
    }
  }

  // Array fields
  for (const field of ['goals', 'rules', 'nextSteps', 'openQuestions', 'importantAssets'] as const) {
    const incoming = (update as Record<string, unknown>)[field] as string[] | undefined;
    if (incoming && Array.isArray(incoming)) {
      const existing = (current[field] as string[]) || [];
      const added = incoming.filter((item) => !existing.includes(item));
      const removed = existing.filter((item) => !incoming.includes(item));
      if (added.length > 0) diffs.push({ field, action: 'added', newValue: added });
      if (removed.length > 0) diffs.push({ field, action: 'removed', oldValue: removed });
    }
  }

  // Decisions
  if (update.decisions && Array.isArray(update.decisions)) {
    const existing = current.decisions || [];
    const added = update.decisions.filter(
      (d) => !existing.some((cd) => cd.decision === d.decision)
    );
    if (added.length > 0) diffs.push({ field: 'decisions', action: 'added', newValue: added });
  }

  return diffs;
}

/** Apply a detected update to a project, returning the merged result */
export function applyUpdate(current: ProjectMemory, update: DetectedUpdate): ProjectMemory {
  const now = new Date().toISOString();
  const updated = { ...current };

  if (update.summary) updated.summary = update.summary;
  if (update.currentState) updated.currentState = update.currentState;

  // Merge arrays (add new items, keep existing)
  for (const field of ['goals', 'rules', 'nextSteps', 'openQuestions', 'importantAssets'] as const) {
    const incoming = (update as Record<string, unknown>)[field] as string[] | undefined;
    if (incoming && Array.isArray(incoming)) {
      const existing = (current[field] as string[]) || [];
      const newItems = incoming.filter((item) => !existing.includes(item));
      (updated as unknown as Record<string, unknown>)[field] = [...existing, ...newItems];
    }
  }

  // Merge decisions
  if (update.decisions && Array.isArray(update.decisions)) {
    const existing = current.decisions || [];
    const newDecisions = update.decisions
      .filter((d) => !existing.some((cd) => cd.decision === d.decision))
      .map((d) => ({ ...d, timestamp: now, source: 'ai' }));
    updated.decisions = [...existing, ...newDecisions];
  }

  // Add changelog entry
  updated.changelog = [
    ...current.changelog,
    { timestamp: now, field: 'general', action: 'updated', summary: 'AI update applied', source: 'ai-paste' },
  ];

  return updated;
}

/** Human-readable label for a diff field */
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
  return labels[field] || field;
}

/** Count total changes across all diffs */
export function countDiffs(diffs: DiffResult[]): number {
  return diffs.reduce((total, d) => {
    const val = d.action === 'added' ? d.newValue : d.oldValue;
    if (Array.isArray(val)) return total + val.length;
    return total + 1;
  }, 0);
}
