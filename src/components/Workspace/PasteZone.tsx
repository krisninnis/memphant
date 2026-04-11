import { useCallback, useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useActiveProject } from '../../hooks/useActiveProject';
import { detectUpdate, computeDiff, applyUpdate, countDiffs } from '../../utils/diffEngine';
import { extractStructuredProjectUpdate } from '../../services/localAiService';
import DiffPreview from './DiffPreview';
import type { DetectedUpdate } from '../../utils/diffEngine';
import type { DiffResult } from '../../types/memphant-types';

type PasteState = 'idle' | 'typing' | 'diff' | 'no-update';

type DetectionMeta = {
  source: string;
  confidence: number;
} | null;

const LOCAL_AI_MIN_CONFIDENCE = 0.45;
const LOCAL_AI_HIGH_CONFIDENCE = 0.75;
const AUTO_ANALYSE_DEBOUNCE_MS = 800;
const AUTO_ANALYSE_MIN_LENGTH = 50;

export function PasteZone() {
  const [pasteText, setPasteText] = useState('');
  const [state, setState] = useState<PasteState>('idle');
  const [diffs, setDiffs] = useState<DiffResult[]>([]);
  const [detectedUpdate, setDetectedUpdate] = useState<DetectedUpdate | null>(null);
  const [detectionMeta, setDetectionMeta] = useState<DetectionMeta>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [autoChecking, setAutoChecking] = useState(false);

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
    setState('idle');
    setDiffs([]);
    setDetectedUpdate(null);
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
      setDetectionMeta(null);
      setDiffs([]);
      setState('no-update');
      return;
    }

    const computedDiffs = computeDiff(activeProject, update);

    if (computedDiffs.length === 0) {
      setDetectedUpdate(null);
      setDetectionMeta(null);
      setDiffs([]);
      setState('no-update');
      showToast('No new project changes were found in that text.', 'info');
      return;
    }

    setDetectedUpdate(update);
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
  }, [activeProject, showToast]);

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

  const handleApply = () => {
    if (!activeProject || !detectedUpdate) {
      return;
    }

    setPreAiBackup({
      ...activeProject,
      decisions: activeProject.decisions.map((decision) => ({ ...decision })),
      changelog: activeProject.changelog.map((entry) => ({ ...entry })),
      importantAssets: [...activeProject.importantAssets],
      goals: [...activeProject.goals],
      rules: [...activeProject.rules],
      nextSteps: [...activeProject.nextSteps],
      openQuestions: [...activeProject.openQuestions],
      platformState: { ...activeProject.platformState },
      linkedFolder: activeProject.linkedFolder ? { ...activeProject.linkedFolder } : undefined,
    });

    const mergedProject = applyUpdate(activeProject, detectedUpdate);
    updateProject(activeProject.id, mergedProject);

    const totalChanges = countDiffs(diffs);
    showToast(`Project updated with ${totalChanges} change${totalChanges !== 1 ? 's' : ''}`);

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

  const handleZoneClick = () => {
    if (state === 'idle') {
      setState('typing');
    }

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
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
      {state === 'diff' ? (
        <DiffPreview
          diffs={diffs}
          detectionMeta={detectionMeta}
          onApply={handleApply}
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
        >
          {state === 'idle' ? (
            <>
              <div className="paste-zone-icon">📋</div>
              <div className="paste-zone-text">Paste AI response here</div>
              <div className="paste-zone-hint">We&apos;ll automatically detect any project updates</div>
            </>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                id="paste-textarea"
                className="paste-zone-textarea"
                value={pasteText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Paste your AI&apos;s response here…"
                rows={6}
              />

              <div className="paste-zone-actions">
                <button
                  type="button"
                  className="paste-zone-analyse-btn"
                  onClick={() => void handleAnalyse()}
                  disabled={!pasteText.trim()}
                >
                  Check for updates
                </button>
                <button
                  type="button"
                  className="paste-zone-clear-btn"
                  onClick={resetPasteState}
                >
                  Clear
                </button>
              </div>

              {autoChecking && (
                <div className="paste-zone-hint" aria-live="polite">Auto-checking...</div>
              )}

              {state === 'no-update' && (
                <div className="paste-zone-no-update">
                  <p>No project update found in that text.</p>
                  <button
                    type="button"
                    className="paste-zone-hint-btn"
                    onClick={() => void handleCopyHint()}
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
