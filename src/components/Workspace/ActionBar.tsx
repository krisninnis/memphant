import { useProjectStore } from '../../store/projectStore';
import { linkFolder, rescanLinkedFolder } from '../../services/tauriActions';
import ExportButtons from './ExportButtons';
import TaskField from './TaskField';

export function ActionBar() {
  const activeProject = useProjectStore((s) => s.activeProject());
  const preAiBackup = useProjectStore((s) => s.preAiBackup);
  const setPreAiBackup = useProjectStore((s) => s.setPreAiBackup);
  const updateProject = useProjectStore((s) => s.updateProject);
  const showToast = useProjectStore((s) => s.showToast);

  const handleRollback = () => {
    if (!preAiBackup) {
      showToast('Nothing to undo.');
      return;
    }
    updateProject(preAiBackup.id, preAiBackup);
    setPreAiBackup(null);
    showToast('Last AI update rolled back.');
  };

  if (!activeProject) {
    return (
      <div className="action-bar">
        <p className="action-bar__empty">Select or create a project to get started.</p>
      </div>
    );
  }

  const hasLinkedFolder = !!activeProject.linkedFolder?.path;

  return (
    <div className="action-bar">
      <div className="action-bar__top-row">
        <ExportButtons />
      </div>
      <TaskField />
      <div className="action-bar__secondary">
        {!hasLinkedFolder ? (
          <button className="action-bar__btn" onClick={() => void linkFolder()}>
            Link project folder
          </button>
        ) : (
          <button className="action-bar__btn" onClick={() => void rescanLinkedFolder()}>
            Rescan linked folder
          </button>
        )}

        {preAiBackup && (
          <button className="action-bar__btn action-bar__btn--undo" onClick={handleRollback}>
            Undo last AI update
          </button>
        )}
      </div>
    </div>
  );
}

export default ActionBar;
