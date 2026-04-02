import type { ProjectMemory } from '../../types/project-brain-types';

interface ProjectCardProps {
  project: ProjectMemory;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function ProjectCard({ project, isActive, onSelect, onDelete }: ProjectCardProps) {
  return (
    <div className={`project-card ${isActive ? 'project-card--active' : ''}`}>
      <button className="project-card__body" onClick={onSelect}>
        <span className="project-card__name">{project.name}</span>
        <span className="project-card__summary">
          {project.summary
            ? project.summary.slice(0, 60) + (project.summary.length > 60 ? '\u2026' : '')
            : 'No summary yet'}
        </span>
      </button>
      <button
        className="project-card__delete"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title={`Remove ${project.name}`}
      >
        \u00D7
      </button>
    </div>
  );
}

export default ProjectCard;
