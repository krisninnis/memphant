import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  createTemplateProjectFolder,
  openCreatedProjectFolder,
  saveToDisk,
} from '../../services/tauriActions';
import type { LaunchpadTemplateId } from '../../services/tauriActions';
import type { ProjectMemory } from '../../types/memphant-types';
import { SCHEMA_VERSION } from '../../types/memphant-types';
import './LaunchpadWizard.css';

type LaunchpadMode = 'scan' | 'template' | 'blank';
type LaunchpadStep = 'select' | 'template-details' | 'success';

interface LaunchpadWizardProps {
  onClose: () => void;
  onScanExisting: () => void;
  onCreateBlankMemory: () => void;
}

const options: Array<{
  id: LaunchpadMode;
  title: string;
  description: string;
  icon: string;
}> = [
  {
    id: 'scan',
    title: 'Scan existing project',
    description: 'Choose a folder you are already building and let Memephant create AI-ready context.',
    icon: 'üìÇ',
  },
  {
    id: 'template',
    title: 'Start from template',
    description: 'Create a real local project folder with starter files and Memephant memory from day one.',
    icon: '‚ú®',
  },
  {
    id: 'blank',
    title: 'Blank memory project',
    description: 'Create a lightweight Memephant project without linking a local folder yet.',
    icon: 'üìù',
  },
];

const templateOptions: Array<{
  id: LaunchpadTemplateId;
  title: string;
  description: string;
}> = [
  {
    id: 'blank-project',
    title: 'Blank project',
    description: 'README, .gitignore, and Memephant project memory.',
  },
  {
    id: 'react-vite',
    title: 'React + Vite',
    description: 'Starter React app with src, public, and package.json.',
  },
  {
    id: 'landing-page',
    title: 'Landing page',
    description: 'Simple HTML, CSS, and JavaScript landing page.',
  },
];

function buildProjectId(name: string): string {
  const safe = name.trim().replace(/\s+/g, '_').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `${safe || 'project'}_${Date.now()}`;
}

