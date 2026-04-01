import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_AI_INSTRUCTIONS, ProjectMemory } from "../types/project";
import { normalizeImportedProject } from "../utils/projectUtils";

export function createProjectMemory(projectName: string): ProjectMemory {
  const now = new Date().toISOString();

  return {
    schema_version: "0.2.0",
    projectName: projectName.trim(),
    projectNameSource: "user",
    created: now,
    lastModified: now,

    summary: "",
    goals: [],
    rules: [],
    decisions: [],

    currentState: "Project created",
    nextSteps: [],
    openQuestions: [],

    importantAssets: [],

    // New primary linked-folder field starts empty for scratch projects.
    linkedFolder: undefined,

    // Legacy compatibility fields remain unset unless this project
    // is created from a folder/imported from an older saved file.
    linkedProjectPath: undefined,
    linkedProjectName: undefined,

    changelog: [
      {
        date: now,
        source: "app",
        description: "Project created",
      },
    ],

    aiInstructions: DEFAULT_AI_INSTRUCTIONS,

    snapshots: [],
    handoffs: [],
    platformState: {},

    scanInfo: undefined,
    scanInsights: undefined,

    // Used later so rescans can preserve user edits by default.
    autoFillState: {},
  };
}

export async function saveProjectData(project: ProjectMemory): Promise<void> {
  await invoke("save_project_file", {
    projectName: project.projectName,
    projectData: JSON.stringify(project, null, 2),
  });
}

export async function loadProjectData(
  fileName: string,
): Promise<ProjectMemory> {
  const content = await invoke<string>("load_project_file", { fileName });
  const parsed = JSON.parse(content);
  return normalizeImportedProject(parsed);
}

export async function importProjectFileData(
  file: File,
): Promise<ProjectMemory> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const normalized = normalizeImportedProject(parsed);
  const now = new Date().toISOString();

  return {
    ...normalized,
    lastModified: now,

    // Preserve imported values where they already exist.
    handoffs: normalized.handoffs ?? [],
    platformState: normalized.platformState ?? {},
    snapshots: normalized.snapshots ?? [],

    scanInfo: normalized.scanInfo,
    scanInsights: normalized.scanInsights,

    linkedFolder: normalized.linkedFolder,
    linkedProjectPath: normalized.linkedProjectPath,
    linkedProjectName: normalized.linkedProjectName,

    // Keep existing ownership/provenance when present.
    autoFillState: normalized.autoFillState ?? {},
    projectNameSource: normalized.projectNameSource ?? "import",

    changelog: [
      ...normalized.changelog,
      {
        date: now,
        source: "app",
        description: `Imported from file: ${file.name}`,
      },
    ],
  };
}
