import { ChangeEvent, RefObject } from "react";
import { AIPlatform, PLATFORM_CONFIG } from "../config/aiPlatforms";
import { ProjectMemory } from "../types/project";

type Props = {
  selectedProject: ProjectMemory;
  aiImportText: string;
  exportPrompt: string;
  targetPlatform: AIPlatform;
  onTargetPlatformChange: (platform: AIPlatform) => void;
  onSaveProject: () => void;
  onRollbackLastAiImport: () => void;
  onCopyToClipboard: () => void;
  onUpdateSummary: (value: string) => void;
  onUpdateCurrentState: (value: string) => void;
  onAiImportTextChange: (value: string) => void;
  onImportAiUpdate: () => void;
  onUploadJsonClick: () => void;
  onImportProject: (e: ChangeEvent<HTMLInputElement>) => void;
  onProjectFolderUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
};

function ProjectEditor({
  selectedProject,
  aiImportText,
  exportPrompt,
  targetPlatform,
  onTargetPlatformChange,
  onSaveProject,
  onRollbackLastAiImport,
  onCopyToClipboard,
  onUpdateSummary,
  onUpdateCurrentState,
  onAiImportTextChange,
  onImportAiUpdate,
  onUploadJsonClick,
  onImportProject,
  onProjectFolderUpload,
  fileInputRef,
}: Props) {
  const latestChange =
    selectedProject.changelog.length > 0
      ? selectedProject.changelog[selectedProject.changelog.length - 1]
      : null;

  return (
    <div className="project-panel">
      <h2 className="panel-title">🧠 Project Loaded</h2>

      <div className="input-row">
        <button onClick={onSaveProject} className="button">
          💾 Save Project
        </button>

        <button onClick={onUploadJsonClick} className="button">
          📂 Upload JSON
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={onImportProject}
          style={{ display: "none" }}
        />

        <button onClick={onRollbackLastAiImport} className="button">
          ↩️ Rollback AI Import
        </button>

        <button onClick={onCopyToClipboard} className="button export-button">
          📋 Copy for AI
        </button>
      </div>

      <p className="meta-item">
        <strong>Name:</strong> {selectedProject.projectName}
      </p>
      <p className="meta-item">
        <strong>Version:</strong> {selectedProject.schema_version}
      </p>
      <p className="meta-item">
        <strong>Created:</strong> {selectedProject.created}
      </p>
      <p className="meta-item">
        <strong>Last Modified:</strong> {selectedProject.lastModified}
      </p>

      {latestChange && (
        <div className="latest-change-box">
          <strong>Latest Change:</strong> {latestChange.description}
          <br />
          <span className="latest-change-meta">
            [{latestChange.date}] ({latestChange.source})
          </span>
        </div>
      )}

      <hr className="divider" />

      <h3 className="section-title">📄 Summary</h3>
      <textarea
        value={selectedProject.summary}
        onChange={(e) => onUpdateSummary(e.target.value)}
        className="textarea"
        placeholder="Write a summary for this project..."
      />

      <h3 className="section-title">📍 Current State</h3>
      <textarea
        value={selectedProject.currentState}
        onChange={(e) => onUpdateCurrentState(e.target.value)}
        className="textarea"
        placeholder="Describe the current state..."
      />

      <h3 className="section-title">🎯 Target AI Platform</h3>
      <select
        value={targetPlatform}
        onChange={(e) => onTargetPlatformChange(e.target.value as AIPlatform)}
        className="input"
      >
        {Object.entries(PLATFORM_CONFIG).map(([key, config]) => (
          <option key={key} value={key}>
            {config.label}
          </option>
        ))}
      </select>

      <h3 className="section-title">📁 Project Folder</h3>
      <input
        type="file"
        webkitdirectory=""
        multiple
        onChange={onProjectFolderUpload}
      />

      <h3 className="section-title">🎯 Goals</h3>
      <ul className="info-list">
        {selectedProject.goals.length === 0 ? (
          <li>No goals yet</li>
        ) : (
          selectedProject.goals.map((goal, index) => (
            <li key={index}>{goal}</li>
          ))
        )}
      </ul>

      <h3 className="section-title">📏 Rules</h3>
      <ul className="info-list">
        {selectedProject.rules.length === 0 ? (
          <li>No rules yet</li>
        ) : (
          selectedProject.rules.map((rule, index) => (
            <li key={index}>{rule}</li>
          ))
        )}
      </ul>

      <h3 className="section-title">⚖️ Decisions</h3>
      <ul className="info-list">
        {selectedProject.decisions.length === 0 ? (
          <li>No decisions yet</li>
        ) : (
          selectedProject.decisions.map((decision, index) => (
            <li key={index}>{decision}</li>
          ))
        )}
      </ul>

      <h3 className="section-title">🪜 Next Steps</h3>
      <ul className="info-list">
        {selectedProject.nextSteps.length === 0 ? (
          <li>No next steps yet</li>
        ) : (
          selectedProject.nextSteps.map((step, index) => (
            <li key={index}>{step}</li>
          ))
        )}
      </ul>

      <h3 className="section-title">❓ Open Questions</h3>
      <ul className="info-list">
        {selectedProject.openQuestions.length === 0 ? (
          <li>No open questions</li>
        ) : (
          selectedProject.openQuestions.map((question, index) => (
            <li key={index}>{question}</li>
          ))
        )}
      </ul>

      <h3 className="section-title">📁 Important Assets</h3>
      <ul className="info-list">
        {selectedProject.importantAssets.length === 0 ? (
          <li>No important assets detected yet</li>
        ) : (
          selectedProject.importantAssets.map((asset, index) => (
            <li key={index}>{asset}</li>
          ))
        )}
      </ul>

      <h3 className="section-title">📜 Changelog</h3>
      <ul className="info-list">
        {selectedProject.changelog.length === 0 ? (
          <li>No history yet</li>
        ) : (
          selectedProject.changelog.map((entry, index) => (
            <li key={index}>
              [{entry.date}] ({entry.source}) — {entry.description}
            </li>
          ))
        )}
      </ul>

      <hr className="divider" />

      <h3 className="section-title">📤 Export for AI</h3>
      <textarea
        value={exportPrompt}
        readOnly
        className="textarea export-textarea"
      />

      <h3 className="section-title">📥 Import AI Update</h3>
      <textarea
        value={aiImportText}
        onChange={(e) => onAiImportTextChange(e.target.value)}
        className="textarea export-textarea"
        placeholder="Paste the AI JSON update here..."
      />

      <div className="input-row">
        <button onClick={onImportAiUpdate} className="button">
          📥 Import AI Update
        </button>
      </div>
    </div>
  );
}

export default ProjectEditor;
