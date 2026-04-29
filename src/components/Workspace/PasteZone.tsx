import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useActiveProject } from '../../hooks/useActiveProject';
import { saveToDisk, withRestorePoint } from '../../services/tauriActions';
import {
  detectUpdate,
  computeDiff,
  applyUpdate,
  countDiffs,
  countRiskyDiffs,
  fieldLabel,
  getLatestCheckpoint,
} from '../../utils/diffEngine';
import { extractStructuredProjectUpdate, runLocalAiAction } from '../../services/localAiService';
import { getChangesSince } from '../../utils/getChangesSince';
import { getPlatformConfig } from '../../utils/platformRegistry';
import DiffPreview from './DiffPreview';
import type { DetectedUpdate } from '../../utils/diffEngine';
import type { DiffResult, ProjectCheckpoint } from '../../types/memphant-types';

type PasteState = 'idle' | 'typing' | 'diff' | 'no-update';

type DetectionMeta = {
  source: string;
  confidence: number;
} | null;

const LOCAL_AI_MIN_CONFIDENCE = 0.45;
const LOCAL_AI_HIGH_CONFIDENCE = 0.75;
const AUTO_ANALYSE_DEBOUNCE_MS = 800;
const AUTO_ANALYSE_MIN_LENGTH = 50;

function scrollFieldIntoView(target: HTMLElement) {
  window.setTimeout(() => {
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, 150);
}

export function PasteZone() {
  const [pasteText, setPasteText] = useState('');
  const [state, setState] = useState<PasteState>('idle');
  const [diffs, setDiffs] = useState<DiffResult[]>([]);
  const [detectedUpdate, setDetectedUpdate] = useState<DetectedUpdate | null>(null);
  const [linkedCheckpoint, setLinkedCheckpoint] = useState<ProjectCheckpoint | null>(null);
  const [detectionMeta, setDetectionMeta] = useState<DetectionMeta>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [autoChecking, setAutoChecking] = useState(false);
  const [changesExpanded, setChangesExpanded] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const autoAnalyseTimeoutRef = useRef<number | null>(null);
  const analyseRequestIdRef = useRef(0);
  const lastAutoAnalysedKeyRef = useRef<string | null>(null);
  const inFlightAutoKeyRef = useRef<string | null>(null);
  const pasteTextRef = useRef('');

  const activeProject = useActiveProject();
  const updateProject = useProjectStore((s) => s.updateProject);
  const setPreAiBackup = useProjectStore((s) => s.setPreAiBackup);
  const showToast = useProjectStore((s) => s.showToast);
  const targetPlatform = useProjectStore((s) => s.targetPlatform);
  const platformSettings = useProjectStore((s) => s.settings.platforms);
  const targetPlatformLabel = getPlatformConfig(targetPlatform, platformSettings).name;
  const localAiSettings = useProjectStore((s) => s.settings.localAi);
  const [localAiActionBusy, setLocalAiActionBusy] = useState(false);
  const [localAiActionTitle, setLocalAiActionTitle] = useState('');
  const [localAiActionOutput, setLocalAiActionOutput] = useState('');

  const localAiActionsEnabled =
    localAiSettings.enabled &&
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window;

  const lastSeenAt =
  activeProject?.platformState?.[targetPlatform]?.lastSeenAt;

// All changelog entries since last export for this platform.
const allRecentChanges = activeProject
  ? getChangesSince(activeProject, lastSeenAt)
  : [];

// Only surface meaningful changes — filter out app/system infrastructure events
// (folder scans, rescans, project creation) and collapse consecutive same-field
// entries within 60 seconds into one so the list doesn't fill with noise.
function deduplicateChanges(entries: typeof allRecentChanges) {
  const meaningful = entries.filter(
    (c) => c.source !== 'app' && c.source !== 'system',
  );
  const deduped: typeof meaningful = [];
  for (const entry of meaningful) {
    const prev = deduped[deduped.length - 1];
    const sameType = prev && prev.field === entry.field && prev.action === entry.action;
    const within60s =
      prev && Math.abs(new Date(entry.timestamp).getTime() - new Date(prev.timestamp).getTime()) < 60_000;
    if (sameType && within60s) continue; // collapse
    deduped.push(entry);
  }
  return deduped;
}
const recentChanges = deduplicateChanges(allRecentChanges);

  useEffect(() => {
    pasteTextRef.current = pasteText;
  }, [pasteText]);

  const clearAutoAnalyseState = useCallback(() => {
    if (autoAnalyseTimeoutRef.current !== null) {
      window.clearTimeout(autoAnalyseTimeoutRef.current);
      autoAnalyseTimeoutRef.current = null;
    }

    lastAutoAnalysedKeyRef.current = null;
    inFlightAutoKeyRef.current = null;
    setAutoChecking(false);
  }, []);

  const resetPasteState = () => {
    clearAutoAnalyseState();
    setPasteText('');
    setLocalAiActionTitle('');
    setLocalAiActionOutput('');
    setState('idle');
    setDiffs([]);
    setDetectedUpdate(null);
    setLinkedCheckpoint(null);
    setDetectionMeta(null);
    setIsDragOver(false);
    setAutoChecking(false);
  };

  const handleTextChange = (text: string) => {
    setPasteText(text);

    if (!text.trim()) {
      clearAutoAnalyseState();
      setState('idle');
      setDiffs([]);
      setDetectedUpdate(null);
      setLinkedCheckpoint(null);
      setDetectionMeta(null);
      setAutoChecking(false);
      return;
    }

    if (state !== 'typing') {
      setState('typing');
    }
  };

  const analyseText = useCallback(async (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText || !activeProject) return;

    const requestId = ++analyseRequestIdRef.current;

    const result = detectUpdate(trimmedText);
    let update = result.update;
    let detectionSource: string = result.source;
    let detectionConfidence = result.confidence;

    if (!update || detectionConfidence < LOCAL_AI_HIGH_CONFIDENCE) {
      const localResult = await extractStructuredProjectUpdate(trimmedText);

      if (
        localResult.update &&
        localResult.confidence >= LOCAL_AI_MIN_CONFIDENCE &&
        localResult.confidence > detectionConfidence
      ) {
        update = localResult.update;
        detectionSource = localResult.source;
        detectionConfidence = localResult.confidence;
      }
    }

    if (requestId !== analyseRequestIdRef.current || pasteTextRef.current.trim() !== trimmedText) {
      return;
    }

    if (!update) {
      setDetectedUpdate(null);
      setLinkedCheckpoint(null);
      setDetectionMeta(null);
      setDiffs([]);
      setState('no-update');
      return;
    }

    const checkpoint =
      getLatestCheckpoint(activeProject, targetPlatform) ??
      getLatestCheckpoint(activeProject);
    const computedDiffs = computeDiff(activeProject, update, checkpoint);

    if (computedDiffs.length === 0) {
      setDetectedUpdate(null);
      setLinkedCheckpoint(checkpoint);
      setDetectionMeta(null);
      setDiffs([]);
      setState('no-update');
      showToast('No new project changes were found in that text.', 'info');
      return;
    }

    setDetectedUpdate(update);
    setLinkedCheckpoint(checkpoint);
    setDiffs(computedDiffs);
    setDetectionMeta({
      source: detectionSource,
      confidence: detectionConfidence,
    });
    setState('diff');

    if (detectionSource === 'smart_local_fallback') {
      const percent = Math.round(detectionConfidence * 100);

      if (detectionConfidence >= LOCAL_AI_HIGH_CONFIDENCE) {
        showToast(
          `Possible update detected locally (${percent}% confidence). Review before applying.`,
          'info',
        );
      } else {
        showToast(
          `Low-confidence local update detected (${percent}%). Review carefully before applying.`,
          'info',
        );
      }
    }
  }, [activeProject, showToast, targetPlatform]);

  const handleAnalyse = async () => {
    const trimmedText = pasteText.trim();

    if (!trimmedText) {
      return;
    }

    if (!activeProject) {
      showToast('Open a project first', 'error');
      return;
    }

    clearAutoAnalyseState();
    await analyseText(trimmedText);
  };

  useEffect(() => {
    if (state !== 'typing' || !activeProject) {
      if (autoAnalyseTimeoutRef.current !== null) {
        window.clearTimeout(autoAnalyseTimeoutRef.current);
        autoAnalyseTimeoutRef.current = null;
      }
      setAutoChecking(false);
      return;
    }

    const trimmedText = pasteText.trim();
    if (trimmedText.length < AUTO_ANALYSE_MIN_LENGTH) {
      if (autoAnalyseTimeoutRef.current !== null) {
        window.clearTimeout(autoAnalyseTimeoutRef.current);
        autoAnalyseTimeoutRef.current = null;
      }
      setAutoChecking(false);
      return;
    }

    const analysisKey = `${activeProject.id}:${trimmedText}`;
    if (
      lastAutoAnalysedKeyRef.current === analysisKey ||
      inFlightAutoKeyRef.current === analysisKey
    ) {
      if (autoAnalyseTimeoutRef.current !== null) {
        window.clearTimeout(autoAnalyseTimeoutRef.current);
        autoAnalyseTimeoutRef.current = null;
      }
      setAutoChecking(Boolean(inFlightAutoKeyRef.current));
      return;
    }

    if (autoAnalyseTimeoutRef.current !== null) {
      window.clearTimeout(autoAnalyseTimeoutRef.current);
    }

    setAutoChecking(true);
    autoAnalyseTimeoutRef.current = window.setTimeout(() => {
      autoAnalyseTimeoutRef.current = null;

      if (
        state !== 'typing' ||
        !activeProject ||
        pasteText.trim().length < AUTO_ANALYSE_MIN_LENGTH
      ) {
        setAutoChecking(false);
        return;
      }

      const latestKey = `${activeProject.id}:${pasteText.trim()}`;
      if (latestKey !== analysisKey || inFlightAutoKeyRef.current === latestKey) {
        setAutoChecking(Boolean(inFlightAutoKeyRef.current));
        return;
      }

      inFlightAutoKeyRef.current = latestKey;
      setAutoChecking(true);

      void analyseText(pasteText.trim()).finally(() => {
        if (inFlightAutoKeyRef.current === latestKey) {
          inFlightAutoKeyRef.current = null;
        }

        if (pasteTextRef.current.trim() === trimmedText) {
          lastAutoAnalysedKeyRef.current = latestKey;
        }

        if (!autoAnalyseTimeoutRef.current && !inFlightAutoKeyRef.current) {
          setAutoChecking(false);
        }
      });
    }, AUTO_ANALYSE_DEBOUNCE_MS);

    return () => {
      if (autoAnalyseTimeoutRef.current !== null) {
        window.clearTimeout(autoAnalyseTimeoutRef.current);
        autoAnalyseTimeoutRef.current = null;
      }
    };
  }, [activeProject, analyseText, pasteText, state]);

  useEffect(() => () => {
    clearAutoAnalyseState();
  }, [clearAutoAnalyseState]);

  const cloneProjectForBackup = (project: typeof activeProject) => {
    if (!project) return null;

    return {
      ...project,
      checkpoints: (project.checkpoints ?? []).map((checkpoint) => ({
        ...checkpoint,
        snapshot: {
          ...checkpoint.snapshot,
          goals: [...checkpoint.snapshot.goals],
          rules: [...checkpoint.snapshot.rules],
          decisions: checkpoint.snapshot.decisions.map((decision) => ({ ...decision })),
          nextSteps: [...checkpoint.snapshot.nextSteps],
          openQuestions: [...checkpoint.snapshot.openQuestions],
          importantAssets: [...checkpoint.snapshot.importantAssets],
          changelog: checkpoint.snapshot.changelog.map((entry) => ({ ...entry })),
          platformState: { ...checkpoint.snapshot.platformState },
          linkedFolder: checkpoint.snapshot.linkedFolder
            ? { ...checkpoint.snapshot.linkedFolder }
            : undefined,
          detectedStack: checkpoint.snapshot.detectedStack
            ? [...checkpoint.snapshot.detectedStack]
            : undefined,
          scanInfo: checkpoint.snapshot.scanInfo
            ? {
                ...checkpoint.snapshot.scanInfo,
                keyFilesFound: [...checkpoint.snapshot.scanInfo.keyFilesFound],
              }
            : undefined,
        },
      })),
      decisions: project.decisions.map((decision) => ({ ...decision })),
      changelog: project.changelog.map((entry) => ({ ...entry })),
      importantAssets: [...project.importantAssets],
      goals: [...project.goals],
      rules: [...project.rules],
      nextSteps: [...project.nextSteps],
      openQuestions: [...project.openQuestions],
      platformState: { ...project.platformState },
      linkedFolder: project.linkedFolder ? { ...project.linkedFolder } : undefined,
    };
  };

  const handleApply = async (allowRiskyOverwrites: boolean) => {
    if (!activeProject || !detectedUpdate) {
      return;
    }

    setPreAiBackup(cloneProjectForBackup(activeProject));
    const projectWithRestore = withRestorePoint(
      activeProject,
      'ai_apply',
      `Before AI apply for ${targetPlatformLabel}`,
    );

    const mergedProject = applyUpdate(projectWithRestore, detectedUpdate, {
      allowRiskyOverwrites,
      diffs,
      checkpoint: linkedCheckpoint,
    });

    if (JSON.stringify(mergedProject) === JSON.stringify(activeProject)) {
      showToast(
        allowRiskyOverwrites
          ? 'No changes were applied.'
          : 'No safe changes were available to apply.',
        'info',
      );
      return;
    }

    updateProject(activeProject.id, mergedProject);
    try {
      await saveToDisk(mergedProject);
    } catch {
      showToast('Your changes could not be saved. Please try again.', 'error');
    }

    const totalChanges = countDiffs(diffs);
    const riskyCount = countRiskyDiffs(diffs);
    showToast(
      allowRiskyOverwrites
        ? `Project updated with ${totalChanges} change${totalChanges !== 1 ? 's' : ''}. Restore available.`
        : riskyCount > 0
          ? `Applied ${totalChanges - riskyCount} safe change${totalChanges - riskyCount !== 1 ? 's' : ''}. ${riskyCount} overwrite${riskyCount !== 1 ? 's were' : ' was'} skipped. Restore available.`
          : `Project updated with ${totalChanges} safe change${totalChanges !== 1 ? 's' : ''}. Restore available.`,
    );

    resetPasteState();
  };

  const handleDiscard = () => {
    resetPasteState();
  };

  const handleCopyHint = async () => {
    const hint =
      'Can you summarise what changed in my project? Please include a memphant_update block with any new goals, decisions, and next steps.';

    try {
      await navigator.clipboard.writeText(hint);
      showToast('Suggestion copied — paste it into your AI chat');
    } catch {
      showToast('Could not copy the suggestion', 'error');
    }
  };

  const handleCopyLocalAiOutput = async () => {
    if (!localAiActionOutput.trim()) return;

    try {
      await navigator.clipboard.writeText(localAiActionOutput);
      showToast('Local AI result copied');
    } catch {
      showToast('Could not copy the Local AI result', 'error');
    }
  };

  const handleRunLocalAiAction = async (
    action: 'clean_response' | 'explain_changes' | 'improve_summary',
    label: string,
  ) => {
    const trimmedText = pasteText.trim();

    if (!trimmedText) {
      showToast('Paste some AI output first', 'error');
      return;
    }

    if (!localAiActionsEnabled) {
      showToast('Enable Private Mode in the desktop app to use Local AI actions', 'info');
      return;
    }

    setLocalAiActionBusy(true);
    setLocalAiActionTitle(label);

    try {
      const result = await runLocalAiAction(action, {
        text: trimmedText,
        projectName: activeProject?.name,
        projectSummary: activeProject?.summary,
        diffSummary: diffs.length
          ? diffs.map((diff) => `${fieldLabel(diff.field)} ${diff.action}`).join(', ')
          : undefined,
      });

      if (action === 'clean_response') {
        handleTextChange(result);
        setLocalAiActionOutput(result);
        showToast('AI response cleaned locally');
        return;
      }

      setLocalAiActionOutput(result);
      showToast(`${label} ready`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : `Could not ${label.toLowerCase()}`, 'error');
    } finally {
      setLocalAiActionBusy(false);
    }
  };

  const handleZoneClick = () => {
    if (state === 'idle') {
      setState('typing');
    }

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      if (textareaRef.current) {
        scrollFieldIntoView(textareaRef.current);
      }
    });
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);

    const droppedText = event.dataTransfer.getData('text');
    if (!droppedText) {
      return;
    }

    handleTextChange(droppedText);
    setState('typing');
  };

 return (
  <div className="paste-zone-wrapper" data-tour="paste">
    {recentChanges.length > 0 && (
  <div className="changes-since-box">
    <h4>🧠 Changes since last time</h4>

    {recentChanges.length <= 3 ? (
      <ul>
        {recentChanges.map((change, i) => (
          <li key={i}>
            {change.action === 'added' && '+ '}
            {change.action === 'updated' && '~ '}
            {change.action === 'removed' && '- '}
            {fieldLabel(change.field)}
          </li>
        ))}
      </ul>
    ) : (
      <div className="changes-since-collapse">
        <button
          type="button"
          className="changes-since-toggle"
          onClick={() => setChangesExpanded((v) => !v)}
          aria-expanded={changesExpanded}
          title="Show or hide the recent project changes"
        >
          <span className="changes-since-toggle__count">
            {recentChanges.length} changes since last export
          </span>
          <span className="changes-since-toggle__chevron" aria-hidden="true">
            {changesExpanded ? '▲' : '▼'}
          </span>
        </button>
        {changesExpanded && (
          <ul className="changes-since-list">
            {recentChanges.map((change, i) => (
              <li key={i}>
                {change.action === 'added' && '+ '}
                {change.action === 'updated' && '~ '}
                {change.action === 'removed' && '- '}
                {fieldLabel(change.field)}
              </li>
            ))}
          </ul>
        )}
      </div>
    )}
  </div>
)}

    {state === 'diff' ? (
      <DiffPreview
        diffs={diffs}
        detectionMeta={detectionMeta}
        checkpoint={linkedCheckpoint}
        onApplySafe={() => handleApply(false)}
        onApplyAll={() => handleApply(true)}
        onDiscard={handleDiscard}
      />
    ) : (
        <div
          className={`paste-zone ${state === 'typing' ? 'has-content' : ''} ${
            isDragOver ? 'drag-over' : ''
          }`}
          onClick={handleZoneClick}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          title="Click here to paste or type an AI response"
        >
          {state === 'idle' ? (
            <>
              <div className="paste-zone-icon">📋</div>
              <div className="paste-zone-text">Paste an AI response here</div>
              <div className="paste-zone-hint">ChatGPT, Claude, Grok, Gemini, or any AI output works</div>
              <div className="paste-zone-hint">
                We&apos;ll detect project updates automatically and show what will change before anything is applied
              </div>
            </>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                id="paste-textarea"
                className="paste-zone-textarea"
                value={pasteText}
                onChange={(e) => handleTextChange(e.target.value)}
                onFocus={(e) => scrollFieldIntoView(e.currentTarget)}
                placeholder="Paste your AI&apos;s response here…"
                title="Paste the AI response you want Memephant to check"
                rows={6}
              />

              <div className="paste-zone-actions">
                <button
                  type="button"
                  className="paste-zone-analyse-btn"
                  onClick={() => void handleAnalyse()}
                  disabled={!pasteText.trim()}
                  title="Check the pasted AI response for project updates"
                >
                  Check for updates
                </button>
                <button
                  type="button"
                  className="paste-zone-clear-btn"
                  onClick={resetPasteState}
                  title="Clear the pasted response"
                >
                  Clear
                </button>
              </div>

              {localAiActionsEnabled && (
                <div className="paste-zone-actions paste-zone-actions--secondary">
                  <button
                    type="button"
                    className="paste-zone-hint-btn"
                    onClick={() => void handleRunLocalAiAction('clean_response', 'Clean AI response')}
                    disabled={localAiActionBusy || !pasteText.trim()}
                    title="Clean the pasted response using Local AI"
                  >
                    {localAiActionBusy && localAiActionTitle === 'Clean AI response'
                      ? 'Cleaning...'
                      : 'Clean AI response'}
                  </button>
                  <button
                    type="button"
                    className="paste-zone-hint-btn"
                    onClick={() => void handleRunLocalAiAction('explain_changes', 'Explain changes')}
                    disabled={localAiActionBusy || !pasteText.trim()}
                    title="Explain the detected changes using Local AI"
                  >
                    {localAiActionBusy && localAiActionTitle === 'Explain changes'
                      ? 'Explaining...'
                      : 'Explain changes'}
                  </button>
                  <button
                    type="button"
                    className="paste-zone-hint-btn"
                    onClick={() => void handleRunLocalAiAction('improve_summary', 'Improve summary')}
                    disabled={localAiActionBusy || !pasteText.trim()}
                    title="Improve the pasted summary using Local AI"
                  >
                    {localAiActionBusy && localAiActionTitle === 'Improve summary'
                      ? 'Improving...'
                      : 'Improve summary'}
                  </button>
                </div>
              )}

              {autoChecking && (
                <div className="paste-zone-hint" aria-live="polite">Auto-checking...</div>
              )}

              {localAiActionOutput && (
                <div className="paste-zone-no-update" style={{ textAlign: 'left' }}>
                  <p style={{ marginBottom: 8 }}>{localAiActionTitle || 'Local AI result'}</p>
                  <div className="paste-zone-hint" style={{ whiteSpace: 'pre-wrap', color: '#ccc' }}>
                    {localAiActionOutput}
                  </div>
                  <div className="paste-zone-no-update__actions">
                    <button
                      type="button"
                      className="paste-zone-hint-btn"
                      onClick={() => void handleCopyLocalAiOutput()}
                      title="Copy the Local AI result"
                    >
                      Copy result
                    </button>
                    <button
                      type="button"
                      className="paste-zone-hint-btn"
                      onClick={() => {
                        setLocalAiActionTitle('');
                        setLocalAiActionOutput('');
                      }}
                      title="Clear the Local AI result"
                    >
                      Clear result
                    </button>
                  </div>
                </div>
              )}

              {state === 'no-update' && (
                <div className="paste-zone-no-update">
                  <p>No project update found in that text.</p>
                  <button
                    type="button"
                    className="paste-zone-hint-btn"
                    onClick={() => void handleCopyHint()}
                    title="Copy a message that asks your AI to include a project update"
                  >
                    💡 Copy a prompt to ask your AI for an update
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default PasteZone;
