import { ChangeEvent, RefObject } from "react";
import { AIPlatform, PLATFORM_CONFIG } from "../config/aiPlatforms";
import { ProjectMemory } from "../types/project";

type Props = {
  selectedProject: ProjectMemory;
  aiImportText: string;
  exportPrompt: string;
  deltaSummary: string[];
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
  deltaSummary,
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

  const platformState = selectedProject.platformState?.[targetPlatform];

  const getLastSeenText = () => {
    if (!platformState?.lastSentSnapshotId) {
      return `${targetPlatformLabel} has not seen this project yet.`;
    }

    if (!platformState.lastReplyAt) {
      return `${targetPlatformLabel} has been sent this project and is waiting for a reply.`;
    }

    const lastReply = new Date(platformState.lastReplyAt);
    const now = new Date();
    const diffMs = now.getTime() - lastReply.getTime();

    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(diffMs / 86400000);

    if (minutes < 1) {
      return `${targetPlatformLabel} just replied.`;
    }

    if (minutes < 60) {
      return `${targetPlatformLabel} last replied ${minutes} minute${
        minutes > 1 ? "s" : ""
      } ago.`;
    }

    if (hours < 24) {
      return `${targetPlatformLabel} last replied ${hours} hour${
        hours > 1 ? "s" : ""
      } ago.`;
    }

    if (days < 7) {
      return `${targetPlatformLabel} last replied ${days} day${
        days > 1 ? "s" : ""
      } ago.`;
    }

    return `${targetPlatformLabel} last replied on ${lastReply.toLocaleDateString()}.`;
  };

  return (
    <div className="project-panel">
      <h2 className="panel-title">🧠 Current Project</h2>

      <h3 className="current-project-name">
        Currently editing: <span>{selectedProject.projectName}</span>
      </h3>

      <p className="meta-item editor-helper-text">
        Build or update your project context here, then send it to another AI so
        it can continue from the right point.
      </p>

      <div className="input-row">
        <button onClick={onSaveProject} className="button">
          💾 Save Project
        </button>

        <button onClick={onCopyToClipboard} className="button export-button">
          📋 Copy for {targetPlatformLabel}
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

      <hr className="divider" />

      <h3 className="section-title">🤖 Choose your next AI</h3>
      <p className="meta-item">
        Pick the AI platform you want to continue this project in.
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

      <p className="meta-item editor-helper-text">{getLastSeenText()}</p>

      <h3 className="section-title">📁 Scan project and build handoff</h3>
      <p className="meta-item editor-helper-text">
        This is the quickest way to prepare context for another AI. Project
        Brain will scan the project safely, skip secret files like{" "}
        <strong>.env</strong>, rebuild the context, and make the handoff ready
        to copy.
      </p>

      <div className="input-row">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="button"
        >
          📁 Scan Project & Build Handoff
        </button>
      </div>

      <input
        type="file"
        webkitdirectory=""
        multiple
        onChange={onProjectFolderUpload}
      />

      <p className="meta-item editor-helper-text">
        After scanning, review the summary below, then click{" "}
        <strong>Copy for {targetPlatformLabel}</strong>.
      </p>

      <h3 className="section-title">
        🧠 What changed since {targetPlatformLabel} last saw this?
      </h3>
      <ul className="info-list">
        {deltaSummary.length === 0 ? (
          <li>No changes detected.</li>
        ) : (
          deltaSummary.map((item, index) => <li key={index}>{item}</li>)
        )}
      </ul>

      <hr className="divider" />

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
      <p className="meta-item editor-helper-text">
        These are the main files Project Brain thinks matter for understanding
        the project and handing it off safely.
      </p>
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

      <h3 className="section-title">
        🤖 Send this project to {targetPlatformLabel}
      </h3>
      <p className="meta-item editor-helper-text">
        This is the handoff context that will be copied into{" "}
        {targetPlatformLabel}. Click{" "}
        <strong>Copy for {targetPlatformLabel}</strong>, then paste it into your
        AI chat to continue from where you left off.
      </p>
      <textarea
        value={exportPrompt}
        readOnly
        className="textarea export-textarea"
      />

      <h3 className="section-title">
        🤖 Bring updates back from {targetPlatformLabel}
      </h3>
      <p className="meta-item editor-helper-text">
        When your AI gives you a Project Brain update, paste it here to add the
        new progress, decisions, and next steps back into this project.
      </p>
      <textarea
        value={aiImportText}
        onChange={(e) => onAiImportTextChange(e.target.value)}
        className="textarea export-textarea"
        placeholder={`Paste the ${targetPlatformLabel} update here...`}
      />

      <div className="input-row">
        <button onClick={onImportAiUpdate} className="button">
          🤖 Add update to project
        </button>
      </div>
    </div>
  );
}

export default ProjectEditor;
