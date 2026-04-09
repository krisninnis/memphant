import { useProjectStore } from '../../store/projectStore';
import { useActiveProject } from '../../hooks/useActiveProject';
import EditableField from './EditableField';
import EditableList from './EditableList';
import { DecisionList } from './DecisionCard';
import { generateSuggestions } from '../../utils/autoSuggest';

export function ProjectEditor() {
  const activeProject = useActiveProject();
  const updateProject = useProjectStore((s) => s.updateProject);
  const showToast = useProjectStore((s) => s.showToast);

  if (!activeProject) {
    return (
      <div className="project-editor project-editor--empty">
        <p>Select a project from the sidebar to get started.</p>
      </div>
    );
  }

  // Captured here so TypeScript knows it's non-null inside nested functions
  const project = activeProject;

  const update = (field: string, value: unknown) =>
    updateProject(project.id, { [field]: value } as Parameters<typeof updateProject>[1]);

  function handleSuggest(field: 'summary' | 'currentState' | 'goals') {
    const suggestions = generateSuggestions(project);
    const suggested = suggestions[field];

    if (field === 'goals') {
      const existing = project.goals ?? [];
      if (existing.length > 0) {
        // Append only new items
        const newItems = (suggested as string[]).filter((g) => !existing.includes(g));
        if (newItems.length === 0) {
          showToast('Goals already look complete — edit them manually if needed.');
          return;
        }
        update('goals', [...existing, ...newItems]);
        showToast(`Added ${newItems.length} suggested goal${newItems.length !== 1 ? 's' : ''}.`);
      } else {
        update('goals', suggested);
        showToast('Goals auto-filled — edit them to match your project.');
      }
    } else {
      if ((project[field] as string)?.trim()) {
        // Field already has content — confirm before overwriting
        update(field, suggested);
        showToast('Auto-filled — edit it to make it your own.');
      } else {
        update(field, suggested);
        showToast('Auto-filled — edit it to make it your own.');
      }
    }
  }

  return (
    <div className="project-editor" data-tour="editor">
      {/* Project name */}
      <div className="field-group" data-tour="editor-name">
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
        onSuggest={() => handleSuggest('summary')}
        suggestLabel={activeProject.summary?.trim() ? 'Regenerate' : 'Auto-fill'}
      />

      {/* Current State */}
      <EditableField
        label="What this project is about"
        value={activeProject.currentState}
        onChange={(v) => update('currentState', v)}
        multiline
        placeholder="Describe what's been built and what still needs doing."
        onSuggest={() => handleSuggest('currentState')}
        suggestLabel={activeProject.currentState?.trim() ? 'Regenerate' : 'Auto-fill'}
      />

      {/* Goals */}
      <EditableList
        label="Goals"
        items={activeProject.goals}
        onChange={(v) => update('goals', v)}
        placeholder="Add a goal…"
        onSuggest={() => handleSuggest('goals')}
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