export function LaunchpadWizard({
  onClose,
  onScanExisting,
  onCreateBlankMemory,
}: LaunchpadWizardProps) {
  const addProject = useProjectStore((s) => s.addProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const setCurrentView = useProjectStore((s) => s.setCurrentView);
  const showToast = useProjectStore((s) => s.showToast);

  const [step, setStep] = useState<LaunchpadStep>('select');
  const [selectedMode, setSelectedMode] = useState<LaunchpadMode>('template');
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState<LaunchpadTemplateId>('blank-project');
  const [targetParentFolder, setTargetParentFolder] = useState('');
  const [createdFolderPath, setCreatedFolderPath] = useState('');
  const [createdFiles, setCreatedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleContinue = () => {
    if (selectedMode === 'scan') {
      onScanExisting();
      return;
    }

    if (selectedMode === 'blank') {
      onCreateBlankMemory();
      return;
    }

    setStep('template-details');
  };

  const handleChooseFolder = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Choose where to create your project',
      });

      if (Array.isArray(selected)) {
        setTargetParentFolder(typeof selected[0] === 'string' ? selected[0] : '');
        return;
      }

      setTargetParentFolder(typeof selected === 'string' ? selected : '');
    } catch {
      setError('Could not open the folder picker.');
    }
  };

  const handleCreateTemplateProject = async () => {
    if (!projectName.trim()) {
      setError('Project name is required.');
      return;
    }

    if (!targetParentFolder.trim()) {
      setError('Choose where to save the project first.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await createTemplateProjectFolder({
        projectName,
        description: description.trim() || `A new project called ${projectName.trim()}.`,
        templateId,
        targetParentFolder,
      });

      const now = new Date().toISOString();
      const project: ProjectMemory = {
        schema_version: SCHEMA_VERSION,
        id: buildProjectId(projectName),
        name: projectName.trim(),
        updatedAt: now,
        summary: description.trim(),
        goals: [],
        rules: [],
        decisions: [],
        currentState: `Project created from Launchpad template. ${result.filesCreated.length} starter files generated.`,
        nextSteps: ['Open the generated folder in your editor', 'Copy project context into your preferred AI tool'],
        openQuestions: [],
        importantAssets: result.filesCreated.slice(0, 200),
        aiInstructions: '',
        linkedFolder: {
          path: result.folderPath,
          scanHash: result.scanHash,
          lastScannedAt: now,
        },
        checkpoints: [],
        restorePoints: [],
        changelog: [
          {
            timestamp: now,
            field: 'general',
            action: 'added',
            summary: 'Project created from Launchpad template',
            source: 'app',
          },
        ],
        platformState: {},
      };

      await saveToDisk(project);
      addProject(project);
      setActiveProject(project.id);
      setCurrentView('projects');

      setCreatedFolderPath(result.folderPath);
      setCreatedFiles(result.filesCreated);
      setStep('success');

      void openCreatedProjectFolder(result.folderPath);
      showToast(`"${project.name}" created and linked.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create template project.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartAiHandoff = async () => {
    const template = templateOptions.find((option) => option.id === templateId);
    const projectDescription =
      description.trim() || 'A new project created from Memephant Launchpad.';
    const filesCreated =
      createdFiles.length > 0
        ? createdFiles.map((file) => `- ${file}`).join('\n')
        : '- No starter files were recorded.';
    const handoff = `# Memephant AI handoff

## Project
- Name: ${projectName.trim()}
- Description: ${projectDescription}
- Template: ${template?.title ?? templateId}
- Folder: ${createdFolderPath}

## Files created
${filesCreated}

## Current state
The local project folder has been created, starter files are in place, and Memephant is already tracking this project for AI handoff.

## Important
You are CONTINUING this project - do not reset, simplify, or replace it.
Work with the structure and files above.

## Continue this project
- Review the project structure and starter files
- Suggest the best next implementation steps
- Help turn this into a working first version
- Keep updates structured so they can be synced back into Memephant

## Output rules
- Be practical and implementation-focused
- Do not invent missing files, systems, APIs, or environment variables
- Do not request secrets, tokens, or .env values
- Keep changes realistic and incremental
- Only include fields that actually changed. Omit uncertain fields.

## memphant_update required
memphant_update
\`\`\`json
{
  "schemaVersion": "1.1.0",
  "currentState": "What is true after your response",
  "lastSessionSummary": "Briefly summarize what happened in this AI session",
  "nextSteps": ["Next concrete step"]
}
\`\`\`
`;

    try {
      await navigator.clipboard.writeText(handoff);
      showToast('AI handoff copied ó paste it into your AI tool.');
      onClose();
    } catch {
      showToast('Could not copy AI handoff to clipboard.', 'error');
    }
  };

  return (
    <div className="launchpad-backdrop" role="presentation">
      <div className="launchpad-modal" role="dialog" aria-modal="true" aria-label="Create a new project">
        <div className="launchpad-header">
          <div>
            <p className="launchpad-eyebrow">Memephant Launchpad</p>
            <h2>Start a project that never loses context</h2>
            <p>
              Create a new memory, scan an existing folder, or scaffold a local starter project
              that Memephant can track from day one.
            </p>
          </div>

          <button type="button" className="launchpad-close" onClick={onClose} aria-label="Close">
            ◊
          </button>
        </div>

        {step === 'select' && (
          <>
            <div className="launchpad-options">
              {options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`launchpad-option ${selectedMode === option.id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedMode(option.id)}
                >
                  <span className="launchpad-option__icon">{option.icon}</span>
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                </button>
              ))}
            </div>

            <div className="launchpad-footer">
              <button type="button" className="launchpad-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="launchpad-primary" onClick={handleContinue}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 'template-details' && (
          <>
            <div className="launchpad-form">
              <label>
                Project name
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="My new app"
                  autoFocus
                />
              </label>

              <label>
                What are you building?
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="A short description Memephant can use as project context..."
                  rows={4}
                />
              </label>

              <div className="launchpad-template-grid">
                {templateOptions.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`launchpad-template-card ${templateId === template.id ? 'is-selected' : ''}`}
                    onClick={() => setTemplateId(template.id)}
                  >
                    <strong>{template.title}</strong>
                    <small>{template.description}</small>
                  </button>
                ))}
              </div>

              <div className="launchpad-folder-picker">
                <div>
                  <strong>Save location</strong>
                  <small>{targetParentFolder || 'Choose a folder where Memephant will create this project.'}</small>
                </div>
                <button type="button" className="launchpad-secondary" onClick={() => void handleChooseFolder()}>
                  Choose folder
                </button>
              </div>

              {error && <div className="launchpad-error">{error}</div>}
            </div>

            <div className="launchpad-footer">
              <button type="button" className="launchpad-secondary" onClick={() => setStep('select')}>
                Back
              </button>
              <button
                type="button"
                className="launchpad-primary"
                disabled={loading || !projectName.trim() || !targetParentFolder.trim()}
                onClick={() => void handleCreateTemplateProject()}
              >
                {loading ? 'CreatingÖ' : 'Create project'}
              </button>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <div className="launchpad-success">
              <div className="launchpad-success__icon">?</div>
              <h3>Project created and linked</h3>
              <p>
                Your project is ready. Copy the AI handoff and paste it into ChatGPT, Claude, or
                any AI tool to continue instantly.
              </p>
              <small className="launchpad-success__note">
                Memephant created and linked your local folder so this project can keep its context
                from day one.
              </small>

              <div className="launchpad-success__path">{createdFolderPath}</div>

              <div className="launchpad-success__files">
                <strong>Files created</strong>
                <ul>
                  {createdFiles.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="launchpad-footer">
              <button
                type="button"
                className="launchpad-secondary"
                onClick={() => void openCreatedProjectFolder(createdFolderPath)}
              >
                Open folder
              </button>
              <button
                type="button"
                className="launchpad-primary"
                onClick={() => void handleStartAiHandoff()}
              >
                Copy AI handoff
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default LaunchpadWizard;







