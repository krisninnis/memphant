import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AIPlatform, PLATFORM_CONFIG } from "../config/aiPlatforms";
import { ProjectMemory } from "../types/project";
import {
  buildDeltaSummary,
  getLatestSnapshot,
  getPlatformLastSeenSnapshot,
  sanitizeForAiExport,
} from "../utils/projectUtils";
import {
  createProjectOperation,
  deleteProjectOperation,
  fetchProjects,
  openProjectOperation,
  saveProjectOperation,
} from "./project-brain/projectOperations";
import {
  createProjectFromFolderOperation,
  handleImportProjectOperation,
  handleProjectFolderPickOperation,
  handleRescanLinkedProjectOperation,
} from "./project-brain/scanOperations";
import {
  importAiUpdateOperation,
  rollbackLastAiImportOperation,
} from "./project-brain/aiOperations";
import { handleCopyToClipboardOperation } from "./project-brain/exportOperations";

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
    void fetchProjects(setProjects, setMessage);
  }, []);

  const targetPlatformLabel =
    PLATFORM_CONFIG[targetPlatform]?.label || "ChatGPT";

  const createProject = async () => {
    await createProjectOperation({
      projectName,
      setProjectName,
      setMessage,
      setProjects,
      setSelectedProject,
      setPage,
      setAiImportText,
      setPreAiBackupProject,
    });
  };

  const createProjectFromFolder = async () => {
    await createProjectFromFolderOperation({
      setProjects,
      setProjectName,
      setMessage,
      setSelectedProject,
      setPage,
      setAiImportText,
      setPreAiBackupProject,
    });
  };

  const openProject = async (fileName: string) => {
    await openProjectOperation({
      fileName,
      setSelectedProject,
      setMessage,
    });
  };

  const deleteProject = async (fileName: string) => {
    await deleteProjectOperation({
      fileName,
      selectedProject,
      setSelectedProject,
      setPage,
      setMessage,
      setProjects,
    });
  };

  const saveProject = async () => {
    await saveProjectOperation({
      selectedProject,
      setSelectedProject,
      setPreAiBackupProject,
      setMessage,
    });
  };

  const handleImportButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportProject = async (event: ChangeEvent<HTMLInputElement>) => {
    await handleImportProjectOperation({
      event,
      setSelectedProject,
      setPage,
      setMessage,
      setProjects,
    });
  };

  const handleProjectFolderPick = async () => {
    await handleProjectFolderPickOperation({
      selectedProject,
      setSelectedProject,
      setMessage,
    });
  };

  const handleRescanLinkedProject = async () => {
    await handleRescanLinkedProjectOperation({
      selectedProject,
      setSelectedProject,
      setMessage,
    });
  };

  const importAiUpdate = async () => {
    await importAiUpdateOperation({
      selectedProject,
      aiImportText,
      targetPlatform,
      setSelectedProject,
      setAiImportText,
      setPreAiBackupProject,
      setMessage,
    });
  };

  const rollbackLastAiImport = () => {
    rollbackLastAiImportOperation({
      preAiBackupProject,
      setSelectedProject,
      setPreAiBackupProject,
      setMessage,
    });
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
    await handleCopyToClipboardOperation({
      selectedProject,
      exportPrompt,
      targetPlatform,
      targetPlatformLabel,
      setSelectedProject,
      setMessage,
    });
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
