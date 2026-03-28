import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_AI_INSTRUCTIONS, ProjectMemory } from "../types/project";
import { normalizeImportedProject } from "../utils/projectUtils";

export function createProjectMemory(projectName: string): ProjectMemory {
  const now = new Date().toISOString();

  return {
    schema_version: "0.2.0",
    projectName: projectName.trim(),
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
    changelog: [
      {
        date: now,
        source: "app",
        description: "Project created",
      },
    ],
    aiInstructions: DEFAULT_AI_INSTRUCTIONS,
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
