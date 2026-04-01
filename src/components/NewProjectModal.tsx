import { RefObject } from "react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  setProjectName: (value: string) => void;
  createProject: () => void | Promise<void>;
  openSavedProject: () => void;
  scanProjectFolder: () => void;
  projectNameInputRef: RefObject<HTMLInputElement | null>;
};

function NewProjectModal({
  isOpen,
  onClose,
  projectName,
  setProjectName,
  createProject,
  openSavedProject,
  scanProjectFolder,
  projectNameInputRef,
}: Props) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Create or open a project"
      >
        <div className="modal-header-row">
          <h2 className="modal-title">Create or open a project</h2>
          <button className="modal-close-button" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="modal-subtitle">
          Choose how you want to begin. A non-technical user should be able to
          understand this in seconds.
        </p>

        <div className="modal-option-list">
          <button
            type="button"
            className="modal-option active modal-option-button"
            onClick={scanProjectFolder}
          >
            <div className="modal-option-icon">📁</div>
            <div className="modal-option-content">
              <div className="modal-option-title">Scan a project folder</div>
              <div className="modal-option-text">
                Best if you already have code on your computer. Project Brain
                will scan it, create the project, and link it for future
                rescans.
              </div>
            </div>
          </button>

          <button
            type="button"
            className="modal-option modal-option-button"
            onClick={() => {
              projectNameInputRef.current?.focus();
            }}
          >
            <div className="modal-option-icon">＋</div>
            <div className="modal-option-content">
              <div className="modal-option-title">Start from scratch</div>
              <div className="modal-option-text">
                Create a blank project and name it yourself.
              </div>
            </div>
          </button>

          <button
            type="button"
            className="modal-option modal-option-button"
            onClick={openSavedProject}
          >
            <div className="modal-option-icon">📥</div>
            <div className="modal-option-content">
              <div className="modal-option-title">Open saved project</div>
              <div className="modal-option-text">
                Open a previously saved Project Brain JSON file.
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
                void createProject();
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
          <button
            className="button export-button"
            onClick={() => {
              void createProject();
            }}
          >
            + Create Project
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewProjectModal;
