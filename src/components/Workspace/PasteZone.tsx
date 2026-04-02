import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { parseAiUpdate, mergeAiUpdate, countUpdateChanges } from '../../utils/aiMerge';

export function PasteZone() {
  const [pasteText, setPasteText] = useState('');
  const activeProject = useProjectStore((s) => s.activeProject());
  const updateProject = useProjectStore((s) => s.updateProject);
  const setPreAiBackup = useProjectStore((s) => s.setPreAiBackup);
  const showToast = useProjectStore((s) => s.showToast);

  const handlePaste = () => {
    if (!activeProject) {
      showToast('Open a project first.');
      return;
    }

    if (!pasteText.trim()) {
      showToast('Paste an AI response first.');
      return;
    }

    const update = parseAiUpdate(pasteText);
    if (!update) {
      showToast('That doesn\u2019t look like a valid Project Brain update. Check the format and try again.');
      return;
    }

    // Save backup for rollback
    setPreAiBackup({ ...activeProject });

    // Merge the update
    const merged = mergeAiUpdate(activeProject, update);
    updateProject(activeProject.id, merged);

    const summary = countUpdateChanges(update);
    showToast(`AI update applied: ${summary}.`);
    setPasteText('');
  };

  return (
    <div className="paste-zone">
      <label className="paste-zone__label">Paste AI response here</label>
      <textarea
        className="paste-zone__textarea"
        placeholder="Paste the JSON update from your AI here\u2026"
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
      />
      <div className="paste-zone__actions">
        <button className="paste-zone__button" onClick={handlePaste}>
          Add update to project
        </button>
        {pasteText.trim() && (
          <button
            className="paste-zone__clear"
            onClick={() => setPasteText('')}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export default PasteZone;
