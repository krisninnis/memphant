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
}: Props) {
  return (
    <aside className="sidebar">
      <h1 className="sidebar-title">🧠 Project Brain</h1>

      <div className="sidebar-section">
        <div className="sidebar-label">Navigation</div>

        <button
          className={`nav-pill ${page === "home" ? "active" : ""}`}
          onClick={() => setPage("home")}
        >
          🏠 Home
        </button>

        <button
          className={`nav-pill ${page === "projects" ? "active" : ""}`}
          onClick={() => setPage("projects")}
        >
          📂 Projects
        </button>

        <button
          className={`nav-pill ${page === "editor" ? "active" : ""}`}
          onClick={() => setPage("editor")}
        >
          ✏️ Editor
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Create</div>

        <input
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Project name..."
          className="input"
        />

        <button onClick={createProject} className="button">
          Create Project
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Projects</div>

        <ProjectList
          projects={projects}
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
