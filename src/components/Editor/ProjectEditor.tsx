import { useProjectStore } from '../../store/projectStore';
import EditableField from './EditableField';

export function ProjectEditor() {
  const activeProject = useProjectStore((s) => s.activeProject());
  const updateProject = useProjectStore((s) => s.updateProject);

  if (!activeProject) {
    return (
      <div className="project-editor project-editor--empty">
        <h2>No project selected</h2>
        <p>Select a project from the sidebar, or create a new one.</p>
      </div>
    );
  }

  return (
    <div className="project-editor">
      <h2 className="project-editor__title">{activeProject.name}</h2>

      <EditableField
        label="What this project is about"
        value={activeProject.summary}
        onChange={(value) => updateProject(activeProject.id, { summary: value })}
        multiline
        placeholder="Write a simple explanation so any AI can quickly understand this project."
      />

      <EditableField
        label="Where things stand right now"
        value={activeProject.currentState}
        onChange={(value) => updateProject(activeProject.id, { currentState: value })}
        multiline
        placeholder="Describe what's been built and what still needs doing."
      />

      <EditableField
        label="Goals"
        value={activeProject.goals.join('\n')}
        onChange={(value) =>
          updateProject(activeProject.id, {
            goals: value.split('\n').filter((l) => l.trim()),
          })
        }
        multiline
        placeholder="One goal per line."
      />

      <EditableField
        label="Rules"
        value={activeProject.rules.join('\n')}
        onChange={(value) =>
          updateProject(activeProject.id, {
            rules: value.split('\n').filter((l) => l.trim()),
          })
        }
        multiline
        placeholder="One rule per line."
      />

      <EditableField
        label="Next Steps"
        value={activeProject.nextSteps.join('\n')}
        onChange={(value) =>
          updateProject(activeProject.id, {
            nextSteps: value.split('\n').filter((l) => l.trim()),
          })
        }
        multiline
        placeholder="One step per line."
      />

      <EditableField
        label="Open Questions"
        value={activeProject.openQuestions.join('\n')}
        onChange={(value) =>
          updateProject(activeProject.id, {
            openQuestions: value.split('\n').filter((l) => l.trim()),
          })
        }
        multiline
        placeholder="One question per line."
      />
    </div>
  );
}

export default ProjectEditor;
