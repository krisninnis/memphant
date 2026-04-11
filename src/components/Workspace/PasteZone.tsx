import { useRef, useState } from 'react';
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

export function PasteZone() {
  const [pasteText, setPasteText] = useState('');
  const [state, setState] = useState<PasteState>('idle');
  const [diffs, setDiffs] = useState<DiffResult[]>([]);
  const [detectedUpdate, setDetectedUpdate] = useState<DetectedUpdate | null>(null);
  const [detectionMeta, setDetectionMeta] = useState<DetectionMeta>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeProject = useActiveProject();
  const updateProject = useProjectStore((s) => s.updateProject);
  const setPreAiBackup = useProjectStore((s) => s.setPreAiBackup);
  const showToast = useProjectStore((s) => s.showToast);

  const resetPasteState = () => {
    setPasteText('');
    setState('idle');
    setDiffs([]);
    setDetectedUpdate(null);
    setDetectionMeta(null);
    setIsDragOver(false);
  };

  const handleTextChange = (text: string) => {
    setPasteText(text);

    if (!text.trim()) {
      setState('idle');
      setDiffs([]);
      setDetectedUpdate(null);
      setDetectionMeta(null);
      return;
    }

    if (state !== 'typing') {
      setState('typing');
    }
  };

  const handleAnalyse = async () => {
    const trimmedText = pasteText.trim();

    if (!trimmedText) {
      return;
    }

    if (!activeProject) {
      showToast('Open a project first', 'error');
      return;
    }

    const result = detectUpdate(trimmedText);
    let update = result.update;
    let detectionSource = result.source;
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
  };

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