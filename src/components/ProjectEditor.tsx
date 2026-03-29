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

  const targetPlatformLabel =
    PLATFORM_CONFIG[targetPlatform]?.label || "ChatGPT";

  return (
    <div className="project-panel">
      <h2 className="panel-title">🧠 Current Project</h2>

      <h3 className="current-project-name">
        Currently editing: <span>{selectedProject.projectName}</span>
      </h3>

      <p className="meta-item editor-helper-text">
        Pick a saved project, update the details below, then copy it into your
        AI so it can carry on from where you left off.
      </p>

      <div className="input-row">
        <button onClick={onSaveProject} className="button">
          💾 Save Project
        </button>

        <button onClick={onUploadJsonClick} className="button">
          📂 Open Saved Project
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={onImportProject}
          style={{ display: "none" }}
        />

        <button onClick={onRollbackLastAiImport} className="button">
          ↩️ Undo Last AI Update
        </button>

        <button onClick={onCopyToClipboard} className="button export-button">
          📋 Copy for {targetPlatformLabel}
        </button>
      </div>

      <p className="meta-item">
        <strong>Project name:</strong> {selectedProject.projectName}
      </p>
      <p className="meta-item">
        <strong>Version:</strong> {selectedProject.schema_version}
      </p>
      <p className="meta-item">
        <strong>Created:</strong> {selectedProject.created}
      </p>
      <p className="meta-item">
        <strong>Last updated:</strong> {selectedProject.lastModified}
      </p>

      {latestChange && (
        <div className="latest-change-box">
          <strong>Latest change:</strong> {latestChange.description}
          <br />
          <span className="latest-change-meta">
            [{latestChange.date}] ({latestChange.source})
          </span>
        </div>
      )}

      <hr className="divider" />

      <h3 className="section-title">📄 What this project is about</h3>
      <p className="meta-item">
        Write a simple explanation of the project so any AI can quickly
        understand it.
      </p>
      <textarea
        value={selectedProject.summary}
        onChange={(e) => onUpdateSummary(e.target.value)}
        className="textarea"
        placeholder="Example: This is a desktop app that helps people move project context between ChatGPT, Claude, Grok, and other AI tools."
      />

      <h3 className="section-title">📍 Where things stand right now</h3>
      <p className="meta-item">
        Describe the current progress, what has been built, and what still needs
        doing.
      </p>
      <textarea
        value={selectedProject.currentState}
        onChange={(e) => onUpdateCurrentState(e.target.value)}
        className="textarea"
        placeholder="Example: The core project memory flow works. We are now improving the UX so non-technical users can understand the app quickly."
      />

      <h3 className="section-title">🤖 Which AI are you using?</h3>
      <p className="meta-item">
        Choose the AI you want to continue the project in.
      </p>
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

      <h3 className="section-title">📁 Scan Project Folder</h3>
      <p className="meta-item">
        Scan a real project folder so Project Brain can understand the important
        files and build better AI handoff context.
      </p>
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

      <h3 className="section-title">📁 Important Files Found</h3>
      <ul className="info-list">
        {selectedProject.importantAssets.length === 0 ? (
          <li>No important files detected yet</li>
        ) : (
          selectedProject.importantAssets.map((asset, index) => (
            <li key={index}>{asset}</li>
          ))
        )}
      </ul>

      <h3 className="section-title">📜 Project History</h3>
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

      <h3 className="section-title">🤖 Use with AI</h3>
      <p className="meta-item">
        Click the copy button above, then paste this into {targetPlatformLabel}{" "}
        so it can continue your project with the latest context.
      </p>
      <textarea
        value={exportPrompt}
        readOnly
        className="textarea export-textarea"
      />

      <h3 className="section-title">🤖 Update from AI</h3>
      <p className="meta-item">
        Paste the AI’s structured update here, then apply it to this project.
      </p>
      <textarea
        value={aiImportText}
        onChange={(e) => onAiImportTextChange(e.target.value)}
        className="textarea export-textarea"
        placeholder="Paste the AI update here..."
      />

      <div className="input-row">
        <button onClick={onImportAiUpdate} className="button">
          🤖 Apply AI Update
        </button>
      </div>
    </div>
  );
}

export default ProjectEditor;
