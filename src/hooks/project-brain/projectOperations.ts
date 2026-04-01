import { invoke } from "@tauri-apps/api/core";
import { ProjectMemory } from "../../types/project";
import {
  createProjectMemory,
  loadProjectData,
  saveProjectData,
} from "../../services/projectService";
import { createSnapshot } from "../../utils/projectUtils";
import { ProjectBrainStateSetters } from "./types";

export async function fetchProjects(
  setProjects: ProjectBrainStateSetters["setProjects"],
  setMessage: ProjectBrainStateSetters["setMessage"],
) {
  try {
    const result = await invoke<string[]>("load_projects");
    setProjects(result);
  } catch (error) {
    setMessage(`We couldn't load your projects: ${error}`);
  }
}

type CreateProjectParams = ProjectBrainStateSetters & {
  projectName: string;
};

export async function createProjectOperation({
  projectName,
  setProjectName,
  setMessage,
  setProjects,
  setSelectedProject,
  setPage,
}: CreateProjectParams) {
  if (!projectName.trim()) {
    setMessage("Please enter a project name first.");
    return;
  }

  try {
    const baseProject = createProjectMemory(projectName);
    const firstSnapshot = createSnapshot(baseProject);

    const project: ProjectMemory = {
      ...baseProject,
      snapshots: [firstSnapshot],
    };

    await saveProjectData(project);

    setProjectName("");
    setMessage(
      `New project created! "${project.projectName}" is now open. Start by filling in what the project is about, then copy it into your AI when you're ready.`,
    );
    await fetchProjects(setProjects, setMessage);
    setSelectedProject(project);
    setPage("editor");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    setMessage(`We couldn't create that project: ${error}`);
  }
}

type OpenProjectParams = Pick<
  ProjectBrainStateSetters,
  "setSelectedProject" | "setMessage"
> & {
  fileName: string;
};

export async function openProjectOperation({
  fileName,
  setSelectedProject,
  setMessage,
}: OpenProjectParams) {
  try {
    const project = await loadProjectData(fileName);
    setSelectedProject(project);
    setMessage(
      `"${project.projectName}" is now open. Review the details below, then copy it into your AI when you're ready.`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    setMessage(`We couldn't open that project: ${error}`);
  }
}

type DeleteProjectParams = Pick<
  ProjectBrainStateSetters,
  "setSelectedProject" | "setPage" | "setMessage" | "setProjects"
> & {
  fileName: string;
  selectedProject: ProjectMemory | null;
};

export async function deleteProjectOperation({
  fileName,
  selectedProject,
  setSelectedProject,
  setPage,
  setMessage,
  setProjects,
}: DeleteProjectParams) {
  try {
    await invoke("delete_project_file", { fileName });

    const wasCurrentProject =
      selectedProject &&
      `${selectedProject.projectName.replace(/ /g, "_")}.json` === fileName;

    if (wasCurrentProject) {
      setSelectedProject(null);
      setPage("projects");
    }

    setMessage(`"${fileName}" was removed.`);
    await fetchProjects(setProjects, setMessage);

    if (wasCurrentProject) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  } catch (error) {
    setMessage(`We couldn't remove that project: ${error}`);
  }
}

type SaveProjectParams = Pick<
  ProjectBrainStateSetters,
  "setSelectedProject" | "setPreAiBackupProject" | "setMessage"
> & {
  selectedProject: ProjectMemory | null;
};

export async function saveProjectOperation({
  selectedProject,
  setSelectedProject,
  setPreAiBackupProject,
  setMessage,
}: SaveProjectParams) {
  if (!selectedProject) return;

  const now = new Date().toISOString();
  const newSnapshot = createSnapshot(selectedProject);

  const existingSnapshots = selectedProject.snapshots ?? [];
  const lastSnapshot = existingSnapshots[existingSnapshots.length - 1];

  const shouldAddSnapshot =
    !lastSnapshot || lastSnapshot.hash !== newSnapshot.hash;

  const updated: ProjectMemory = {
    ...selectedProject,
    lastModified: now,
    snapshots: shouldAddSnapshot
      ? [...existingSnapshots, newSnapshot]
      : existingSnapshots,
    changelog: [
      ...selectedProject.changelog,
      {
        date: now,
        source: "app",
        description: shouldAddSnapshot
          ? "Project updated and snapshot created"
          : "Project updated",
      },
    ],
  };

  try {
    await saveProjectData(updated);
    setSelectedProject(updated);
    setPreAiBackupProject(null);
    setMessage(
      `"${updated.projectName}" was saved successfully. You can keep editing or copy it into your AI.`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    setMessage(`We couldn't save your project: ${error}`);
  }
}
