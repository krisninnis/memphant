import "./App.css";
import EmptyEditorView from "./components/EmptyEditorView";
import HomeView from "./components/HomeView";
import ProjectEditor from "./components/ProjectEditor";
import ProjectsView from "./components/ProjectsView";
import Sidebar from "./components/Sidebar";
import { useProjectBrain } from "./hooks/useProjectBrain";

function App() {
  const brain = useProjectBrain();

  return (
    <div className="app-shell">
      <Sidebar
        page={brain.page}
        setPage={brain.setPage}
        projectName={brain.projectName}
        setProjectName={brain.setProjectName}
        createProject={brain.createProject}
        projects={brain.projects}
        openProject={brain.openProject}
        deleteProject={brain.deleteProject}
        projectNameInputRef={brain.projectNameInputRef}
      />

      <main className="main-content">
        <h1 className="title">🧠 Project Brain</h1>

        <p className="message">{brain.message}</p>

        {brain.page === "home" && (
          <HomeView
            onGoToProjects={() => brain.setPage("projects")}
            onCreateNewProject={() => {
              brain.setPage("projects");

              setTimeout(() => {
                brain.projectNameInputRef.current?.focus();
              }, 100);
            }}
          />
        )}

        {brain.page === "projects" && (
          <ProjectsView
            projects={brain.projects}
            currentProjectName={brain.selectedProject?.projectName ?? null}
            onOpenProject={(name) => {
              void brain.openProject(name);
              brain.setPage("editor");
            }}
            onDeleteProject={(name) => {
              void brain.deleteProject(name);
            }}
          />
        )}

        {brain.page === "editor" && brain.selectedProject && (
          <ProjectEditor
            selectedProject={brain.selectedProject}
            aiImportText={brain.aiImportText}
            exportPrompt={brain.exportPrompt}
            deltaSummary={brain.deltaSummary}
            targetPlatform={brain.targetPlatform}
            onTargetPlatformChange={brain.setTargetPlatform}
            onSaveProject={() => {
              void brain.saveProject();
            }}
            onRollbackLastAiImport={brain.rollbackLastAiImport}
            onCopyToClipboard={() => {
              void brain.handleCopyToClipboard();
            }}
            onUpdateSummary={(value) => {
              if (!brain.selectedProject) return;

              brain.setSelectedProject({
                ...brain.selectedProject,
                summary: value,
              });
            }}
            onUpdateCurrentState={(value) => {
              if (!brain.selectedProject) return;

              brain.setSelectedProject({
                ...brain.selectedProject,
                currentState: value,
              });
            }}
            onAiImportTextChange={brain.setAiImportText}
            onImportAiUpdate={brain.importAiUpdate}
            onUploadJsonClick={brain.handleImportButtonClick}
            onImportProject={(event) => {
              void brain.handleImportProject(event);
            }}
            onProjectFolderUpload={(event) => {
              void brain.handleProjectUpload(event);
            }}
            fileInputRef={brain.fileInputRef}
          />
        )}

        {brain.page === "editor" && !brain.selectedProject && (
          <EmptyEditorView />
        )}
      </main>

      <nav className="mobile-bottom-bar">
        <button
          className="mobile-bottom-button"
          onClick={() => brain.setPage("home")}
        >
          Welcome
        </button>
        <button
          className="mobile-bottom-button"
          onClick={() => brain.setPage("projects")}
        >
          Projects
        </button>
        <button
          className="mobile-bottom-button"
          onClick={() => brain.setPage("editor")}
        >
          Details
        </button>
      </nav>
    </div>
  );
}

export default App;
