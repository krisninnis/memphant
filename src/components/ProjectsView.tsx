import ProjectList from "./ProjectList";

type Props = {
  projects: string[];
  currentProjectName?: string | null;
  onOpenProject: (name: string) => void | Promise<void>;
  onDeleteProject: (name: string) => void | Promise<void>;
};

function ProjectsView({
  projects,
  currentProjectName,
  onOpenProject,
  onDeleteProject,
}: Props) {
  return (
    <div className="project-panel">
      <h2 className="panel-title">📂 My Projects</h2>

      <p className="meta-item editor-helper-text">
        Open a saved project to continue working, or remove one you no longer
        need.
      </p>

      {currentProjectName && (
        <p className="current-project-name">
          Currently open: <span>{currentProjectName}</span>
        </p>
      )}

      <ProjectList
        projects={projects}
        currentProjectName={currentProjectName ?? null}
        onOpen={onOpenProject}
        onDelete={onDeleteProject}
      />
    </div>
  );
}

export default ProjectsView;
