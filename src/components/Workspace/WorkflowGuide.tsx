/**
 * WorkflowGuide — a simple 3-step visual guide shown at the top of the workspace.
 * Collapses once the user has used the app before (i.e. has exported at least once).
 */
import { useState } from 'react';
import { useActiveProject } from '../../hooks/useActiveProject';

export function WorkflowGuide() {
  const activeProject = useActiveProject();
  const [dismissed, setDismissed] = useState(false);

  // Check if any platform has been used at all
  const hasEverExported = activeProject
    ? Object.values(activeProject.platformState || {}).some((s) => s?.lastExportedAt)
    : false;

  // Hide if dismissed or the user is experienced with this project
  if (dismissed || hasEverExported) return null;

  return (
    <div className="workflow-guide">
      <div className="workflow-guide__steps">
        <div className="workflow-guide__step">
          <span className="workflow-guide__num">1</span>
          <div className="workflow-guide__text">
            <strong>Pick your AI</strong>
            <span>Click a button above to copy your project for that platform</span>
          </div>
        </div>
        <div className="workflow-guide__arrow">→</div>
        <div className="workflow-guide__step">
          <span className="workflow-guide__num">2</span>
          <div className="workflow-guide__text">
            <strong>Paste &amp; work</strong>
            <span>Open the AI, start a new chat, paste, and work normally</span>
          </div>
        </div>
        <div className="workflow-guide__arrow">→</div>
        <div className="workflow-guide__step">
          <span className="workflow-guide__num">3</span>
          <div className="workflow-guide__text">
            <strong>Paste back</strong>
            <span>Copy the AI's JSON reply below to save what changed</span>
          </div>
        </div>
      </div>
      <button className="workflow-guide__dismiss" onClick={() => setDismissed(true)}>
        Got it
      </button>
    </div>
  );
}

export default WorkflowGuide;
