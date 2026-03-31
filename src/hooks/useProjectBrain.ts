import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { AIPlatform, PLATFORM_CONFIG } from "../config/aiPlatforms";
import { ProjectMemory } from "../types/project";
import {
  buildDeltaSummary,
  createSnapshot,
  getLatestSnapshot,
  getPlatformLastSeenSnapshot,
  sanitizeForAiExport,
} from "../utils/projectUtils";
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
import { buildProjectFromScan } from "../utils/scanProjectContext";

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

  useEffect(() => {
    void fetchProjects();
  }, []);

  const targetPlatformLabel =
    PLATFORM_CONFIG[targetPlatform]?.label || "ChatGPT";

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

  const createProjectFromFolder = async () => {
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

      const baseProject = createProjectMemory(folderName);
      const files = await invoke<string[]>("scan_project_folder", {
        folderPath: selected,
      });

      const updatedProject = buildProjectFromScan({
        selectedProject: baseProject,
        folderPath: selected,
        files,
      });

      await saveProjectData(updatedProject);
      await fetchProjects();

      setSelectedProject(updatedProject);
      setPage("editor");
      setProjectName("");
      setMessage(
        `Project created from folder successfully. ${
          updatedProject.linkedProjectName || updatedProject.projectName
        } is now linked and ready to rescan anytime.`,
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      setMessage("We couldn't create a project from that folder.");
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

  const handleProjectFolderPick = async () => {
    if (!selectedProject) return;

    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (!selected || typeof selected !== "string") {
      return;
    }

    try {
      const files = await invoke<string[]>("scan_project_folder", {
        folderPath: selected,
      });

      const updatedProject = buildProjectFromScan({
        selectedProject,
        folderPath: selected,
        files,
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
  };

  // UPDATED: uses rescan_linked_folder command + checks linkedFolder first
  const handleRescanLinkedProject = async () => {
    if (!selectedProject) return;

    // Prefer linkedFolder.path (new), fall back to linkedProjectPath (legacy)
    const folderPath =
      selectedProject.linkedFolder?.path ?? selectedProject.linkedProjectPath;

    if (!folderPath) {
      setMessage(
        "This project is not linked to a folder yet. Please choose a folder first.",
      );
      return;
    }

    try {
      const result = await invoke<{
        files: string[];
        scan_hash: string;
        folder_exists: boolean;
      }>("rescan_linked_folder", { folderPath });

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
      });

      const updatedProject: ProjectMemory = {
        ...rescannedProject,
        changelog: [
          ...selectedProject.changelog,
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
  };

  const importAiUpdate = () => {
    if (!selectedProject || !aiImportText.trim()) {
      setMessage("Paste an AI update first.");
      return;
    }

    try {
      const parsed = JSON.parse(aiImportText);

      if (!validateAiUpdate(parsed)) {
        throw new Error("Invalid AI update format");
      }

      setPreAiBackupProject(selectedProject);
      const updated = mergeAiUpdateIntoProject(selectedProject, aiImportText);

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

      const snapshotUpdatedProject =
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
        `Project updated from AI! Goals: ${addedGoals}, Rules: ${addedRules}, Decisions: ${addedDecisions}, Next Steps: ${addedNextSteps}, Open Questions: ${addedOpenQuestions}.`,
      );

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setMessage(
        "That update doesn't look right. Please paste a valid Project Brain AI update.",
      );
    }
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

  const exportPrompt = useMemo(() => {
    if (!selectedProject) return "";

    const safeProject = sanitizeForAiExport(selectedProject);
    const projectJson = JSON.stringify(safeProject, null, 2);
    const recentChangelog = safeProject.changelog.slice(-5);

    const latestSnapshot = getLatestSnapshot(selectedProject);
    const platformLastSeenSnapshot = getPlatformLastSeenSnapshot(
      selectedProject,
      targetPlatform,
    );
    const deltaSummary = buildDeltaSummary(
      platformLastSeenSnapshot,
      latestSnapshot,
    );

    const handoffSummary = `
Project name: ${safeProject.projectName}
Summary: ${safeProject.summary || "No summary yet"}
Current state: ${safeProject.currentState || "No current state yet"}

Top goals:
${
  safeProject.goals.length > 0
    ? safeProject.goals.map((goal) => `- ${goal}`).join("\n")
    : "- None yet"
}

Next steps:
${
  safeProject.nextSteps.length > 0
    ? safeProject.nextSteps.map((step) => `- ${step}`).join("\n")
    : "- None yet"
}

Open questions:
${
  safeProject.openQuestions.length > 0
    ? safeProject.openQuestions.map((question) => `- ${question}`).join("\n")
    : "- None yet"
}

Recent changelog:
${
  recentChangelog.length > 0
    ? recentChangelog
        .map(
          (entry) => `- [${entry.date}] (${entry.source}) ${entry.description}`,
        )
        .join("\n")
    : "- No recent changelog"
}

Since ${targetPlatformLabel} last saw this project:
${
  deltaSummary.length > 0
    ? deltaSummary.map((item) => `- ${item}`).join("\n")
    : "- No changes detected"
}
`.trim();

    const baseInstructions = `You are continuing an existing project from another AI platform.

Your job:
- Continue from the current project state
- Respect prior decisions, rules, and goals
- Do not reset or reinterpret the project from scratch
- Do not ask for hidden files, secrets, tokens, passwords, or .env contents
- If anything sensitive is redacted, do not try to reconstruct it

When you respond, return ONLY valid JSON in this format:

{
  "updateFrom": "${targetPlatform}",
  "timestamp": "ISO_DATE",
  "summary": "...optional updated summary...",
  "currentState": "...optional updated current state...",
  "add_goals": [],
  "add_rules": [],
  "add_decisions": [],
  "add_nextSteps": [],
  "add_openQuestions": []
}

Handoff Summary:
${handoffSummary}

Project Brain Memory:
${projectJson}`;

    if (targetPlatform === "chatgpt") {
      return `${baseInstructions}

Extra guidance for ChatGPT:
- Be structured and explicit
- Prefer concise but useful updates
- Keep output strict JSON only`;
    }

    if (targetPlatform === "claude") {
      return `${baseInstructions}

Extra guidance for Claude:
- Preserve continuity carefully
- Pay attention to prior reasoning and changelog
- Keep output strict JSON only`;
    }

    if (targetPlatform === "grok") {
      return `${baseInstructions}

Extra guidance for Grok:
- Stay focused on project continuity
- Do not add commentary outside the JSON
- Keep output strict JSON only`;
    }

    if (targetPlatform === "cursor" || targetPlatform === "copilot") {
      return `${baseInstructions}

Extra guidance for coding assistants:
- Focus on implementation progress
- Prefer practical next steps and code-related updates
- Keep output strict JSON only`;
    }

    return `${baseInstructions}

Extra guidance:
- Continue the project faithfully
- Keep output strict JSON only`;
  }, [selectedProject, targetPlatform, targetPlatformLabel]);

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

  const deltaSummary = useMemo(() => {
    if (!selectedProject) return [];
    return buildDeltaSummary(
      getPlatformLastSeenSnapshot(selectedProject, targetPlatform),
      getLatestSnapshot(selectedProject),
    );
  }, [selectedProject, targetPlatform]);

  return {
    page,
    setPage,
    targetPlatform,
    setTargetPlatform,
    projectName,
    setProjectName,
    message,
    setMessage,
    projects,
    selectedProject,
    setSelectedProject,
    aiImportText,
    setAiImportText,
    fileInputRef,
    projectNameInputRef,
    exportPrompt,
    deltaSummary,
    createProject,
    createProjectFromFolder,
    openProject,
    deleteProject,
    saveProject,
    handleImportButtonClick,
    handleImportProject,
    handleProjectFolderPick,
    handleRescanLinkedProject,
    importAiUpdate,
    rollbackLastAiImport,
    handleCopyToClipboard,
  };
}
