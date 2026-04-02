import { useProjectStore } from '../../store/projectStore';
import EditableField from './EditableField';
import EditableList from './EditableList';
import { DecisionList } from './DecisionCard';

export function ProjectEditor() {
  const activeProject = useProjectStore((s) => s.activeProject());
  const updateProject = useProjectStore((s) => s.updateProject);

  if (!activeProject) {
    return (
      <div className="project-editor project-editor--empty">
        <p>Select a project from the sidebar to get started.</p>
      </div>
    );
  }

  const update = (field: string, value: unknown) =>
    updateProject(activeProject.id, { [field]: value } as Parameters<typeof updateProject>[1]);

  return (
    <div className="project-editor">
      {/* Project name */}
      <div className="field-group">
        <div className="field-label">Project Name</div>
        <input
          className="field-input project-name-input"
          type="text"
          value={activeProject.name}
          onChange={(e) => update('name', e.target.value)}
        />
      </div>

      {/* Summary */}
      <EditableField
        label="Summary"
        value={activeProject.summary}
        onChange={(v) => update('summary', v)}
        multiline
        placeholder="Write a simple explanation so any AI can quickly understand this project."
      />

      {/* Current State */}
      <EditableField
        label="What this project is about"
        value={activeProject.currentState}
        onChange={(v) => update('currentState', v)}
        multiline
        placeholder="Describe what's been built and what still needs doing."
      />

      {/* Goals */}
      <EditableList
        label="Goals"
        items={activeProject.goals}
        onChange={(v) => update('goals', v)}
        placeholder="Add a goal…"
      />

      {/* Rules */}
      <EditableList
        label="Rules"
        items={activeProject.rules}
        onChange={(v) => update('rules', v)}
        placeholder="Add a rule…"
      />

      {/* Key Decisions */}
      <DecisionList
        decisions={activeProject.decisions}
        onChange={(v) => update('decisions', v)}
      />

      {/* Next Steps */}
      <EditableList
        label="Next Steps"
        items={activeProject.nextSteps}
        onChange={(v) => update('nextSteps', v)}
        placeholder="Add a next step…"
      />

      {/* Open Questions */}
      <EditableList
        label="Open Questions"
        items={activeProject.openQuestions}
        onChange={(v) => update('openQuestions', v)}
        placeholder="Add a question…"
      />

      {/* Important Assets */}
      <EditableList
        label="Important Files & Assets"
        items={activeProject.importantAssets}
        onChange={(v) => update('importantAssets', v)}
        placeholder="Add a file or asset path…"
      />

      {/* AI Instructions */}
      <EditableField
        label="How the AI should help"
        value={activeProject.aiInstructions || ''}
        onChange={(v) => update('aiInstructions', v)}
        multiline
        placeholder="Any specific instructions for how AIs should work on this project."
      />
    </div>
  );
}

export default ProjectEditor;
