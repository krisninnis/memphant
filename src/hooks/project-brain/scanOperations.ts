import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ProjectMemory } from "../../types/project";
import {
  importProjectFileData,
  saveProjectData,
} from "../../services/projectService";
import { buildProjectFromScan } from "../../utils/scanProjectContext";
import {
  ProjectBrainStateSetters,
  RescanLinkedFolderResult,
  ScanProjectFolderResult,
} from "./types";
import { fetchProjects } from "./projectOperations";

type CreateProjectFromFolderParams = ProjectBrainStateSetters;

export async function createProjectFromFolderOperation({
  setProjects,
  setProjectName,
  setMessage,
  setSelectedProject,
  setPage,
}: CreateProjectFromFolderParams) {
  const selected = await open({
    directory: true,
    multiple: false,
  });

  if (!selected || typeof selected !== "string") {
    return;
  }

  try {
    const normalizedPath = selected.replace(/\\/g, "/");
    const folderName =
      normalizedPath.split("/").filter(Boolean).pop() || "Imported Project";

    const { createProjectMemory } =
      await import("../../services/projectService");
    const baseProject = createProjectMemory(folderName);

    const result = await invoke<ScanProjectFolderResult>(
      "scan_project_folder",
      {
        folderPath: selected,
      },
    );

    const updatedProject = buildProjectFromScan({
      selectedProject: baseProject,
      folderPath: selected,
      files: result.files,
      scanHash: result.scan_hash,
      meta: result.meta,
    });

    await saveProjectData(updatedProject);
    await fetchProjects(setProjects, setMessage);

    setSelectedProject(updatedProject);
    setPage("editor");
    setProjectName("");
    setMessage(
      `Project created from folder successfully. ${
        updatedProject.linkedFolder?.path
          ? updatedProject.linkedProjectName || updatedProject.projectName
          : updatedProject.projectName
      } is now linked and ready to rescan anytime.`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error(error);
    setMessage("We couldn't create a project from that folder.");
  }
}

type HandleImportProjectParams = Pick<
  ProjectBrainStateSetters,
  "setSelectedProject" | "setPage" | "setMessage" | "setProjects"
> & {
  event: React.ChangeEvent<HTMLInputElement>;
};

export async function handleImportProjectOperation({
  event,
  setSelectedProject,
  setPage,
  setMessage,
  setProjects,
}: HandleImportProjectParams) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const importedProject = await importProjectFileData(file);
    await saveProjectData(importedProject);

    setSelectedProject(importedProject);
    setPage("editor");
    setMessage(
      `"${importedProject.projectName}" is now open. Review the details below, then copy it into your AI when you're ready.`,
    );
    await fetchProjects(setProjects, setMessage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    setMessage(`We couldn't open that saved project: ${error}`);
  } finally {
    event.target.value = "";
  }
}

type HandleProjectFolderPickParams = Pick<
  ProjectBrainStateSetters,
  "setSelectedProject" | "setMessage"
> & {
  selectedProject: ProjectMemory | null;
};

export async function handleProjectFolderPickOperation({
  selectedProject,
  setSelectedProject,
  setMessage,
}: HandleProjectFolderPickParams) {
  if (!selectedProject) return;

  const selected = await open({
    directory: true,
    multiple: false,
  });

  if (!selected || typeof selected !== "string") {
    return;
  }

  try {
    const result = await invoke<ScanProjectFolderResult>(
      "scan_project_folder",
      {
        folderPath: selected,
      },
    );

    const updatedProject = buildProjectFromScan({
      selectedProject,
      folderPath: selected,
      files: result.files,
      scanHash: result.scan_hash,
      meta: result.meta,
    });

    await saveProjectData(updatedProject);
    setSelectedProject(updatedProject);
    setMessage(
      `Project linked and scanned successfully. ${
        updatedProject.linkedProjectName || updatedProject.projectName
      } is now connected for future rescans.`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error(error);
    setMessage("We couldn't scan that project folder.");
  }
}

type HandleRescanLinkedProjectParams = Pick<
  ProjectBrainStateSetters,
  "setSelectedProject" | "setMessage"
> & {
  selectedProject: ProjectMemory | null;
};

export async function handleRescanLinkedProjectOperation({
  selectedProject,
  setSelectedProject,
  setMessage,
}: HandleRescanLinkedProjectParams) {
  if (!selectedProject) return;

  const folderPath =
    selectedProject.linkedFolder?.path ?? selectedProject.linkedProjectPath;

  if (!folderPath) {
    setMessage(
      "This project is not linked to a folder yet. Please choose a folder first.",
    );
    return;
  }

  try {
    const result = await invoke<RescanLinkedFolderResult>(
      "rescan_linked_folder",
      {
        folderPath,
      },
    );

    if (!result.folder_exists) {
      setMessage(
        "The linked folder could not be found. It may have been moved or deleted. Please re-link a folder.",
      );
      return;
    }

    const rescannedProject = buildProjectFromScan({
      selectedProject,
      folderPath,
      files: result.files,
      scanHash: result.scan_hash,
      meta: result.meta,
    });

    const updatedProject: ProjectMemory = {
      ...rescannedProject,
      changelog: [
        ...rescannedProject.changelog,
        {
          date: new Date().toISOString(),
          source: "system",
          description: `Linked project rescanned: ${
            rescannedProject.linkedProjectName || rescannedProject.projectName
          }`,
        },
      ],
    };

    await saveProjectData(updatedProject);
    setSelectedProject(updatedProject);
    setMessage(
      `Rescanned successfully. ${
        updatedProject.linkedProjectName || updatedProject.projectName
      } is up to date.`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    console.error(error);
    setMessage("We couldn't rescan the linked project folder.");
  }
}
