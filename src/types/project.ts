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

  // ✅ NEW — HANDOFF ENGINE (all optional so nothing breaks)
  snapshots?: Snapshot[];
  handoffs?: Handoff[];
  platformState?: {
    [platform: string]: PlatformCursor;
  };
};

export const DEFAULT_AI_INSTRUCTIONS: ProjectMemory["aiInstructions"] = {
  role: "You are a project collaborator.",
  tone: "Clear, direct, structured",
  focus: "Help move the project forward without losing continuity",
};
