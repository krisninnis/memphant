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

  linkedProjectPath?: string;
  linkedProjectName?: string;

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
};

export const DEFAULT_AI_INSTRUCTIONS: ProjectMemory["aiInstructions"] = {
  role: "You are a project collaborator.",
  tone: "Clear, direct, structured",
  focus: "Help move the project forward without losing continuity",
};
