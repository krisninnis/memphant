import type {
  ChangelogEntry,
  Decision,
  GitHubScanInfo,
  Platform,
  PlatformState,
  ProjectCheckpoint,
  ProjectMemory,
  ProjectRestorePoint,
} from '../types/memphant-types';
import { SCHEMA_VERSION } from '../types/memphant-types';

type LegacyProject = Partial<ProjectMemory> & Record<string, unknown>;

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
}

function normalizeDecisions(value: unknown): Decision[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => ({
      decision: typeof item.decision === 'string' ? item.decision : '',
      rationale: typeof item.rationale === 'string' ? item.rationale : undefined,
      alternativesConsidered: normalizeOptionalStringArray(item.alternativesConsidered),
      source: typeof item.source === 'string' ? item.source : undefined,
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : undefined,
    }))
    .filter((item) => item.decision.trim().length > 0);
}

function normalizeOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  return result.length > 0 ? result : undefined;
}

function normalizeChangelog(value: unknown): ChangelogEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item): ChangelogEntry => {
      const action: ChangelogEntry['action'] =
        item.action === 'added' || item.action === 'updated' || item.action === 'removed'
          ? item.action
          : 'updated';

      return {
        timestamp: typeof item.timestamp === 'string' ? item.timestamp : '',
        field: typeof item.field === 'string' ? item.field : '',
        action,
        summary: typeof item.summary === 'string' ? item.summary : '',
        source: typeof item.source === 'string' ? item.source : undefined,
      };
    })
    .filter(
      (item) =>
        item.timestamp.trim().length > 0 &&
        item.field.trim().length > 0 &&
        item.summary.trim().length > 0,
    );
}

function normalizePlatformEntry(value: unknown): PlatformState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const entry = value as Record<string, unknown>;

  return {
    lastExportedAt:
      typeof entry.lastExportedAt === 'string' ? entry.lastExportedAt : undefined,
    lastExportHash:
      typeof entry.lastExportHash === 'string' ? entry.lastExportHash : undefined,
    lastSeenAt: typeof entry.lastSeenAt === 'string' ? entry.lastSeenAt : undefined,
    lastReplyAt: typeof entry.lastReplyAt === 'string' ? entry.lastReplyAt : undefined,
    exportCount: typeof entry.exportCount === 'number' ? entry.exportCount : undefined,
    lastSessionNote:
      typeof entry.lastSessionNote === 'string' ? entry.lastSessionNote : undefined,
  };
}

function normalizePlatformState(
  value: unknown,
): Partial<Record<Platform, PlatformState>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const result: Partial<Record<Platform, PlatformState>> = {};

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizePlatformEntry(entry);
    if (normalized) {
      result[key] = normalized;
    }
  }

  return result;
}

function normalizeScanInfo(value: unknown): GitHubScanInfo | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const info = value as Record<string, unknown>;

  if (
    typeof info.scannedAt !== 'string' ||
    typeof info.repoUrl !== 'string'
  ) {
    return undefined;
  }

  return {
    scannedAt: info.scannedAt,
    repoUrl: info.repoUrl,
    keyFilesFound: normalizeStringArray(info.keyFilesFound),
  };
}

function normalizeCheckpoints(value: unknown): ProjectCheckpoint[] {
  if (!Array.isArray(value)) return [];
  return value as ProjectCheckpoint[];
}

function normalizeRestorePoints(value: unknown): ProjectRestorePoint[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value as ProjectRestorePoint[];
}

function normalizeLinkedFolder(
  value: unknown,
): ProjectMemory['linkedFolder'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const folder = value as Record<string, unknown>;

  if (typeof folder.path !== 'string' || folder.path.trim().length === 0) {
    return undefined;
  }

  return {
    path: folder.path,
    scanHash: typeof folder.scanHash === 'string' ? folder.scanHash : undefined,
    lastScannedAt:
      typeof folder.lastScannedAt === 'string' ? folder.lastScannedAt : undefined,
  };
}

export function normalizeOldProject(raw: LegacyProject): ProjectMemory {
  return {
    schema_version: SCHEMA_VERSION,
    id: typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : crypto.randomUUID(),
    name:
      typeof raw.name === 'string' && raw.name.trim().length > 0
        ? raw.name
        : 'Untitled Project',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    goals: normalizeStringArray(raw.goals),
    rules: normalizeStringArray(raw.rules),
    decisions: normalizeDecisions(raw.decisions),
    currentState: typeof raw.currentState === 'string' ? raw.currentState : '',
    nextSteps: normalizeStringArray(raw.nextSteps),
    openQuestions: normalizeStringArray(raw.openQuestions),
    importantAssets: normalizeStringArray(raw.importantAssets),
    aiInstructions: typeof raw.aiInstructions === 'string' ? raw.aiInstructions : undefined,
    githubRepo: typeof raw.githubRepo === 'string' ? raw.githubRepo : undefined,
    detectedStack: normalizeOptionalStringArray(raw.detectedStack),
    scanInfo: normalizeScanInfo(raw.scanInfo),
    linkedFolder: normalizeLinkedFolder(raw.linkedFolder),
    changelog: normalizeChangelog(raw.changelog),
    platformState: normalizePlatformState(raw.platformState),
    inProgress: Array.isArray(raw.inProgress)
      ? raw.inProgress.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0,
        )
      : undefined,
    lastSessionSummary:
      typeof raw.lastSessionSummary === 'string' ? raw.lastSessionSummary : undefined,
    openQuestion:
      typeof raw.openQuestion === 'string' ? raw.openQuestion : undefined,
    checkpoints: normalizeCheckpoints(raw.checkpoints),
    restorePoints: normalizeRestorePoints(raw.restorePoints),
  };
}