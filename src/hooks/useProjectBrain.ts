import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AIPlatform, PLATFORM_CONFIG } from "../config/aiPlatforms";
import {
  createProjectMemory,
  importProjectFileData,
  loadProjectData,
  saveProjectData,
} from "../services/projectService";
import {
  mergeAiUpdateIntoProject,
  validateAiUpdate,
} from "../services/aiUpdateService";
import { scanUploadedProjectFiles } from "../services/projectScanService";
import { ProjectMemory } from "../types/project";
import {
  buildDeltaSummary,
  createSnapshot,
  getLatestSnapshot,
  getPlatformLastSeenSnapshot,
} from "../utils/projectUtils";
import { buildExportPrompt } from "../utils/exportPromptBuilder";

export function useProjectBrain() {
  const [page, setPage] = useState<"home" | "projects" | "editor">("home");
  const [targetPlatform, setTargetPlatform] = useState<AIPlatform>("chatgpt");
  const [projectName, setProjectName] = useState("");
  const [message, setMessage] = useState("");
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectMemory | null>(
    null,
  );
  const [aiImportText, setAiImportText] = useState("");
  const [preAiBackupProject, setPreAiBackupProject] =
    useState<ProjectMemory | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const projectNameInputRef = useRef<HTMLInputElement | null>(null);
  const autoApplyTimeoutRef = useRef<number | null>(null);
  const lastAutoAppliedTextRef = useRef<string>("");

  useEffect(() => {
    void fetchProjects();
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    if (!aiImportText.trim()) return;

    const trimmed = aiImportText.trim();

    if (trimmed === lastAutoAppliedTextRef.current) {
      return;
    }

    if (autoApplyTimeoutRef.current) {
      window.clearTimeout(autoApplyTimeoutRef.current);
    }

    autoApplyTimeoutRef.current = window.setTimeout(() => {
      try {
        const parsed = JSON.parse(trimmed);

        if (!validateAiUpdate(parsed)) {
          return;
        }

        lastAutoAppliedTextRef.current = trimmed;
        applyAiUpdate(trimmed, true);
      } catch {
        // Not valid JSON yet, do nothing.
      }
    }, 500);

    return () => {
      if (autoApplyTimeoutRef.current) {
        window.clearTimeout(autoApplyTimeoutRef.current);
      }
    };
  }, [aiImportText, selectedProject, targetPlatform]);

  const targetPlatformLabel =
    PLATFORM_CONFIG[targetPlatform]?.label || "ChatGPT";

  const exportPrompt = useMemo(() => {
    if (!selectedProject) return "";
    return buildExportPrompt(selectedProject, targetPlatform);
  }, [selectedProject, targetPlatform]);

  const deltaSummary = useMemo(() => {
    if (!selectedProject) return [];

    return buildDeltaSummary(
      getPlatformLastSeenSnapshot(selectedProject, targetPlatform),
      getLatestSnapshot(selectedProject),
    );
  }, [selectedProject, targetPlatform]);

  const fetchProjects = async () => {
    try {
      const result = await invoke<string[]>("load_projects");
      setProjects(result);
    } catch (error) {
      setMessage(`We couldn't load your projects: ${error}`);
    }
  };

  const createProject = async () => {
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
      await fetchProjects();
      setSelectedProject(project);
      setPage("editor");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(`We couldn't create that project: ${error}`);
    }
  };

  const openProject = async (fileName: string) => {
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
  };

  const deleteProject = async (fileName: string) => {
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
      await fetchProjects();

      if (wasCurrentProject) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (error) {
      setMessage(`We couldn't remove that project: ${error}`);
    }
  };

  const saveProject = async () => {
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
  };

  const handleImportButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportProject = async (event: ChangeEvent<HTMLInputElement>) => {
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
      await fetchProjects();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(`We couldn't open that saved project: ${error}`);
    } finally {
      event.target.value = "";
    }
  };

  const handleProjectUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || !selectedProject) return;

    try {
      const { updatedProject, detectedType } = await scanUploadedProjectFiles(
        selectedProject,
        files,
      );

      const now = new Date().toISOString();
      const newSnapshot = createSnapshot(updatedProject);
      const existingSnapshots = updatedProject.snapshots ?? [];
      const lastSnapshot = existingSnapshots[existingSnapshots.length - 1];

      const shouldAddSnapshot =
        !lastSnapshot || lastSnapshot.hash !== newSnapshot.hash;

      const finalUpdatedProject: ProjectMemory = {
        ...updatedProject,
        lastModified: now,
        snapshots: shouldAddSnapshot
          ? [...existingSnapshots, newSnapshot]
          : existingSnapshots,
      };

      await saveProjectData(finalUpdatedProject);
      setSelectedProject(finalUpdatedProject);
      setPage("editor");
      setMessage(
        `Project scanned and handoff rebuilt! We detected a ${detectedType} project, updated the project context, and it is now ready to copy into ${targetPlatformLabel}.`,
      );
      await fetchProjects();
      event.target.value = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(`We couldn't scan that project folder: ${error}`);
    }
  };

  const applyAiUpdate = (rawText: string, wasAutoDetected = false) => {
    if (!selectedProject || !rawText.trim()) {
      setMessage("Paste an AI update first.");
      return;
    }

    try {
      const parsed = JSON.parse(rawText);

      if (!validateAiUpdate(parsed)) {
        throw new Error("Invalid AI update format");
      }

      setPreAiBackupProject(selectedProject);
      const updated = mergeAiUpdateIntoProject(selectedProject, rawText);

      const addedGoals = Array.isArray(parsed.add_goals)
        ? parsed.add_goals.length
        : 0;
      const addedRules = Array.isArray(parsed.add_rules)
        ? parsed.add_rules.length
        : 0;
      const addedDecisions = Array.isArray(parsed.add_decisions)
        ? parsed.add_decisions.length
        : 0;
      const addedNextSteps = Array.isArray(parsed.add_nextSteps)
        ? parsed.add_nextSteps.length
        : 0;
      const addedOpenQuestions = Array.isArray(parsed.add_openQuestions)
        ? parsed.add_openQuestions.length
        : 0;

      const newSnapshot = createSnapshot(updated);
      const existingSnapshots = updated.snapshots ?? [];
      const lastSnapshot = existingSnapshots[existingSnapshots.length - 1];

      const snapshotUpdatedProject: ProjectMemory =
        !lastSnapshot || lastSnapshot.hash !== newSnapshot.hash
          ? {
              ...updated,
              snapshots: [...existingSnapshots, newSnapshot],
            }
          : updated;

      const finalUpdatedProject: ProjectMemory = {
        ...snapshotUpdatedProject,
        platformState: {
          ...(snapshotUpdatedProject.platformState ?? {}),
          [targetPlatform]: {
            lastSentSnapshotId:
              snapshotUpdatedProject.platformState?.[targetPlatform]
                ?.lastSentSnapshotId ?? "",
            lastReplyAt: new Date().toISOString(),
          },
        },
      };

      setSelectedProject(finalUpdatedProject);
      setAiImportText("");
      setMessage(
        wasAutoDetected
          ? `AI update detected and applied automatically! Goals: ${addedGoals}, Rules: ${addedRules}, Decisions: ${addedDecisions}, Next Steps: ${addedNextSteps}, Open Questions: ${addedOpenQuestions}.`
          : `Project updated from AI! Goals: ${addedGoals}, Rules: ${addedRules}, Decisions: ${addedDecisions}, Next Steps: ${addedNextSteps}, Open Questions: ${addedOpenQuestions}.`,
      );

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setMessage(
        "That update doesn't look right. Please paste a valid Project Brain AI update.",
      );
    }
  };

  const importAiUpdate = () => {
    applyAiUpdate(aiImportText, false);
  };

  const rollbackLastAiImport = () => {
    if (!preAiBackupProject) {
      setMessage("There isn't an AI update to undo.");
      return;
    }

    setSelectedProject(preAiBackupProject);
    setPreAiBackupProject(null);
    setMessage("Undone. The last AI update was rolled back.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCopyToClipboard = async () => {
    if (!selectedProject) return;

    try {
      await navigator.clipboard.writeText(exportPrompt);

      const snapshots = selectedProject.snapshots ?? [];
      const lastSnapshot = snapshots[snapshots.length - 1];

      if (lastSnapshot) {
        const updatedProject: ProjectMemory = {
          ...selectedProject,
          platformState: {
            ...(selectedProject.platformState ?? {}),
            [targetPlatform]: {
              lastSentSnapshotId: lastSnapshot.id,
              lastReplyAt:
                selectedProject.platformState?.[targetPlatform]?.lastReplyAt,
            },
          },
        };

        setSelectedProject(updatedProject);
      }

      setMessage(
        `Copied! Open ${targetPlatformLabel} and paste this in to continue your project.`,
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setMessage("We couldn't copy that text. Please try again.");
    }
  };

  return {
    page,
    setPage,
    targetPlatform,
    setTargetPlatform,
    targetPlatformLabel,
    projectName,
    setProjectName,
    message,
    setMessage,
    projects,
    selectedProject,
    setSelectedProject,
    aiImportText,
    setAiImportText,
    preAiBackupProject,
    fileInputRef,
    projectNameInputRef,
    exportPrompt,
    deltaSummary,

    fetchProjects,
    createProject,
    openProject,
    deleteProject,
    saveProject,
    handleImportButtonClick,
    handleImportProject,
    handleProjectUpload,
    importAiUpdate,
    rollbackLastAiImport,
    handleCopyToClipboard,
  };
}
