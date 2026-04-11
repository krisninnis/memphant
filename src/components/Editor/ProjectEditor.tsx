import { useState, useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useActiveProject } from '../../hooks/useActiveProject';
import EditableField from './EditableField';
import EditableList from './EditableList';
import { DecisionList } from './DecisionCard';
import { generateSuggestions } from '../../utils/autoSuggest';
import { GitHubScanPreview } from './GitHubScanPreview';
import { scanGitHubRepo, mergeScanResult, parseGitHubUrl } from '../../services/githubScanner';
import type { GitHubScanResult } from '../../services/githubScanner';

type ScanState = 'idle' | 'scanning' | 'preview' | 'error';

export function ProjectEditor() {
  const activeProject = useActiveProject();
  const updateProject = useProjectStore((s) => s.updateProject);
  const showToast = useProjectStore((s) => s.showToast);

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [scanResult, setScanResult] = useState<GitHubScanResult | null>(null);
  const [scanError, setScanError] = useState<string>('');

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

  // ── GitHub scan ────────────────────────────────────────────────────────────

  const handleScan = useCallback(async () => {
    if (!project.githubRepo) return;
    setScanState('scanning');
    setScanError('');
    setScanResult(null);
    try {
      const result = await scanGitHubRepo(project.githubRepo);
      setScanResult(result);
      setScanState('preview');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed — please try again.');
      setScanState('error');
    }
  }, [project.githubRepo]);

  const handleScanAccept = useCallback(() => {
    if (!scanResult) return;
    const merged = mergeScanResult(project, scanResult);
    updateProject(project.id, {
      summary:         merged.summary,
      currentState:    merged.currentState,
      goals:           merged.goals,
      nextSteps:       merged.nextSteps,
      openQuestions:   merged.openQuestions,
      importantAssets: merged.importantAssets,
      decisions:       merged.decisions,
      detectedStack:   merged.detectedStack,
      scanInfo:        merged.scanInfo,
    } as Parameters<typeof updateProject>[1]);
    showToast('Repo scan merged into your project ✓');
    setScanState('idle');
    setScanResult(null);
  }, [project, scanResult, updateProject, showToast]);

  const handleScanDismiss = useCallback(() => {
    setScanState('idle');
    setScanResult(null);
    setScanError('');
  }, []);

  // ── Auto-suggest ───────────────────────────────────────────────────────────

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

      {/* GitHub Repository */}
      <div className="field-group github-repo-field">
        <div className="field-label">
          GitHub Repository <span className="field-label-optional">(optional)</span>
          {activeProject.scanInfo && (
            <span className="github-scan-badge" title={`Last scanned ${new Date(activeProject.scanInfo.scannedAt).toLocaleString()}`}>
              ✓ scanned
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
              // Clear scan results if URL changes
              if (scanState !== 'idle') handleScanDismiss();
            }}
            placeholder="https://github.com/username/repo"
            spellCheck={false}
            disabled={scanState === 'scanning'}
          />
          {parseGitHubUrl(activeProject.githubRepo || '') && scanState !== 'scanning' && scanState !== 'preview' && (
            <button
              type="button"
              className="github-scan-btn"
              onClick={() => void handleScan()}
              title="Scan this repo to extract project context"
            >
              🔍 Scan repo
            </button>
          )}
          {scanState === 'scanning' && (
            <button type="button" className="github-scan-btn github-scan-btn--loading" disabled>
              <span className="scan-spinner" />
              Scanning…
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
              ↗
            </a>
          )}
        </div>

        {scanState === 'error' && (
          <div className="scan-error-msg">
            ⚠️ {scanError}
            <button type="button" className="scan-error-retry" onClick={() => void handleScan()}>
              Try again
            </button>
          </div>
        )}

        {scanState !== 'preview' && scanState !== 'scanning' && (
          <p className="github-repo-hint">
            {parseGitHubUrl(activeProject.githubRepo || '')
              ? 'Click "Scan repo" to automatically extract project context from this repository.'
              : 'Paste a public GitHub URL — AIs can browse your code directly from this link.'}
          </p>
        )}
      </div>

      {/* GitHub Scan Preview */}
      {scanState === 'preview' && scanResult && (
        <GitHubScanPreview
          result={scanResult}
          onAccept={handleScanAccept}
          onDismiss={handleScanDismiss}
        />
      )}

      {/* Detected stack badge row (shown after scan is merged) */}
      {activeProject.detectedStack && activeProject.detectedStack.length > 0 && scanState === 'idle' && (
        <div className="field-group">
          <div className="field-label">Detected Stack</div>
          <div className="detected-stack-chips">
            {activeProject.detectedStack.map((tech) => (
              <span key={tech} className="detected-stack-chip">{tech}</span>
            ))}
            <button
              type="button"
              className="detected-stack-rescan"
              onClick={() => void handleScan()}
              title="Re-scan repo to update stack detection"
            >
              ↻ Rescan
            </button>
          </div>
        </div>
      )}

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
