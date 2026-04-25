import { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useActiveProject } from '../../hooks/useActiveProject';
import {
  isDesktopApp,
  linkFolder,
  rescanLinkedFolder,
  exportActiveProjectAsMarkdown,
  exportActiveProjectAsJson,
  generateStateManifest,
  syncGitCommits,
  type StateManifestPreview,
} from '../../services/tauriActions';
import ExportButtons from './ExportButtons';
import TaskField from './TaskField';

/** The prompt users paste into their AI to activate the memphant_update protocol */
const ACTIVATION_PROMPT = `After every response, please include a project update block at the end so I can sync your changes back to my Memephant app:

memphant_update
\`\`\`json
{
  "schemaVersion": "1.1.0",
  "currentState": "what is true right now after your work",
  "lastSessionSummary": "2-4 sentence recap of what just happened",
  "inProgress": ["what you are actively working on right now"],
  "nextSteps": ["immediate next actions after this session"],
  "openQuestion": "the single most important unresolved question",
  "goals": ["any new goals that emerged this session"],
  "decisions": [{"decision": "any new decisions", "rationale": "why"}]
}
\`\`\`

Only include fields that changed. Keep the JSON valid.
currentState and lastSessionSummary are always required.`;

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
  const [manifestPreview, setManifestPreview] = useState<StateManifestPreview | null>(null);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [manifestLoading, setManifestLoading] = useState(false);

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

  const handlePreviewManifest = async () => {
    if (!activeProject || manifestLoading) return;

    setManifestLoading(true);
    setManifestError(null);

    try {
      const preview = await generateStateManifest(activeProject);
      setManifestPreview(preview);
      showToast('Project snapshot ready.', 'info');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setManifestPreview(null);
      setManifestError(message || 'Could not prepare the full context preview.');
      showToast(message || 'Could not prepare the full context preview.', 'error');
    } finally {
      setManifestLoading(false);
    }
  };

  const handleCopyManifestText = async () => {
    if (!manifestPreview) return;

    try {
      await navigator.clipboard.writeText(manifestPreview.text);
      showToast('Copied with full context.', 'info');
    } catch {
      showToast('Could not copy the full context.', 'error');
    }
  };

  const handleCopyManifestDigest = async () => {
    if (!manifestPreview) return;

    try {
      await navigator.clipboard.writeText(manifestPreview.digest);
      showToast('Reference ID copied.', 'info');
    } catch {
      showToast('Could not copy the reference ID.', 'error');
    }
  };

  useEffect(() => {
    setGitSyncState('idle');
    setGitSyncCount(0);
    setManifestPreview(null);
    setManifestError(null);
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
          title="Copy this once into your AI chat so it automatically sends updates back to Memephant"
        >
          {activationCopied ? 'Copied — paste into your AI' : 'Set up auto-updates'}
        </button>

        {desktopApp && (
          !hasLinkedFolder ? (
            <button
              type="button"
              className="action-bar__btn"
              onClick={() => void linkFolder()}
              title="Link a local project folder to enable rescans and Git-aware exports"
            >
              Select project folder
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
                ? 'Link a project folder first to sync Git commits'
                : 'Read recent commits from the linked project folder'
            }
          >
            {syncGitLabel}
          </button>
        )}

        {desktopApp && (
          <button
            type="button"
            className="action-bar__btn"
            onClick={() => void handlePreviewManifest()}
            disabled={manifestLoading}
            title="Prepare a deeper full-context preview for this project"
          >
            {manifestLoading ? 'Preparing full context...' : 'Preview full context'}
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

      {(manifestPreview || manifestError) && (
        <div className="state-manifest-preview">
          <div className="state-manifest-preview__header">
            <div>
              <div className="state-manifest-preview__title">Full context preview</div>
              <div className="state-manifest-preview__subtitle">
                Preview only. Normal AI export and import flows are unchanged.
              </div>
            </div>
            <button
              type="button"
              className="state-manifest-preview__close"
              onClick={() => {
                setManifestPreview(null);
                setManifestError(null);
              }}
              aria-label="Close full context preview"
            >
              Close
            </button>
          </div>

          {manifestError ? (
            <div className="state-manifest-preview__error">{manifestError}</div>
          ) : manifestPreview ? (
            <>
              <div className="state-manifest-preview__meta">
                <span>Reference ID: {manifestPreview.digest}</span>
                <span>{manifestPreview.item_count} item{manifestPreview.item_count === 1 ? '' : 's'}</span>
              </div>
              <textarea
                className="state-manifest-preview__text"
                value={manifestPreview.text}
                readOnly
                spellCheck={false}
                aria-label="Full context text"
              />
              <div className="state-manifest-preview__actions">
                <button
                  type="button"
                  className="action-bar__btn"
                  onClick={() => void handleCopyManifestText()}
                >
                  Copy with full context
                </button>
                <button
                  type="button"
                  className="action-bar__btn"
                  onClick={() => void handleCopyManifestDigest()}
                >
                  Copy reference ID
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default ActionBar;
