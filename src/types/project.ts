export type Snapshot = {
  id: string;
  createdAt: string;
  hash: string;

  summary: string;
  currentState: string;
  goals: string[];
  rules: string[];
  decisions: string[];
  nextSteps: string[];
  openQuestions: string[];
};

export type Handoff = {
  id: string;
  fromPlatform: string | "app";
  toPlatform: string;
  purpose: string;

  createdAt: string;
  basedOnSnapshotId: string;

  status:
    | "prepared"
    | "copied"
    | "waiting_reply"
    | "reply_received"
    | "applied";
};

export type PlatformCursor = {
  lastSentSnapshotId: string;
  lastReplyAt?: string;
};

export type ScanInfo = {
  detectedType: string;
  detectedTags: string[];
  scannedFileCount: number;
  importantFileCount: number;
  excludedFileCount: number;
  lastScannedAt: string;
};

export type ScanInsights = {
  architecture: string;
  likelyEntryPoint?: string;
  likelyAuthFiles: string[];
  likelyModelFiles: string[];
  likelyConfigFiles: string[];
  likelyDocs: string[];
  confidence: "low" | "medium" | "high";
  notes: string[];
};

export type LinkedFolder = {
  path: string; // absolute path — never included in AI exports
  lastScannedAt: string; // ISO 8601
  scanHash: string; // hash of file list, truncated to 12 chars
};

export type AutoFillState = {
  summary?: "scan" | "user" | "ai";
  currentState?: "scan" | "user" | "ai";
};

export type ProjectNameSource =
  | "user"
  | "scan_package"
  | "scan_folder"
  | "import";

export type ProjectMemory = {
  schema_version: string;
  projectName: string;
  created: string;
  lastModified: string;

  summary: string;
  goals: string[];
  rules: string[];
  decisions: string[];

  currentState: string;
  nextSteps: string[];
  openQuestions: string[];

  importantAssets: string[];

  // Legacy fields — compatibility-only.
  // New logic should read linkedFolder first and only fall back to these
  // when opening older saved projects.
  linkedProjectPath?: string;
  linkedProjectName?: string;

  // Primary linked-folder source of truth for all new logic.
  linkedFolder?: LinkedFolder;

  changelog: {
    date: string;
    source: string;
    description: string;
  }[];

  aiInstructions: {
    role: string;
    tone: string;
    focus: string;
  };

  snapshots?: Snapshot[];
  handoffs?: Handoff[];
  platformState?: {
    [platform: string]: PlatformCursor;
  };

  scanInfo?: ScanInfo;
  scanInsights?: ScanInsights;

  // Tracks whether key text fields were auto-filled or explicitly changed,
  // so rescans can preserve user edits by default.
  autoFillState?: AutoFillState;

  // Helps prevent rescans/imports from unexpectedly renaming projects
  // that the user has already named themselves.
  projectNameSource?: ProjectNameSource;
};

export const DEFAULT_AI_INSTRUCTIONS: ProjectMemory["aiInstructions"] = {
  role: "You are a project collaborator.",
  tone: "Clear, direct, structured",
  focus: "Help move the project forward without losing continuity",
};
