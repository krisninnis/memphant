import { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useActiveProject } from '../../hooks/useActiveProject';
import {
  isDesktopApp,
  linkFolder,
  rescanLinkedFolder,
  exportActiveProjectAsMarkdown,
  exportActiveProjectAsJson,
  syncGitCommits,
} from '../../services/tauriActions';
import ExportButtons from './ExportButtons';
import TaskField from './TaskField';

/** The prompt users paste into their AI to activate the memphant_update protocol */
const ACTIVATION_PROMPT = `After every response, please include a project update block at the end so I can sync your changes back to my Memephant app:

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

type GitSyncState = 'idle' | 'syncing' | 'found' | 'up_to_date';

export function ActionBar() {
  const activeProject = useActiveProject();
  const preAiBackup = useProjectStore((s) => s.preAiBackup);
  const setPreAiBackup = useProjectStore((s) => s.setPreAiBackup);
  const updateProject = useProjectStore((s) => s.updateProject);
  const showToast = useProjectStore((s) => s.showToast);

  const [activationCopied, setActivationCopied] = useState(false);
  const [gitSyncState, setGitSyncState] = useState<GitSyncState>('idle');
  const [gitSyncCount, setGitSyncCount] = useState(0);

  const desktopApp = isDesktopApp();

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
      showToast('Copied - paste this into your AI at the start of a session');
      setTimeout(() => setActivationCopied(false), 3000);
    } catch {
      showToast('Could not copy to clipboard', 'error');
    }
  };

  const handleSyncGit = async () => {
    if (!desktopApp) {
      showToast('Git sync requires the desktop app.', 'info');
      return;
    }

    if (!activeProject?.id || !activeProject.linkedFolder?.path || gitSyncState === 'syncing') {
      return;
    }

    setGitSyncState('syncing');

    try {
      const commits = await syncGitCommits(activeProject.id);

      if (commits.length > 0) {
        setGitSyncCount(commits.length);
        setGitSyncState('found');
        showToast(
          `${commits.length} commit${commits.length === 1 ? '' : 's'} will be included in your next AI export`,
          'info',
        );

        window.setTimeout(() => {
          setGitSyncState('idle');
          setGitSyncCount(0);
        }, 3000);

        return;
      }

      setGitSyncState('up_to_date');
      window.setTimeout(() => {
        setGitSyncState('idle');
      }, 2000);
    } catch {
      setGitSyncState('idle');
      showToast('Could not sync Git commits', 'error');
    }
  };

  useEffect(() => {
    setGitSyncState('idle');
    setGitSyncCount(0);
  }, [activeProject?.id]);

  if (!activeProject) {
    return (
      <div className="action-bar">
        <p className="action-bar__empty">Select or create a project to get started.</p>
      </div>
    );
  }

  const hasLinkedFolder = !!activeProject.linkedFolder?.path;
  const pendingGitCommits = activeProject.pendingGitCommits ?? [];

  let syncGitLabel = 'Sync Git';
  if (gitSyncState === 'syncing') syncGitLabel = 'Syncing...';
  if (gitSyncState === 'found') {
    syncGitLabel = `${gitSyncCount} new commit${gitSyncCount === 1 ? '' : 's'}`;
  }
  if (gitSyncState === 'up_to_date') syncGitLabel = 'Up to date';

  return (
    <div className="action-bar">
      <div className="action-bar__top-row">
        <ExportButtons />
      </div>

      <TaskField />

      {desktopApp && pendingGitCommits.length > 0 && (
        <div className="action-bar__git-note">
          {pendingGitCommits.length} commit{pendingGitCommits.length === 1 ? '' : 's'} will be included in your next AI export.
        </div>
      )}

      <div className="action-bar__secondary">
        <button
          type="button"
          className={`action-bar__btn action-bar__btn--activation${activationCopied ? ' action-bar__btn--copied' : ''}`}
          onClick={() => void handleCopyActivation()}
          title="Copy a setup prompt to paste into your AI so it sends updates back automatically"
        >
          {activationCopied ? 'Activation copied' : 'Activate update loop'}
        </button>

        {desktopApp && (
          !hasLinkedFolder ? (
            <button
              type="button"
              className="action-bar__btn"
              onClick={() => void linkFolder()}
              title="Link a local project folder to enable rescans and Git-aware exports"
            >
              Link project folder
            </button>
          ) : (
            <button
              type="button"
              className="action-bar__btn"
              onClick={() => void rescanLinkedFolder()}
              title="Rescan the linked local project folder"
            >
              Rescan linked folder
            </button>
          )
        )}

        {desktopApp && (
          <button
            type="button"
            className={`action-bar__btn${gitSyncState === 'found' ? ' action-bar__btn--success' : ''}`}
            onClick={() => void handleSyncGit()}
            disabled={!hasLinkedFolder || gitSyncState === 'syncing'}
            title={
              !hasLinkedFolder
                ? 'Link a project folder first'
                : 'Read recent commits from the linked project folder'
            }
          >
            {syncGitLabel}
          </button>
        )}

        <button
          type="button"
          className="action-bar__btn"
          onClick={() => void exportActiveProjectAsMarkdown()}
          title="Save a readable snapshot of this project as a .md file"
        >
          Save as file
        </button>

        {!desktopApp && (
          <button
            type="button"
            className="action-bar__btn"
            onClick={() => void exportActiveProjectAsJson()}
            title="Download this project as a JSON file for web/mobile use"
          >
            Export project JSON
          </button>
        )}

        {preAiBackup && (
          <button
            type="button"
            className="action-bar__btn action-bar__btn--undo"
            onClick={handleRollback}
          >
            Undo last AI update
          </button>
        )}
      </div>
    </div>
  );
}

export default ActionBar;