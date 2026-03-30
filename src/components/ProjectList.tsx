type Props = {
  projects: string[];
  onOpen: (name: string) => void | Promise<void>;
  onDelete: (name: string) => void | Promise<void>;
  currentProjectName?: string | null;
};

function ProjectList({
  projects,
  onOpen,
  onDelete,
  currentProjectName,
}: Props) {
  if (projects.length === 0) {
    return (
      <p className="meta-item">
        No projects yet. Create one above to get started.
      </p>
    );
  }

  const normalizedCurrent = currentProjectName
    ? `${currentProjectName.replace(/ /g, "_")}.json`
    : null;

  return (
    <ul className="project-list">
      {projects.map((project) => {
        const isCurrent = normalizedCurrent === project;

        return (
          <li
            key={project}
            className={`project-list-item ${
              isCurrent ? "project-list-item-active" : ""
            }`}
          >
            <button
              onClick={() => {
                void onOpen(project);
              }}
              className={`project-button ${
                isCurrent ? "project-button-active" : ""
              }`}
            >
              {isCurrent ? "✅ " : "📂 "}
              {project}
            </button>

            <button
              onClick={() => {
                const confirmDelete = window.confirm(
                  `Are you sure you want to delete "${project}"? This can't be undone.`,
                );

                if (confirmDelete) {
                  void onDelete(project);
                }
              }}
              className="project-delete-button"
            >
              🗑 Remove
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default ProjectList;
