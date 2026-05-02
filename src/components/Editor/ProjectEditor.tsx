import { useState, useCallback, useMemo } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useRecentActivity } from '../../hooks/useRecentActivity';
import EditableField from './EditableField';
import EditableList from './EditableList';
import { DecisionList } from './DecisionCard';
import { generateSuggestions } from '../../utils/autoSuggest';
import { generateHippocampusMarkdown } from '../../utils/hippocampusFormat';
import { GitHubScanPreview } from './GitHubScanPreview';
import { scanGitHubRepo, mergeScanResult, parseGitHubUrl } from '../../services/githubScanner';
import { restoreProjectFromHistory } from '../../services/tauriActions';
import { RecentActivityBlock } from '../RecentActivityBlock';
import type { GitHubScanResult } from '../../services/githubScanner';

type ScanState = 'idle' | 'scanning' | 'preview' | 'error';

function formatRestorePointTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProjectEditor() {
  const activeProject = useActiveProject();
  const updateProject = useProjectStore((s) => s.updateProject);
  const showToast = useProjectStore((s) => s.showToast);

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanResult, setScanResult] = useState<GitHubScanResult | null>(null);
  const [scanError, setScanError] = useState<string>('');
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const project = activeProject;

  const { markdown, loading, error } = useRecentActivity(
    project?.id ?? '',
    project?.linkedFolder?.path ?? '',
  );

  const recentRestorePoints = project
    ? [...(project.restorePoints ?? [])]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5)
    : [];
  const hippocampusPreview = useMemo(
    () => (project ? generateHippocampusMarkdown(project) : ''),
    [project],
  );

  const update = (field: string, value: unknown) => {
    if (!project) return;
    updateProject(project.id, { [field]: value } as Parameters<typeof updateProject>[1]);
  };

  const handleScan = useCallback(async () => {
    if (!project?.githubRepo) return;
    setScanState('scanning');
    setScanError('');
    setScanResult(null);
    try {
      const result = await scanGitHubRepo(project.githubRepo);
      setScanResult(result);
      setScanState('preview');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed - please try again.');
      setScanState('error');
    }
  }, [project?.githubRepo]);

  const handleScanAccept = useCallback(() => {
    if (!project || !scanResult) return;
    const merged = mergeScanResult(project, scanResult);
    updateProject(project.id, {
      summary: merged.summary,
      currentState: merged.currentState,
      goals: merged.goals,
      nextSteps: merged.nextSteps,
      openQuestions: merged.openQuestions,
      importantAssets: merged.importantAssets,
      decisions: merged.decisions,
      detectedStack: merged.detectedStack,
      scanInfo: merged.scanInfo,
    } as Parameters<typeof updateProject>[1]);
    showToast('Repo scan merged into your project.');
    setScanState('idle');
    setScanResult(null);
  }, [project, scanResult, updateProject, showToast]);

  const handleScanDismiss = useCallback(() => {
    setScanState('idle');
    setScanResult(null);
    setScanError('');
  }, []);

  function handleSuggest(field: 'summary' | 'currentState' | 'goals') {
    if (!project) return;
    const suggestions = generateSuggestions(project);
    const suggested = suggestions[field];

    if (field === 'goals') {
      const existing = project.goals ?? [];
      if (existing.length > 0) {
        const newItems = (suggested as string[]).filter((g) => !existing.includes(g));
        if (newItems.length === 0) {
          showToast('Goals already look complete - edit them manually if needed.');
          return;
        }
        update('goals', [...existing, ...newItems]);
        showToast(`Added ${newItems.length} suggested goal${newItems.length !== 1 ? 's' : ''}.`);
      } else {
        update('goals', suggested);
        showToast('Goals auto-filled - edit them to match your project.');
      }
    } else {
      update(field, suggested);
      showToast('Auto-filled - edit it to make it your own.');
    }
  }

  const handleCopyHippocampus = useCallback(async () => {
    if (!project) return;

    try {
      await navigator.clipboard.writeText(generateHippocampusMarkdown(project));
      showToast('Copied hippocampus.md.');
    } catch {
      showToast('Could not copy hippocampus.md.');
    }
  }, [project, showToast]);

  const handleDownloadHippocampus = useCallback(() => {
    if (!project) return;

    try {
      const content = generateHippocampusMarkdown(project);
      const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'hippocampus.md';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      showToast('Downloaded hippocampus.md.');
    } catch {
      showToast('Could not download hippocampus.md.');
    }
  }, [project, showToast]);

  const handleRestore = useCallback(
    async (restorePointId: string) => {
      if (!project) return;
      setRestoringId(restorePointId);

      try {
        await restoreProjectFromHistory(project.id, restorePointId);
      } finally {
        setRestoringId((current) => (current === restorePointId ? null : current));
      }
    },
    [project],
  );

  if (!project) {
    return (
      <div className="project-editor project-editor--empty">
        <p>Select a project from the sidebar to get started.</p>
      </div>
    );
  }

  return (
    <div className="project-editor" data-tour="editor">
      {recentRestorePoints.length > 0 && (
        <div className="project-history-card">
          <div className="project-history-card__header">
            <div>
              <div className="field-label">Restore History</div>
              <div className="project-history-card__hint">
                Restore the project to how it looked before a recent AI apply or rescan.
              </div>
            </div>
            <span className="project-history-card__badge">
              {recentRestorePoints.length} available
            </span>
          </div>

          <div className="project-history-list">
            {recentRestorePoints.map((restorePoint) => (
              <div key={restorePoint.id} className="project-history-item">
                <div className="project-history-item__meta">
                  <strong>
                    {restorePoint.reason === 'rescan' ? 'Before rescan' : 'Before AI apply'}
                  </strong>
                  <span>{formatRestorePointTime(restorePoint.timestamp)}</span>
                </div>
                <div className="project-history-item__summary">{restorePoint.summary}</div>
                <button
                  type="button"
                  className="project-history-item__restore"
                  onClick={() => void handleRestore(restorePoint.id)}
                  disabled={restoringId === restorePoint.id}
                >
                  {restoringId === restorePoint.id ? 'Restoring...' : 'Restore'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="field-group" data-tour="editor-name">
        <div className="field-label">Project Name</div>
        <input
          className="field-input project-name-input"
          type="text"
          value={activeProject.name}
          onChange={(e) => update('name', e.target.value)}
        />
      </div>

      <div className="field-group github-repo-field">
        <div className="field-label">
          GitHub Repository <span className="field-label-optional">(optional)</span>
          {activeProject.scanInfo && (
            <span
              className="github-scan-badge"
              title={`Last scanned ${new Date(activeProject.scanInfo.scannedAt).toLocaleString()}`}
            >
              Scanned
            </span>
          )}
        </div>
        <div className="github-repo-input-row">
          <input
            className="field-input github-repo-input"
            type="url"
            value={activeProject.githubRepo || ''}
            onChange={(e) => {
              update('githubRepo', e.target.value);
              if (scanState !== 'idle') handleScanDismiss();
            }}
            placeholder="https://github.com/username/repo"
            spellCheck={false}
            disabled={scanState === 'scanning'}
          />
          {parseGitHubUrl(activeProject.githubRepo || '') &&
            scanState !== 'scanning' &&
            scanState !== 'preview' && (
              <button
                type="button"
                className="github-scan-btn"
                onClick={() => void handleScan()}
                title="Scan this repo to extract project context"
              >
                Scan repo
              </button>
            )}
          {scanState === 'scanning' && (
            <button type="button" className="github-scan-btn github-scan-btn--loading" disabled>
              <span className="scan-spinner" />
              Scanning...
            </button>
          )}
          {activeProject.githubRepo?.startsWith('https://github.com/') && (
            <a
              className="github-repo-link"
              href={activeProject.githubRepo}
              target="_blank"
              rel="noopener noreferrer"
              title="Open repo in browser"
            >
              Open
            </a>
          )}
        </div>

        {scanState === 'error' && (
          <div className="scan-error-msg">
            {scanError}
            <button type="button" className="scan-error-retry" onClick={() => void handleScan()}>
              Try again
            </button>
          </div>
        )}

        {scanState !== 'preview' && scanState !== 'scanning' && (
          <p className="github-repo-hint">
            {parseGitHubUrl(activeProject.githubRepo || '')
              ? 'Click "Scan repo" to automatically extract project context from this repository.'
              : 'Paste a public GitHub URL - AIs can browse your code directly from this link.'}
          </p>
        )}
      </div>

      {scanState === 'preview' && scanResult && (
        <GitHubScanPreview
          result={scanResult}
          onAccept={handleScanAccept}
          onDismiss={handleScanDismiss}
        />
      )}

      {activeProject.detectedStack &&
        activeProject.detectedStack.length > 0 &&
        scanState === 'idle' && (
          <div className="field-group">
            <div className="field-label">Detected Stack</div>
            <div className="detected-stack-chips">
              {activeProject.detectedStack.map((tech) => (
                <span key={tech} className="detected-stack-chip">
                  {tech}
                </span>
              ))}
              <button
                type="button"
                className="detected-stack-rescan"
                onClick={() => void handleScan()}
                title="Re-scan repo to update stack detection"
              >
                Rescan
              </button>
            </div>
          </div>
        )}

      <EditableField
        label="Summary"
        value={activeProject.summary}
        onChange={(v) => update('summary', v)}
        multiline
        placeholder="Write a simple explanation so any AI can quickly understand this project."
        onSuggest={() => handleSuggest('summary')}
        suggestLabel={activeProject.summary?.trim() ? 'Regenerate' : 'Auto-fill'}
      />

      <EditableField
        label="What this project is about"
        value={activeProject.currentState}
        onChange={(v) => update('currentState', v)}
        multiline
        placeholder="Describe what's been built and what still needs doing."
        onSuggest={() => handleSuggest('currentState')}
        suggestLabel={activeProject.currentState?.trim() ? 'Regenerate' : 'Auto-fill'}
      />

      <EditableList
        label="Goals"
        items={activeProject.goals}
        onChange={(v) => update('goals', v)}
        placeholder="Add a goal..."
        onSuggest={() => handleSuggest('goals')}
      />

      <EditableList
        label="Rules"
        items={activeProject.rules}
        onChange={(v) => update('rules', v)}
        placeholder="Add a rule..."
      />

      <DecisionList decisions={activeProject.decisions} onChange={(v) => update('decisions', v)} />

      <EditableList
        label="Next Steps"
        items={activeProject.nextSteps}
        onChange={(v) => update('nextSteps', v)}
        placeholder="Add a next step..."
      />

      <EditableList
        label="Open Questions"
        items={activeProject.openQuestions}
        onChange={(v) => update('openQuestions', v)}
        placeholder="Add a question..."
      />

      <EditableList
        label="Important Files & Assets"
        items={activeProject.importantAssets}
        onChange={(v) => update('importantAssets', v)}
        placeholder="Add a file or asset path..."
      />

      <div className="field-group">
        <div className="field-label">Memory Core File</div>
        <div className="github-repo-input-row">
          <button
            type="button"
            className="github-scan-btn"
            onClick={() => void handleCopyHippocampus()}
            title="Copy generated .memephant/hippocampus.md markdown to clipboard"
          >
            Copy hippocampus.md
          </button>
          <button
            type="button"
            className="github-scan-btn"
            onClick={() => handleDownloadHippocampus()}
            title="Download .memephant/hippocampus.md as a file"
          >
            Download hippocampus.md
          </button>
        </div>
        <p className="github-repo-hint">
          Copies or downloads a portable Memory Core markdown file. This does not write to your linked folder yet.
        </p>
        <details className="hippocampus-preview">
          <summary>Preview hippocampus.md</summary>
          <pre>{hippocampusPreview}</pre>
        </details>
      </div>

      <EditableField
        label="Memory Core"
        value={activeProject.projectCharter || ''}
        onChange={(v) => update('projectCharter', v)}
        multiline
        helpText="The permanent project identity layer: values, working rules, boundaries, communication style, and long-term context every AI should remember."
        placeholder="Describe how AI agents should understand this project: values, working style, boundaries, communication rules, and things that must not be forgotten."
      />

      <EditableField
        label="How the AI should help"
        value={activeProject.aiInstructions || ''}
        onChange={(v) => update('aiInstructions', v)}
        multiline
        placeholder="Any specific instructions for how AIs should work on this project."
      />

      <RecentActivityBlock
        markdown={markdown}
        loading={loading}
        error={error}
      />
    </div>
  );
}

export default ProjectEditor;
