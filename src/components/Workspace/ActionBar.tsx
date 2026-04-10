import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useActiveProject } from '../../hooks/useActiveProject';
import { linkFolder, rescanLinkedFolder, exportActiveProjectAsMarkdown } from '../../services/tauriActions';
import ExportButtons from './ExportButtons';
import TaskField from './TaskField';

/** The prompt users paste into their AI to activate the memphant_update protocol */
const ACTIVATION_PROMPT =
  `After every response, please include a project update block at the end so I can sync your changes back to my Memephant app:

memphant_update
{
  "summary": "one-sentence summary of the project",
  "currentState": "what is true right now after your work",
  "goals": ["any new goals to add"],
  "decisions": [{"decision": "any new decisions", "rationale": "why"}],
  "nextSteps": ["any new next steps to add"],
  "openQuestions": ["any unresolved questions"]
}

Only include fields that changed. Keep the JSON valid.`;

export function ActionBar() {
  const activeProject = useActiveProject();
  const preAiBackup = useProjectStore((s) => s.preAiBackup);
  const setPreAiBackup = useProjectStore((s) => s.setPreAiBackup);
  const updateProject = useProjectStore((s) => s.updateProject);
  const showToast = useProjectStore((s) => s.showToast);
  const [activationCopied, setActivationCopied] = useState(false);

  const handleRollback = () => {
    if (!preAiBackup) {
      showToast('Nothing to undo.');
      return;
    }

    updateProject(preAiBackup.id, preAiBackup);
    setPreAiBackup(null);
    showToast('Last AI update rolled back.');
  };

  const handleCopyActivation = async () => {
    try {
      await navigator.clipboard.writeText(ACTIVATION_PROMPT);
      setActivationCopied(true);
      showToast('Copied — paste this into your AI at the start of a session');
      setTimeout(() => setActivationCopied(false), 3000);
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  };

  if (!activeProject) {
    return (
      <div className="action-bar">
        <p className="action-bar__empty">Select or create a project to get started.</p>
      </div>
    );
  }

  const hasLinkedFolder = !!activeProject.linkedFolder?.path;

  return (
    <div className="action-bar">
      <div className="action-bar__top-row">
        <ExportButtons />
      </div>

      <TaskField />

      <div className="action-bar__secondary">
        {/* Activate update loop */}
        <button
          type="button"
          className={`action-bar__btn action-bar__btn--activation${activationCopied ? ' action-bar__btn--copied' : ''}`}
          onClick={() => void handleCopyActivation()}
          title="Copy a setup prompt to paste into your AI so it sends updates back automatically"
        >
          {activationCopied ? '✅ Activation copied' : '🔗 Activate update loop'}
        </button>

        {/* Folder link / rescan */}
        {!hasLinkedFolder ? (
          <button type="button" className="action-bar__btn" onClick={() => void linkFolder()}>
            📁 Link project folder
          </button>
        ) : (
          <button
            type="button"
            className="action-bar__btn"
            onClick={() => void rescanLinkedFolder()}
          >
            🔄 Rescan linked folder
          </button>
        )}

        {/* Save as markdown file */}
        <button
          type="button"
          className="action-bar__btn"
          onClick={() => void exportActiveProjectAsMarkdown()}
          title="Save a readable snapshot of this project as a .md file"
        >
          📄 Save as file
        </button>

        {/* Rollback */}
        {preAiBackup && (
          <button
            type="button"
            className="action-bar__btn action-bar__btn--undo"
            onClick={handleRollback}
          >
            ↩️ Undo last AI update
          </button>
        )}
      </div>
    </div>
  );
}

export default ActionBar;
