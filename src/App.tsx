import ProjectList from "./components/ProjectList";
import ProjectEditor from "./components/ProjectEditor";
import Sidebar from "./components/Sidebar";
import { useProjectBrain } from "./hooks/useProjectBrain";
import "./App.css";
import "./styles/modal.css";

function App() {
  const {
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
  } = useProjectBrain();

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
        onImportProject={handleImportProject}
        onOpenImportDialog={() =>
          setMessage("Choose a saved Project Brain file to import.")
        }
        onUseExistingFolder={createProjectFromFolder}
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
            deltaSummary={deltaSummary}
            targetPlatform={targetPlatform}
            onTargetPlatformChange={setTargetPlatform}
            onSaveProject={saveProject}
            onRollbackLastAiImport={rollbackLastAiImport}
            onCopyToClipboard={handleCopyToClipboard}
            onUpdateSummary={(v) =>
              setSelectedProject({
                ...selectedProject,
                summary: v,
                autoFillState: {
                  ...selectedProject.autoFillState,
                  summary: "user",
                },
              })
            }
            onUpdateCurrentState={(v) =>
              setSelectedProject({
                ...selectedProject,
                currentState: v,
                autoFillState: {
                  ...selectedProject.autoFillState,
                  currentState: "user",
                },
              })
            }
            onAiImportTextChange={setAiImportText}
            onImportAiUpdate={importAiUpdate}
            onUploadJsonClick={handleImportButtonClick}
            onImportProject={handleImportProject}
            onHandleProjectFolderPick={handleProjectFolderPick}
            onRescanLinkedProject={handleRescanLinkedProject}
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
