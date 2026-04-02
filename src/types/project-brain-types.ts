// Core types for Project Brain
// Backward-compatible with existing saved JSON — all new fields are optional.

export type Platform = 'chatgpt' | 'claude' | 'grok' | 'perplexity' | 'gemini';
export type ExportMode = 'full' | 'delta' | 'specialist';

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
  path: string;           // NEVER exported
  scanHash?: string;
  lastScannedAt?: string;
}

export interface PlatformState {
  lastExportedAt?: string;    // when user last copied to this platform
  lastExportHash?: string;    // hash of project state at that moment
  lastReplyAt?: string;       // when user last pasted a response back from this platform
  exportCount?: number;
  // A short AI-written note from the last session on this platform
  lastSessionNote?: string;
}

export interface ProjectMemory {
  schema_version: number;
  id: string;
  name: string;
  summary: string;
  goals: string[];
  rules: string[];
  decisions: Decision[];
  currentState: string;
  nextSteps: string[];
  openQuestions: string[];
  importantAssets: string[];
  aiInstructions?: string;
  linkedFolder?: LinkedFolder;
  changelog: ChangelogEntry[];
  platformState: Partial<Record<Platform, PlatformState>>;
}

export interface ProjectBrainUpdate {
  updateFrom?: string;
  timestamp?: string;
  summary?: string;
  currentState?: string;
  add_goals?: string[];
  add_rules?: string[];
  add_decisions?: string[];
  add_nextSteps?: string[];
  add_openQuestions?: string[];
  session_note?: string;  // AI's summary of what it worked on this session
}

export interface DiffResult {
  field: string;
  action: 'added' | 'updated' | 'removed';
  oldValue?: unknown;
  newValue?: unknown;
}

export interface ExportCache {
  platform: Platform;
  mode: ExportMode;
  content: string;
  generatedAt: string;
  stateHash: string;
}

// ─── App Settings ─────────────────────────────────────────────────────────────

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

// ─── State hash for delta tracking ────────────────────────────────────────────

export function hashProjectState(project: ProjectMemory): string {
  const key = [
    project.summary,
    project.currentState,
    project.goals.join('|'),
    project.rules.join('|'),
    project.decisions.map(d => d.decision).join('|'),
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
