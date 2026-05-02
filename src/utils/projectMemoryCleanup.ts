import type { Decision, ProjectMemory } from '../types/memphant-types';
import { isMemphantPlaceholderValue } from './memphantPlaceholders';

export type CleanupField =
  | 'summary'
  | 'currentState'
  | 'lastSessionSummary'
  | 'openQuestion'
  | 'goals'
  | 'rules'
  | 'nextSteps'
  | 'openQuestions'
  | 'importantAssets'
  | 'projectCharter'
  | 'decisions';

export interface RemovedCleanupValue {
  field: CleanupField;
  value: string;
}

export interface ProjectMemoryCleanupPreview {
  draft: ProjectMemory;
  fieldsChanged: CleanupField[];
  removedPlaceholderValues: RemovedCleanupValue[];
  removedDuplicateValues: RemovedCleanupValue[];
  removedNoisyAssets: string[];
  hasChanges: boolean;
}

interface CleanupTracker {
  removedPlaceholderValues: RemovedCleanupValue[];
  removedDuplicateValues: RemovedCleanupValue[];
  removedNoisyAssets: string[];
}

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

const MOJIBAKE_PATTERN = /[�┤┼ÈÔ÷Ã¡â▄¨╔¯]/;

function cleanScalar(
  field: CleanupField,
  value: string | undefined,
  fallback: string | undefined,
  tracker: CleanupTracker,
): string | undefined {
  if (typeof value !== 'string') return fallback;

  const trimmed = value.trim();
  if (!trimmed) return fallback;

  if (isMemphantPlaceholderValue(trimmed)) {
    tracker.removedPlaceholderValues.push({ field, value });
    return fallback;
  }

  return trimmed;
}

function cleanStringList(
  field: CleanupField,
  values: string[] | undefined,
  tracker: CleanupTracker,
): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    if (isMemphantPlaceholderValue(trimmed)) {
      tracker.removedPlaceholderValues.push({ field, value });
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      tracker.removedDuplicateValues.push({ field, value });
      continue;
    }

    seen.add(key);
    cleaned.push(trimmed);
  }

  return cleaned;
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

function cleanImportantAssets(
  values: string[] | undefined,
  tracker: CleanupTracker,
): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const value of values ?? []) {
    const normalized = normalizeAssetPath(value);
    if (!normalized) continue;

    if (isMemphantPlaceholderValue(normalized)) {
      tracker.removedPlaceholderValues.push({ field: 'importantAssets', value });
      continue;
    }

    if (isNoisyOrSuspiciousAsset(normalized)) {
      tracker.removedNoisyAssets.push(value);
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      tracker.removedDuplicateValues.push({ field: 'importantAssets', value });
      continue;
    }

    seen.add(key);
    cleaned.push(normalized);
  }

  return cleaned;
}

function cleanDecisions(decisions: Decision[] | undefined, tracker: CleanupTracker): Decision[] {
  return (decisions ?? [])
    .map((decision) => {
      const decisionText = decision.decision.trim();
      if (!decisionText) return null;

      if (isMemphantPlaceholderValue(decisionText)) {
        tracker.removedPlaceholderValues.push({ field: 'decisions', value: decision.decision });
        return null;
      }

      const cleaned: Decision = {
        ...decision,
        decision: decisionText,
      };

      if (typeof decision.rationale === 'string') {
        const rationale = decision.rationale.trim();
        if (!rationale) {
          delete cleaned.rationale;
        } else if (isMemphantPlaceholderValue(rationale)) {
          tracker.removedPlaceholderValues.push({ field: 'decisions', value: decision.rationale });
          delete cleaned.rationale;
        } else {
          cleaned.rationale = rationale;
        }
      }

      return cleaned;
    })
    .filter((decision): decision is Decision => decision !== null);
}

function areEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function collectChangedFields(project: ProjectMemory, draft: ProjectMemory): CleanupField[] {
  const fields: CleanupField[] = [
    'summary',
    'currentState',
    'lastSessionSummary',
    'openQuestion',
    'goals',
    'rules',
    'nextSteps',
    'openQuestions',
    'importantAssets',
    'projectCharter',
    'decisions',
  ];

  return fields.filter((field) => !areEqual(project[field], draft[field]));
}

export function getProjectMemoryCleanupPreview(project: ProjectMemory): ProjectMemoryCleanupPreview {
  const tracker: CleanupTracker = {
    removedPlaceholderValues: [],
    removedDuplicateValues: [],
    removedNoisyAssets: [],
  };

  const draft: ProjectMemory = {
    ...project,
    summary: cleanScalar('summary', project.summary, '', tracker) ?? '',
    currentState: cleanScalar('currentState', project.currentState, '', tracker) ?? '',
    lastSessionSummary: cleanScalar(
      'lastSessionSummary',
      project.lastSessionSummary,
      undefined,
      tracker,
    ),
    openQuestion: cleanScalar('openQuestion', project.openQuestion, undefined, tracker),
    goals: cleanStringList('goals', project.goals, tracker),
    rules: cleanStringList('rules', project.rules, tracker),
    nextSteps: cleanStringList('nextSteps', project.nextSteps, tracker),
    openQuestions: cleanStringList('openQuestions', project.openQuestions, tracker),
    importantAssets: cleanImportantAssets(project.importantAssets, tracker),
    projectCharter: cleanScalar('projectCharter', project.projectCharter, '', tracker),
    decisions: cleanDecisions(project.decisions, tracker),
  };

  const fieldsChanged = collectChangedFields(project, draft);

  return {
    draft,
    fieldsChanged,
    removedPlaceholderValues: tracker.removedPlaceholderValues,
    removedDuplicateValues: tracker.removedDuplicateValues,
    removedNoisyAssets: tracker.removedNoisyAssets,
    hasChanges: fieldsChanged.length > 0,
  };
}

export function createCleanProjectMemoryDraft(project: ProjectMemory): ProjectMemory {
  return getProjectMemoryCleanupPreview(project).draft;
}
