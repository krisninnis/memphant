import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { detectUpdate, computeDiff, applyUpdate, countDiffs } from '../../utils/diffEngine';
import DiffPreview from './DiffPreview';
import type { DiffResult } from '../../types/project-brain-types';

type PasteState = 'idle' | 'typing' | 'diff' | 'no-update';

export function PasteZone() {
  const [pasteText, setPasteText] = useState('');
  const [state, setState] = useState<PasteState>('idle');
  const [diffs, setDiffs] = useState<DiffResult[]>([]);
  const [detectedUpdate, setDetectedUpdate] = useState<ReturnType<typeof detectUpdate>>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const activeProject = useProjectStore((s) => s.activeProject());
  const updateProject = useProjectStore((s) => s.updateProject);
  const setPreAiBackup = useProjectStore((s) => s.setPreAiBackup);
  const showToast = useProjectStore((s) => s.showToast);

  const handleTextChange = (text: string) => {
    setPasteText(text);
    if (!text.trim()) {
      setState('idle');
      return;
    }
    setState('typing');
  };

  const handleAnalyse = () => {
    if (!pasteText.trim()) return;
    if (!activeProject) {
      showToast('Open a project first', 'error');
      return;
    }

    const update = detectUpdate(pasteText);
    if (!update) {
      setState('no-update');
      return;
    }

    const computed = computeDiff(activeProject, update);
    setDetectedUpdate(update);
    setDiffs(computed);
    setState('diff');
  };

  const handleApply = () => {
    if (!activeProject || !detectedUpdate) return;

    // Save rollback backup
    setPreAiBackup({ ...activeProject });

    // Apply the merge
    const merged = applyUpdate(activeProject, detectedUpdate);
    updateProject(activeProject.id, merged);

    const total = countDiffs(diffs);
    showToast(`Project updated with ${total} change${total !== 1 ? 's' : ''}`);
    handleDiscard();
  };

  const handleDiscard = () => {
    setPasteText('');
    setState('idle');
    setDiffs([]);
    setDetectedUpdate(null);
  };

  const copyHint = async () => {
    const hint = "Can you summarise what changed in my project? Please include a project update with any new goals, decisions, or next steps.";
    await navigator.clipboard.writeText(hint);
    showToast('Hint copied — paste it into your AI chat');
  };

  // Zone click → focus textarea
  const handleZoneClick = () => {
    if (state === 'idle') setState('typing');
    document.getElementById('paste-textarea')?.focus();
  };

  return (
    <div className="paste-zone-wrapper">
      {state === 'diff' ? (
        <DiffPreview diffs={diffs} onApply={handleApply} onDiscard={handleDiscard} />
      ) : (
        <div
          className={`paste-zone ${state === 'typing' ? 'has-content' : ''} ${isDragOver ? 'drag-over' : ''}`}
          onClick={handleZoneClick}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const text = e.dataTransfer.getData('text');
            if (text) { handleTextChange(text); setState('typing'); }
          }}
        >
          {state === 'idle' ? (
            <>
              <div className="paste-zone-icon">📋</div>
              <div className="paste-zone-text">Paste AI response here</div>
              <div className="paste-zone-hint">
                We'll automatically detect any project updates
              </div>
            </>
          ) : (
            <>
              <textarea
                id="paste-textarea"
                className="paste-zone-textarea"
                placeholder="Paste the AI's response here…"
                value={pasteText}
                onChange={(e) => handleTextChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <div className="paste-zone-actions">
                <button className="paste-zone-submit" onClick={handleAnalyse}>
                  Check for updates
                </button>
                <button className="paste-zone-cancel" onClick={handleDiscard}>
                  Clear
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {state === 'no-update' && (
        <div className="paste-zone-no-update">
          <p>No project updates found in this text.</p>
          <p className="paste-zone-no-update__hint">
            You can ask the AI to include one.
          </p>
          <div className="paste-zone-no-update__actions">
            <button className="paste-zone-hint-btn" onClick={() => void copyHint()}>
              Copy suggestion
            </button>
            <button className="paste-zone-cancel" onClick={handleDiscard}>
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PasteZone;
