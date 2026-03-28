import { DEFAULT_AI_INSTRUCTIONS, ProjectMemory } from "../types/project";

export function normalizeImportedProject(data: unknown): ProjectMemory {
  const now = new Date().toISOString();
  const safe = (data ?? {}) as Partial<ProjectMemory> & {
    changelog?: ProjectMemory["changelog"];
    aiInstructions?: ProjectMemory["aiInstructions"];
  };

  return {
    schema_version:
      typeof safe.schema_version === "string" ? safe.schema_version : "0.2.0",
    projectName:
      typeof safe.projectName === "string" && safe.projectName.trim()
        ? safe.projectName
        : "Imported Project",
    created: typeof safe.created === "string" ? safe.created : now,
    lastModified:
      typeof safe.lastModified === "string" ? safe.lastModified : now,
    summary: typeof safe.summary === "string" ? safe.summary : "",
    goals: Array.isArray(safe.goals)
      ? safe.goals.filter((x): x is string => typeof x === "string")
      : [],
    rules: Array.isArray(safe.rules)
      ? safe.rules.filter((x): x is string => typeof x === "string")
      : [],
    decisions: Array.isArray(safe.decisions)
      ? safe.decisions.filter((x): x is string => typeof x === "string")
      : [],
    currentState:
      typeof safe.currentState === "string"
        ? safe.currentState
        : "Imported project",
    nextSteps: Array.isArray(safe.nextSteps)
      ? safe.nextSteps.filter((x): x is string => typeof x === "string")
      : [],
    openQuestions: Array.isArray(safe.openQuestions)
      ? safe.openQuestions.filter((x): x is string => typeof x === "string")
      : [],
    importantAssets: Array.isArray(safe.importantAssets)
      ? safe.importantAssets.filter((x): x is string => typeof x === "string")
      : [],
    changelog: Array.isArray(safe.changelog)
      ? safe.changelog.filter(
          (entry): entry is ProjectMemory["changelog"][number] =>
            !!entry &&
            typeof entry.date === "string" &&
            typeof entry.source === "string" &&
            typeof entry.description === "string",
        )
      : [],
    aiInstructions:
      safe.aiInstructions &&
      typeof safe.aiInstructions.role === "string" &&
      typeof safe.aiInstructions.tone === "string" &&
      typeof safe.aiInstructions.focus === "string"
        ? safe.aiInstructions
        : DEFAULT_AI_INSTRUCTIONS,
  };
}

export function sanitizeForAiExport(project: ProjectMemory): ProjectMemory {
  const secretKeyPattern =
    /(secret|token|api[_-]?key|password|passwd|private[_-]?key|client[_-]?secret|bearer|auth)/i;

  const envFilePattern =
    /(^|[\\/])(\.env|\.env\..+|secrets?\.|credentials?|id_rsa|\.pem|\.p12|\.key)$/i;

  const redactString = (value: string): string => {
    if (secretKeyPattern.test(value) || envFilePattern.test(value)) {
      return "[REDACTED]";
    }
    return value;
  };

  return {
    ...project,
    summary: redactString(project.summary),
    currentState: redactString(project.currentState),
    goals: project.goals.map(redactString),
    rules: project.rules.map(redactString),
    decisions: project.decisions.map(redactString),
    nextSteps: project.nextSteps.map(redactString),
    openQuestions: project.openQuestions.map(redactString),
    importantAssets: project.importantAssets.map((asset) =>
      envFilePattern.test(asset) || secretKeyPattern.test(asset)
        ? "[REDACTED]"
        : asset,
    ),
    changelog: project.changelog.map((entry) => ({
      ...entry,
      description: redactString(entry.description),
    })),
    aiInstructions: {
      ...project.aiInstructions,
      focus: redactString(project.aiInstructions.focus),
      role: redactString(project.aiInstructions.role),
      tone: redactString(project.aiInstructions.tone),
    },
  };
}
