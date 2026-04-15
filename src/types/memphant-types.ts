export type Platform = 'chatgpt' | 'claude' | 'grok' | 'perplexity' | 'gemini';
export type ExportMode = 'full' | 'delta' | 'specialist' | 'smart';

export interface Decision {
  decision: string;
  rationale?: string;
  alternativesConsidered?: string[];
  source?: string;
  timestamp?: string;
}

export interface ChangelogEntry {
  timestamp: string;
  field: string;
  action: 'added' | 'updated' | 'removed';
  summary: string;
  source?: string;
}

export interface LinkedFolder {
  path: string; // NEVER exported
  scanHash?: string;
  lastScannedAt?: string;
}

export interface PlatformState {
  lastExportedAt?: string;
  lastExportHash?: string;
  lastSeenAt?: string;
  lastReplyAt?: string;
  exportCount?: number;
  lastSessionNote?: string;
}

export interface GitHubScanInfo {
  scannedAt: string;        // ISO timestamp
  repoUrl: string;
  keyFilesFound: string[];  // files successfully fetched during scan
}

export interface ProjectCheckpointSnapshot {
  schema_version: number;
  id: string;
  name: string;
  updatedAt?: string;
  summary: string;
  goals: string[];
  rules: string[];
  decisions: Decision[];
  currentState: string;
  nextSteps: string[];
  openQuestions: string[];
  importantAssets: string[];
  aiInstructions?: string;
  githubRepo?: string;          // Optional public GitHub repo URL — included in AI exports
  detectedStack?: string[];     // Tech stack extracted from repo scan (e.g. ["React", "TypeScript"])
  scanInfo?: GitHubScanInfo;    // Metadata from the last successful GitHub scan
  linkedFolder?: LinkedFolder;
  changelog: ChangelogEntry[];
  platformState: Partial<Record<Platform, PlatformState>>;
}

export interface ProjectCheckpoint {
  id: string;
  platform: Platform;
  timestamp: string;
  summary: string;
  snapshot: ProjectCheckpointSnapshot;
  hash: string;
}

export interface ProjectRestorePoint {
  id: string;
  timestamp: string;
  reason: 'ai_apply' | 'rescan';
  summary: string;
  snapshot: ProjectCheckpointSnapshot;
}

export interface ProjectMemory extends ProjectCheckpointSnapshot {
  checkpoints: ProjectCheckpoint[];
  restorePoints?: ProjectRestorePoint[];
}

export interface MemphantUpdate {
  updateFrom?: string;
  timestamp?: string;
  summary?: string;
  currentState?: string;
  add_goals?: string[];
  add_rules?: string[];
  add_decisions?: string[];
  add_nextSteps?: string[];
  add_openQuestions?: string[];
  session_note?: string;
}

export interface DiffResult {
  field: string;
  action: 'added' | 'updated' | 'removed';
  oldValue?: unknown;
  newValue?: unknown;
  checkpointValue?: unknown;
  riskyOverwrite?: boolean;
  checkpointId?: string;
}

export interface ExportCache {
  platform: Platform;
  mode: ExportMode;
  content: string;
  generatedAt: string;
  stateHash: string;
}

export interface AppSettings {
  general: {
    theme: 'dark' | 'light' | 'system';
    defaultPlatform: Platform;
    autoSave: boolean;
    runOnStartup: boolean;
    systemTray: boolean;
  };
  privacy: {
    cloudSyncEnabled: boolean;
    secretsScannerLevel: 'standard' | 'strict';
  };
  localAi: {
    enabled: boolean;
    provider: 'ollama';
    model: string;
    endpoint: string;
  };
  projects: {
    autoRescanOnOpen: boolean;
    snapshotCount: number;
    defaultExportMode: ExportMode;
  };
  platforms: {
    enabled: Record<Platform, boolean>;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    theme: 'dark',
    defaultPlatform: 'claude',
    autoSave: true,
    runOnStartup: false,
    systemTray: false,
  },
  privacy: {
    cloudSyncEnabled: false,
    secretsScannerLevel: 'standard',
  },
  localAi: {
    enabled: false,
    provider: 'ollama',
    model: 'llama3.1:8b',
    endpoint: 'http://127.0.0.1:11434',
  },
  projects: {
    autoRescanOnOpen: false,
    snapshotCount: 20,
    defaultExportMode: 'full',
  },
  platforms: {
    enabled: {
      chatgpt: true,
      claude: true,
      grok: true,
      perplexity: true,
      gemini: true,
    },
  },
};

export function cloneCheckpointSnapshot(project: ProjectCheckpointSnapshot): ProjectCheckpointSnapshot {
  return {
    schema_version: project.schema_version,
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    summary: project.summary,
    goals: [...project.goals],
    rules: [...project.rules],
    decisions: project.decisions.map((decision) => ({ ...decision })),
    currentState: project.currentState,
    nextSteps: [...project.nextSteps],
    openQuestions: [...project.openQuestions],
    importantAssets: [...project.importantAssets],
    aiInstructions: project.aiInstructions,
    githubRepo: project.githubRepo,
    detectedStack: project.detectedStack ? [...project.detectedStack] : undefined,
    scanInfo: project.scanInfo
      ? {
          scannedAt: project.scanInfo.scannedAt,
          repoUrl: project.scanInfo.repoUrl,
          keyFilesFound: [...project.scanInfo.keyFilesFound],
        }
      : undefined,
    linkedFolder: project.linkedFolder ? { ...project.linkedFolder } : undefined,
    changelog: project.changelog.map((entry) => ({ ...entry })),
    platformState: Object.fromEntries(
      Object.entries(project.platformState ?? {}).map(([platform, state]) => [
        platform,
        state ? { ...state } : state,
      ]),
    ) as Partial<Record<Platform, PlatformState>>,
  };
}

export function hashProjectState(project: ProjectCheckpointSnapshot): string {
  const key = [
    project.summary,
    project.currentState,
    project.goals.join('|'),
    project.rules.join('|'),
    project.decisions.map((d) => `${d.decision}::${d.rationale || ''}`).join('|'),
    project.nextSteps.join('|'),
    project.openQuestions.join('|'),
  ].join('::');

  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33) ^ key.charCodeAt(i);
    hash = hash >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}
