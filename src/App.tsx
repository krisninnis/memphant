import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ProjectMemory } from "./types/project";
import { AIPlatform } from "./config/aiPlatforms";
import { sanitizeForAiExport } from "./utils/projectUtils";
import ProjectList from "./components/ProjectList";
import ProjectEditor from "./components/ProjectEditor";
import Sidebar from "./components/Sidebar";
import {
  createProjectMemory,
  importProjectFileData,
  loadProjectData,
  saveProjectData,
} from "./services/projectService";
import {
  mergeAiUpdateIntoProject,
  validateAiUpdate,
} from "./services/aiUpdateService";
import { scanUploadedProjectFiles } from "./services/projectScanService";
import "./App.css";

function App() {
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

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const result = await invoke<string[]>("load_projects");
      setProjects(result);
    } catch (error) {
      setMessage(`Failed to load projects: ${error}`);
    }
  };

  const createProject = async () => {
    if (!projectName.trim()) {
      setMessage("Please enter a project name");
      return;
    }

    try {
      const project = createProjectMemory(projectName);
      await saveProjectData(project);

      setProjectName("");
      setMessage(`Project "${project.projectName}" created ✅`);
      fetchProjects();
      setPage("projects");
    } catch (error) {
      setMessage(`Error: ${error}`);
    }
  };

  const openProject = async (fileName: string) => {
    try {
      const project = await loadProjectData(fileName);
      setSelectedProject(project);
      setMessage(`Opened ${fileName}`);
    } catch (error) {
      setMessage(`Failed to open project: ${error}`);
    }
  };

  const deleteProject = async (fileName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${fileName}"? This cannot be undone.`,
    );

    if (!confirmed) return;

    try {
      await invoke("delete_project_file", { fileName });

      if (
        selectedProject &&
        `${selectedProject.projectName.replace(/ /g, "_")}.json` === fileName
      ) {
        setSelectedProject(null);
        setPage("projects");
      }

      setMessage(`Deleted ${fileName} ✅`);
      fetchProjects();
    } catch (error) {
      setMessage(`Delete failed: ${error}`);
    }
  };

  const saveProject = async () => {
    if (!selectedProject) return;

    const now = new Date().toISOString();

    const updated = {
      ...selectedProject,
      lastModified: now,
      changelog: [
        ...selectedProject.changelog,
        {
          date: now,
          source: "app",
          description: "Project updated",
        },
      ],
    };

    try {
      await saveProjectData(updated);
      setSelectedProject(updated);
      setPreAiBackupProject(null);
      setMessage("Project saved successfully ✅");
    } catch (error) {
      setMessage(`Save failed: ${error}`);
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
      setMessage(`Imported and opened "${file.name}" ✅`);
      fetchProjects();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(`Import failed: ${error}`);
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

      setSelectedProject(updatedProject);
      setMessage(`Project analysed as: ${detectedType} ✅`);
      event.target.value = "";
    } catch (error) {
      setMessage(`Project scan failed: ${error}`);
    }
  };

  const importAiUpdate = () => {
    if (!selectedProject || !aiImportText.trim()) {
      setMessage("Paste an AI update first");
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

      setSelectedProject(updated);
      setAiImportText("");
      setMessage(
        `AI update applied ✅ Goals: ${addedGoals}, Rules: ${addedRules}, Decisions: ${addedDecisions}, Next Steps: ${addedNextSteps}, Open Questions: ${addedOpenQuestions}`,
      );

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setMessage("Invalid AI JSON ❌");
    }
  };

  const rollbackLastAiImport = () => {
    if (!preAiBackupProject) {
      setMessage("No AI import backup available");
      return;
    }

    setSelectedProject(preAiBackupProject);
    setPreAiBackupProject(null);
    setMessage("Rolled back last AI import ✅");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const exportPrompt = useMemo(() => {
    if (!selectedProject) return "";

    const safeProject = sanitizeForAiExport(selectedProject);
    const projectJson = JSON.stringify(safeProject, null, 2);
    const recentChangelog = safeProject.changelog.slice(-5);

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
  }, [selectedProject, targetPlatform]);

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        setPage={setPage}
        projectName={projectName}
        setProjectName={setProjectName}
        createProject={createProject}
        projects={projects}
        openProject={openProject}
        deleteProject={deleteProject}
      />

      <main className="main-content">
        <h1 className="title">🧠 Project Brain</h1>

        <p className="message">{message}</p>

        {page === "home" && (
          <div className="nav-pill">
            👋 Welcome to Project Brain
            <br />
            Create or open a project to begin.
          </div>
        )}

        {page === "projects" && (
          <div>
            <h2 className="section-heading">📂 Projects</h2>
            <ProjectList
              projects={projects}
              onOpen={(name) => {
                openProject(name);
                setPage("editor");
              }}
              onDelete={deleteProject}
            />
          </div>
        )}

        {page === "editor" && selectedProject && (
          <ProjectEditor
            selectedProject={selectedProject}
            aiImportText={aiImportText}
            exportPrompt={exportPrompt}
            targetPlatform={targetPlatform}
            onTargetPlatformChange={setTargetPlatform}
            onSaveProject={saveProject}
            onRollbackLastAiImport={rollbackLastAiImport}
            onCopyToClipboard={() =>
              navigator.clipboard.writeText(exportPrompt)
            }
            onUpdateSummary={(v) =>
              setSelectedProject({ ...selectedProject, summary: v })
            }
            onUpdateCurrentState={(v) =>
              setSelectedProject({
                ...selectedProject,
                currentState: v,
              })
            }
            onAiImportTextChange={setAiImportText}
            onImportAiUpdate={importAiUpdate}
            onUploadJsonClick={handleImportButtonClick}
            onImportProject={handleImportProject}
            onProjectFolderUpload={handleProjectUpload}
            fileInputRef={fileInputRef}
          />
        )}

        {page === "editor" && !selectedProject && (
          <div className="nav-pill">
            Open a project from the sidebar to start editing.
          </div>
        )}
      </main>

      <nav className="mobile-bottom-bar">
        <button
          className="mobile-bottom-button"
          onClick={() => setPage("home")}
        >
          Home
        </button>
        <button
          className="mobile-bottom-button"
          onClick={() => setPage("projects")}
        >
          Projects
        </button>
        <button
          className="mobile-bottom-button"
          onClick={() => setPage("editor")}
        >
          Editor
        </button>
      </nav>
    </div>
  );
}

export default App;
