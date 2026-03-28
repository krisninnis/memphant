type Props = {
  projects: string[];
  onOpen: (name: string) => void;
  onDelete: (name: string) => void;
};

function ProjectList({ projects, onOpen, onDelete }: Props) {
  return (
    <ul className="project-list">
      {projects.map((project, index) => (
        <li key={index} className="project-list-item">
          <button onClick={() => onOpen(project)} className="project-button">
            {project}
          </button>

          <button
            onClick={() => onDelete(project)}
            className="project-delete-button"
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}

export default ProjectList;
