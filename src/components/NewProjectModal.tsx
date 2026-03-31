import { RefObject, useEffect } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  setProjectName: (value: string) => void;
  createProject: () => void;
  openImportDialog: () => void;
  useExistingFolder: () => void;
  projectNameInputRef: RefObject<HTMLInputElement | null>;
};

function NewProjectModal({
  isOpen,
  onClose,
  projectName,
  setProjectName,
  createProject,
  openImportDialog,
  useExistingFolder,
  projectNameInputRef,
}: Props) {
  useEffect(() => {
    if (!isOpen) return;

    const timeout = window.setTimeout(() => {
      projectNameInputRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(timeout);
  }, [isOpen, projectNameInputRef]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Create a new project"
      >
        <div className="modal-header-row">
          <h2 className="modal-title">Create a new project</h2>
          <button className="modal-close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="modal-subtitle">
          Choose how you want to start. This will become the home for your
          cross-AI project handoff.
        </p>

        <div className="modal-option-list">
          <button
            type="button"
            className="modal-option active modal-option-button"
            onClick={() => {
              projectNameInputRef.current?.focus();
            }}
          >
            <div className="modal-option-icon">＋</div>
            <div className="modal-option-content">
              <div className="modal-option-title">Start from scratch</div>
              <div className="modal-option-text">
                Create a fresh Project Brain workspace and name it yourself.
              </div>
            </div>
          </button>

          <button
            type="button"
            className="modal-option modal-option-button"
            onClick={() => {
              openImportDialog();
              onClose();
            }}
          >
            <div className="modal-option-icon">📥</div>
            <div className="modal-option-content">
              <div className="modal-option-title">Import a project</div>
              <div className="modal-option-text">
                Bring in an existing saved Project Brain project.
              </div>
            </div>
          </button>

          <button
            type="button"
            className="modal-option modal-option-button"
            onClick={() => {
              useExistingFolder();
              onClose();
            }}
          >
            <div className="modal-option-icon">📁</div>
            <div className="modal-option-content">
              <div className="modal-option-title">Use an existing folder</div>
              <div className="modal-option-text">
                Link a real code folder and build the project around it.
              </div>
            </div>
          </button>
        </div>

        <div className="modal-form-section">
          <label className="modal-label">Project name</label>
          <input
            ref={projectNameInputRef}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                createProject();
              }
            }}
            placeholder="Type a new project name..."
            className="input"
          />
        </div>

        <div className="modal-actions">
          <button className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button export-button" onClick={createProject}>
            + Create Project
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewProjectModal;
