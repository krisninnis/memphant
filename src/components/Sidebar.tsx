import { RefObject, useRef, useState } from "react";
import ProjectList from "./ProjectList";
import NewProjectModal from "./NewProjectModal";

type Props = {
  page: "home" | "projects" | "editor";
  setPage: (p: "home" | "projects" | "editor") => void;
  projectName: string;
  setProjectName: (v: string) => void;
  createProject: () => void | Promise<void>;
  projects: string[];
  openProject: (name: string) => void | Promise<void>;
  deleteProject: (name: string) => void | Promise<void>;
  projectNameInputRef: RefObject<HTMLInputElement | null>;
  onImportProject: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenImportDialog: () => void;
  onUseExistingFolder: () => void | Promise<void>;
};

function Sidebar({
  page,
  setPage,
  projectName,
  setProjectName,
  createProject,
  projects,
  openProject,
  deleteProject,
  projectNameInputRef,
  onImportProject,
  onOpenImportDialog,
  onUseExistingFolder,
}: Props) {
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const hiddenImportRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <aside className="sidebar">
        <h1 className="sidebar-title">🧠 Project Brain</h1>

        <p
          className="meta-item"
          style={{ marginTop: "8px", marginBottom: "20px" }}
        >
          Keep your project in one place, then carry it across AI tools without
          losing context.
        </p>

        <div className="sidebar-section">
          <div className="sidebar-label">Start Here</div>

          <button
            className={`nav-pill ${page === "home" ? "active" : ""}`}
            onClick={() => setPage("home")}
          >
            🏠 Welcome
          </button>

          <button
            className={`nav-pill ${page === "projects" ? "active" : ""}`}
            onClick={() => setPage("projects")}
          >
            📂 My Projects
          </button>

          {projects.length > 0 && (
            <button
              className={`nav-pill ${page === "editor" ? "active" : ""}`}
              onClick={() => setPage("editor")}
            >
              ✏️ Project Details
            </button>
          )}
        </div>

        <div className="sidebar-section create-box">
          <div className="sidebar-label">Create a New Project</div>

          <div className="create-project-group">
            <button
              onClick={() => setShowNewProjectModal(true)}
              className="button export-button"
            >
              + New Project
            </button>
          </div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">My Projects</div>

          <p className="meta-item" style={{ marginBottom: "10px" }}>
            Open an existing project or delete one you no longer need.
          </p>

          <ProjectList
            projects={projects}
            currentProjectName={null}
            onOpen={(name) => {
              void openProject(name);
              setPage("editor");
            }}
            onDelete={(name) => {
              void deleteProject(name);
            }}
          />
        </div>

        <input
          ref={hiddenImportRef}
          type="file"
          accept=".json"
          onChange={onImportProject}
          style={{ display: "none" }}
        />
      </aside>

      <NewProjectModal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        projectName={projectName}
        setProjectName={setProjectName}
        createProject={async () => {
          if (!projectName.trim()) {
            return;
          }

          await createProject();
          setShowNewProjectModal(false);
        }}
        openSavedProject={() => {
          hiddenImportRef.current?.click();
          onOpenImportDialog();
          setShowNewProjectModal(false);
        }}
        scanProjectFolder={() => {
          void onUseExistingFolder();
          setShowNewProjectModal(false);
        }}
        projectNameInputRef={projectNameInputRef}
      />
    </>
  );
}

export default Sidebar;
