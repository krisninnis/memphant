export type BuiltInPlatformId =
  | 'chatgpt'
  | 'claude'
  | 'gemini'
  | 'perplexity'
  | 'grok'
  | 'cursor'
  | 'github-copilot'
  | 'phind'
  | 'ollama'
  | 'lm-studio'
  | 'jan'
  | 'localai'
  | 'anythingllm';

export type Platform = string;
export type ExportMode = 'full' | 'delta' | 'specialist' | 'smart';
export type PlatformCategory = 'chat' | 'dev' | 'local' | 'custom';

// -- Agent Handoff -------------------------------------------------------------

/**
 * The role the next AI session should play.
 * Drives the output contract prepended by buildContinuityPreamble():
 *   'continue' -- pick up where the last session left off
 *   'debug'    -- focus on diagnosing a specific problem
 *   'review'   -- audit / critique the current state
 */
export type HandoffMode = 'continue' | 'debug' | 'review';

/**
 * Records the most recent AI session on this project.
 * Written by updateLastAiSession() whenever the user copies an export.
 * Read by buildContinuityPreamble() to produce the "last session" blurb.
 */
export interface LastAiSession {
  /** Which platform the session was on. */
  platform: Platform;
  /** The role requested for the next AI session. */
  mode: HandoffMode;
  /** ISO-8601 timestamp of when the export was copied. */
  sessionAt: string;
  /** What the user was trying to accomplish (from the task input field). */
  userTaskSummary?: string;
  /** Why the user is switching platforms or starting a new session. */
  userSwitchReason?: string;
  /** Files changed since the last session -- populated by Slice 2, optional now. */
  filesChangedSince?: string[];
}

// -----------------------------------------------------------------------------

export type PlatformExportStyle = 'structured' | 'compact' | 'code-heavy';
export type StableItemPrefix = 'D' | 'R' | 'G' | 'Q';

export interface AIPlatformConfig {
  id: Platform;
  name: string;
  category: PlatformCategory;
  exportStyle: PlatformExportStyle;
  promptPrefix: string;
  enabled: boolean;
  builtIn: boolean;
  icon?: string;
  color?: string;
  description?: string;
}

export interface CustomPlatformConfig {
  id: Platform;
  name: string;
  category: PlatformCategory;
  exportStyle: PlatformExportStyle;
  promptPrefix: string;
  icon?: string;
  color?: string;
}

export interface Decision {
  id?: string;
  decision: string;
  rationale?: string;
  alternativesConsidered?: string[];
  source?: string;
  timestamp?: string;
}

export interface ProjectNextIds {
  D: number;
  R: number;
  G: number;
  Q: number;
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
  scannedAt: string;
  repoUrl: string;
  keyFilesFound: string[];
}

export interface GitCommit {
  hash: string;
  message: string;
  timestamp: string;
  author: string;
}

// Human-readable schema version for the project data format.
export const SCHEMA_VERSION = '1.2.0';

export interface ProjectCheckpointSnapshot {
  schema_version: number | string;
  id: string;
  name: string;
  updatedAt?: string;
  summary: string;
  goals: string[];
  goalIds?: string[];
  rules: string[];
  ruleIds?: string[];
  decisions: Decision[];
  currentState: string;
  nextSteps: string[];
  openQuestions: string[];
  openQuestionIds?: string[];
  importantAssets: string[];
  aiInstructions?: string;
  githubRepo?: string;
  detectedStack?: string[];
  scanInfo?: GitHubScanInfo;
  linkedFolder?: LinkedFolder;
  lastGitSync?: {
    hash: string;
    timestamp: string;
    commitCount: number;
  };
  pendingGitCommits?: GitCommit[];
  changelog: ChangelogEntry[];
  platformState: Partial<Record<Platform, PlatformState>>;
  nextIds?: ProjectNextIds;
  /** Active work-in-flight right now. REPLACE-ALL on AI update. */
  inProgress?: string[];
  /** ~2-4 sentence recap of what happened in the last session. REPLACE on AI update. */
  lastSessionSummary?: string;
  /** The current decision or question the user wants the AI to focus on. REPLACE on AI update. */
  openQuestion?: string;
  /** Most recent AI session on this project. Written on every export copy. */
  lastAiSession?: LastAiSession;
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
  /** Replaces the entire inProgress array ([] = clear). */
  inProgress?: string[];
  /** Replaces the lastSessionSummary string. */
  lastSessionSummary?: string;
  /** Replaces the openQuestion string. */
  openQuestion?: string;
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
    autoGitSync: boolean;
    hasSeenOnboarding: boolean;
  };
  privacy: {
    cloudSyncEnabled: boolean;
    secretsScannerLevel: 'standard' | 'strict';
    /** Opt-in crash/error reporting via Sentry. Default: false. */
    sendCrashReports: boolean;
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
    autoMemoryUpdateInterval: 'off' | '15min' | '30min' | '1hour';
  };
  platforms: {
    enabled: Record<string, boolean>;
    custom: CustomPlatformConfig[];
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  general: {
    theme: 'dark',
    defaultPlatform: 'claude',
    autoSave: true,
    runOnStartup: false,
    systemTray: false,
    autoGitSync: false,
    hasSeenOnboarding: false,
  },
  privacy: {
    cloudSyncEnabled: false,
    secretsScannerLevel: 'standard',
    sendCrashReports: false,
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
    autoMemoryUpdateInterval: '30min',
  },
  platforms: {
    enabled: {
      chatgpt: true,
      claude: true,
      gemini: true,
      perplexity: true,
      grok: true,
      cursor: false,
      'github-copilot': false,
      phind: false,
      codex: false,
      cowork: false,
      ollama: false,
      'lm-studio': false,
      jan: false,
      localai: false,
      anythingllm: false,
    },
    custom: [],
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
    goalIds: project.goalIds ? [...project.goalIds] : undefined,
    rules: [...project.rules],
    ruleIds: project.ruleIds ? [...project.ruleIds] : undefined,
    decisions: project.decisions.map((decision) => ({ ...decision })),
    currentState: project.currentState,
    nextSteps: [...project.nextSteps],
    openQuestions: [...project.openQuestions],
    openQuestionIds: project.openQuestionIds ? [...project.openQuestionIds] : undefined,
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
    lastGitSync: project.lastGitSync
      ? {
          hash: project.lastGitSync.hash,
          timestamp: project.lastGitSync.timestamp,
          commitCount: project.lastGitSync.commitCount,
        }
      : undefined,
    pendingGitCommits: project.pendingGitCommits
      ? project.pendingGitCommits.map((commit) => ({ ...commit }))
      : undefined,
    changelog: project.changelog.map((entry) => ({ ...entry })),
    platformState: Object.fromEntries(
      Object.entries(project.platformState ?? {}).map(([platform, state]) => [
        platform,
        state ? { ...state } : state,
      ]),
    ) as Partial<Record<Platform, PlatformState>>,
    nextIds: project.nextIds ? { ...project.nextIds } : undefined,
    inProgress: project.inProgress ? [...project.inProgress] : undefined,
    lastSessionSummary: project.lastSessionSummary,
    openQuestion: project.openQuestion,
    lastAiSession: project.lastAiSession ? { ...project.lastAiSession } : undefined,
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
    (project.inProgress ?? []).join('|'),
    project.lastSessionSummary ?? '',
    project.openQuestion ?? '',
  ].join('::');

  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33) ^ key.charCodeAt(i);
    hash = hash >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}
