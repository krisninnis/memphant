import { ProjectMemory } from "../types/project";

type AiUpdatePayload = {
  updateFrom?: string;
  summary?: string;
  currentState?: string;
  add_goals?: string[];
  add_rules?: string[];
  add_decisions?: string[];
  add_nextSteps?: string[];
  add_openQuestions?: string[];
};

export function validateAiUpdate(input: any): boolean {
  if (typeof input !== "object" || input === null) return false;

  const requiredKeys = [
    "updateFrom",
    "timestamp",
    "add_goals",
    "add_rules",
    "add_decisions",
    "add_nextSteps",
    "add_openQuestions",
  ];

  for (const key of requiredKeys) {
    if (!(key in input)) return false;
  }

  return true;
}

export function mergeAiUpdateIntoProject(
  selectedProject: ProjectMemory,
  aiImportText: string,
): ProjectMemory {
  const parsed = JSON.parse(aiImportText) as AiUpdatePayload;
  const now = new Date().toISOString();

  const summaryUpdated =
    typeof parsed.summary === "string" && parsed.summary.trim().length > 0;

  const currentStateUpdated =
    typeof parsed.currentState === "string" &&
    parsed.currentState.trim().length > 0;

  return {
    ...selectedProject,
    summary: summaryUpdated ? parsed.summary!.trim() : selectedProject.summary,
    currentState: currentStateUpdated
      ? parsed.currentState!.trim()
      : selectedProject.currentState,
    goals: parsed.add_goals
      ? [...new Set([...selectedProject.goals, ...parsed.add_goals])]
      : selectedProject.goals,
    rules: parsed.add_rules
      ? [...new Set([...selectedProject.rules, ...parsed.add_rules])]
      : selectedProject.rules,
    decisions: parsed.add_decisions
      ? [...new Set([...selectedProject.decisions, ...parsed.add_decisions])]
      : selectedProject.decisions,
    nextSteps: parsed.add_nextSteps
      ? [...new Set([...selectedProject.nextSteps, ...parsed.add_nextSteps])]
      : selectedProject.nextSteps,
    openQuestions: parsed.add_openQuestions
      ? [
          ...new Set([
            ...selectedProject.openQuestions,
            ...parsed.add_openQuestions,
          ]),
        ]
      : selectedProject.openQuestions,
    autoFillState: {
      ...selectedProject.autoFillState,
      summary: summaryUpdated ? "ai" : selectedProject.autoFillState?.summary,
      currentState: currentStateUpdated
        ? "ai"
        : selectedProject.autoFillState?.currentState,
    },
    lastModified: now,
    changelog: [
      ...selectedProject.changelog,
      {
        date: now,
        source: parsed.updateFrom || "ai-import",
        description: "AI update applied",
      },
    ],
  };
}
