/**
 * @deprecated Use memphant-types.ts instead. This file is a legacy duplicate
 * from the old brand name and will be removed in a future cleanup pass.
 * Do not add new types here.
 */
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
export type PlatformExportStyle = 'structured' | 'compact' | 'code-heavy';

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
  lastReplyAt?: string;
  exportCount?: number;
  lastSessionNote?: string;
}

export interface ProjectMemory {
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
  projectCharter?: string;
  aiInstructions?: string;
  linkedFolder?: LinkedFolder;
  changelog: ChangelogEntry[];
  platformState: Partial<Record<Platform, PlatformState>>;
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
  projects: {
    autoRescanOnOpen: boolean;
    snapshotCount: number;
    defaultExportMode: ExportMode;
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
      gemini: true,
      perplexity: true,
      grok: true,
      cursor: false,
      'github-copilot': false,
      phind: false,
      ollama: false,
      'lm-studio': false,
      jan: false,
      localai: false,
      anythingllm: false,
    },
    custom: [],
  },
};

export function hashProjectState(project: ProjectMemory): string {
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
