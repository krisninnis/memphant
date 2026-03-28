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
};

export const DEFAULT_AI_INSTRUCTIONS: ProjectMemory["aiInstructions"] = {
  role: "You are a project collaborator.",
  tone: "Clear, direct, structured",
  focus: "Help move the project forward without losing continuity",
};
