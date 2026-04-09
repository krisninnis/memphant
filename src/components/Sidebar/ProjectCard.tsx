import type { ProjectMemory } from '../../types/project-brain-types';

interface ProjectCardProps {
  project: ProjectMemory;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function getSummaryText(summary?: string): string {
  if (!summary?.trim()) {
    return 'No summary yet';
  }

  const trimmed = summary.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
}

export function ProjectCard({
  project,
  isActive,
  onSelect,
  onDelete,
}: ProjectCardProps) {
  return (
    <div className={`project-card${isActive ? ' project-card--active' : ''}`}>
      <button type="button" className="project-card__body" onClick={onSelect}>
        <span className="project-card__name">{project.name}</span>
        <span className="project-card__summary">{getSummaryText(project.summary)}</span>
      </button>

      <button
        type="button"
        className="project-card__delete"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        aria-label={`Remove ${project.name}`}
        title="Remove project"
      >
        ×
      </button>
    </div>
  );
}

export default ProjectCard;
