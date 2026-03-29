import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ProjectMemory } from "./types/project";
import { AIPlatform, PLATFORM_CONFIG } from "./config/aiPlatforms";
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
  const projectNameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

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
      const project = createProjectMemory(projectName);
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

      setSelectedProject(updatedProject);
      setMessage(
        `Project folder scanned! We found a ${detectedType} project and updated the important files list.`,
      );
      event.target.value = "";
    } catch (error) {
      setMessage(`We couldn't scan that project folder: ${error}`);
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

      setSelectedProject(updated);
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

  const targetPlatformLabel =
    PLATFORM_CONFIG[targetPlatform]?.label || "ChatGPT";

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(exportPrompt);
      setMessage(
        `Copied! Open ${targetPlatformLabel} and paste this in to continue your project.`,
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setMessage("We couldn't copy that text. Please try again.");
    }
  };

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
        projectNameInputRef={projectNameInputRef}
      />

      <main className="main-content">
        <h1 className="title">🧠 Project Brain</h1>

        <p className="message">{message}</p>

        {page === "home" && (
          <div className="project-panel">
            <h2 className="panel-title">👋 Welcome to Project Brain</h2>

            <p className="meta-item editor-helper-text">
              Keep your project details in one place, then use them with
              ChatGPT, Claude, Grok, or another AI without losing context.
            </p>

            <h3 className="section-title">Start here</h3>
            <ul className="info-list">
              <li>Create a new project from the left sidebar.</li>
              <li>Or open one of your saved projects.</li>
              <li>
                Then copy the project into your chosen AI and continue working.
              </li>
            </ul>

            <div className="input-row">
              <button className="button" onClick={() => setPage("projects")}>
                📂 Go to My Projects
              </button>

              <button
                className="button export-button"
                onClick={() => {
                  setPage("projects");

                  setTimeout(() => {
                    projectNameInputRef.current?.focus();
                  }, 100);
                }}
              >
                ➕ Create a New Project
              </button>
            </div>
          </div>
        )}

        {page === "projects" && (
          <div className="project-panel">
            <h2 className="panel-title">📂 My Projects</h2>

            <p className="meta-item editor-helper-text">
              Open a saved project to continue working, or remove one you no
              longer need.
            </p>

            {selectedProject && (
              <p className="current-project-name">
                Currently open: <span>{selectedProject.projectName}</span>
              </p>
            )}

            <ProjectList
              projects={projects}
              currentProjectName={selectedProject?.projectName ?? null}
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
            onCopyToClipboard={handleCopyToClipboard}
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
          <div className="project-panel">
            <h2 className="panel-title">✏️ Project Details</h2>
            <p className="meta-item editor-helper-text">
              You do not have a project open yet.
            </p>
            <ul className="info-list">
              <li>Create a new project from the left sidebar.</li>
              <li>Or open one of your saved projects.</li>
              <li>Then come back here to edit the project details.</li>
            </ul>
          </div>
        )}
      </main>

      <nav className="mobile-bottom-bar">
        <button
          className="mobile-bottom-button"
          onClick={() => setPage("home")}
        >
          Welcome
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
          Details
        </button>
      </nav>
    </div>
  );
}

export default App;
