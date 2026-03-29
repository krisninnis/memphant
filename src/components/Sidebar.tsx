import { RefObject } from "react";
import ProjectList from "./ProjectList";

type Props = {
  page: "home" | "projects" | "editor";
  setPage: (p: "home" | "projects" | "editor") => void;
  projectName: string;
  setProjectName: (v: string) => void;
  createProject: () => void;
  projects: string[];
  openProject: (name: string) => void;
  deleteProject: (name: string) => void;
  projectNameInputRef: RefObject<HTMLInputElement | null>;
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
}: Props) {
  return (
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
          <input
            ref={projectNameInputRef}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                createProject();
              }
            }}
            placeholder="Type a new project name..."
            className="input"
          />

          <button onClick={createProject} className="button">
            + Create New Project
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
            openProject(name);
            setPage("editor");
          }}
          onDelete={deleteProject}
        />
      </div>
    </aside>
  );
}

export default Sidebar;
