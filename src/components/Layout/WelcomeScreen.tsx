/**
 * WelcomeScreen - shown when no projects exist.
 *
 * Two modes:
 *   1. Landing: choose guided setup, templates, or folder scan / import
 *   2. Wizard: 3-step guided flow that creates a useful first project
 */
import { useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  isDesktopApp,
  createProjectFromFolder,
  createProjectFromTemplate,
  importProjectFromFile,
  saveToDisk,
} from '../../services/tauriActions';
import type { ProjectMemory } from '../../types/memphant-types';
import { PROJECT_TEMPLATES } from '../../utils/projectTemplates';
import type { ProjectTemplate } from '../../utils/projectTemplates';
import './WelcomeScreen.css';

type Mode = 'landing' | 'wizard' | 'templates';
type Step = 1 | 2 | 3;

const STEP_TITLES: Record<Step, string> = {
  1: "What's your project called?",
  2: 'What is it about?',
  3: 'What needs to happen next?',
};

const STEP_HINTS: Record<Step, string> = {
  1: 'Give it a clear name - this is how you will find it later.',
  2: 'One or two sentences is enough. Your AI will read this every session to get up to speed.',
  3: 'Add the one thing you want to tackle in your first AI session.',
};

const STEP_PLACEHOLDERS: Record<Step, string> = {
  1: 'e.g. Landing page redesign, Mobile app MVP, Research paper...',
  2: 'e.g. A Tauri desktop app that lets users carry project context between AI platforms without losing continuity.',
  3: 'e.g. Design the onboarding flow. Fix the login bug. Write the executive summary.',
};

function buildFirstProject(name: string, summary: string, firstStep: string): ProjectMemory {
  const now = new Date().toISOString();
  const id = `${name.trim().replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;

  return {
    schema_version: 1,
    id,
    name: name.trim(),
    summary: summary.trim(),
    goals: [],
    rules: [],
    decisions: [],
    currentState: summary.trim()
      ? `Project just created. ${summary.trim()}`
      : 'Project just created.',
    nextSteps: firstStep.trim() ? [firstStep.trim()] : [],
    openQuestions: [],
    importantAssets: [],
    checkpoints: [],
    restorePoints: [],
    changelog: [
      {
        timestamp: now,
        field: 'general',
        action: 'added',
        summary: 'Project created via guided setup',
        source: 'app',
      },
    ],
    platformState: {},
  };
}

export function WelcomeScreen() {
  const [mode, setMode] = useState<Mode>('landing');
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [firstStep, setFirstStep] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');

  const addProject = useProjectStore((s) => s.addProject);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const showToast = useProjectStore((s) => s.showToast);
  const cloudUser = useProjectStore((s) => s.cloudUser);
  const setCurrentView = useProjectStore((s) => s.setCurrentView);
  const setSettingsTab = useProjectStore((s) => s.setSettingsTab);

  const importFileRef = useRef<HTMLInputElement>(null);
  const desktopApp = isDesktopApp();

  const canAdvanceStep1 = name.trim().length > 0;
  const canAdvanceStep2 = summary.trim().length > 0;
  const canFinish = firstStep.trim().length > 0;

  const handleNext = () => {
    if (step === 1 && canAdvanceStep1) setStep(2);
    else if (step === 2 && canAdvanceStep2) setStep(3);
  };

  const handleBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  const handleSkipSummary = () => {
    if (step === 2) setStep(3);
  };

  const resetWizard = () => {
    setMode('landing');
    setStep(1);
    setName('');
    setSummary('');
    setFirstStep('');
  };

  const handleCreate = async () => {
    if (!canFinish || creating) return;
    setCreating(true);

    try {
      const project = buildFirstProject(name, summary, firstStep);
      await saveToDisk(project);
      addProject(project);
      setActiveProject(project.id);
      showToast(`"${project.name}" is ready - copy it for your AI to get started.`);
    } catch (err) {
      console.error('Create failed:', err);
      showToast('Could not create the project - please try again.', 'error');
      setCreating(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (step < 3 && (step === 1 ? canAdvanceStep1 : canAdvanceStep2)) handleNext();
      else if (step === 3 && canFinish) void handleCreate();
    }
  };

  const handleImportClick = () => {
    importFileRef.current?.click();
  };

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await importProjectFromFile(file);
    event.target.value = '';
  };

  const openDesktopDownload = () => {
    window.open('https://memephant.com/download', '_blank', 'noopener,noreferrer');
  };

  if (mode === 'landing') {
    return (
      <div className="welcome-screen">
        <div className="welcome-card">
          <div className="welcome-logo">
            <img src="/icons/icon-192.png" alt="Memephant logo" className="welcome-logo__image" />
          </div>

          <h1 className="welcome-title">Memephant</h1>
          <p className="welcome-tagline">
            Remember your projects so your AIs do not have to.
          </p>

          <div className="welcome-flow">
            <div className="welcome-flow__step">
              <span className="welcome-flow__number">1</span>
              <div>
                <strong>Build project memory</strong>
                <div>
                  {desktopApp
                    ? 'Scan a folder or describe the project once.'
                    : 'Import a project or describe it once.'}
                </div>
              </div>
            </div>
            <div className="welcome-flow__step">
              <span className="welcome-flow__number">2</span>
              <div>
                <strong>Copy for any AI</strong>
                <div>Claude, ChatGPT, Grok, Gemini, or another tool.</div>
              </div>
            </div>
            <div className="welcome-flow__step">
              <span className="welcome-flow__number">3</span>
              <div>
                <strong>Paste replies back safely</strong>
                <div>Review diffs before Memephant updates anything.</div>
              </div>
            </div>
          </div>

          <div className="welcome-actions">
            {desktopApp ? (
              <>
                {/* PRIMARY: Open an existing codebase */}
                <button
                  className="welcome-btn welcome-btn--primary"
                  onClick={() => void createProjectFromFolder()}
                >
                  <span>📂</span>
                  <span className="welcome-btn__text">
                    Select a project folder
                    <small className="welcome-btn__subtitle">Scan an existing codebase</small>
                  </span>
                </button>

                {/* SECONDARY: Create blank project */}
                <button className="welcome-btn welcome-btn--secondary" onClick={() => setMode('wizard')}>
                  + New Project
                </button>

                {/* TERTIARY: Templates */}
                <button className="welcome-btn--link" onClick={() => setMode('templates')}>
                  From template
                </button>
              </>
            ) : (
              <>
                {/* Web: New project is the primary action */}
                <button className="welcome-btn welcome-btn--primary" onClick={() => setMode('wizard')}>
                  + New Project
                </button>

                <button className="welcome-btn welcome-btn--secondary" onClick={handleImportClick}>
                  Import project JSON
                </button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={(e) => void handleImportFileChange(e)}
                />

                <button className="welcome-btn--link" onClick={() => setMode('templates')}>
                  From template
                </button>

                <div className="welcome-desktop-note">
                  <span>Want full project tracking?</span>
                  <button
                    type="button"
                    className="welcome-desktop-note__link"
                    onClick={openDesktopDownload}
                  >
                    Use the desktop app
                  </button>
                </div>
                <p className="welcome-privacy">
                  Folder scanning is available in the desktop app. The web app can import exported
                  Memephant JSON files.
                </p>
              </>
            )}
          </div>

          <p className="welcome-description">
            Switch between ChatGPT, Claude, Grok, Perplexity and Gemini without starting over.
          </p>
          <p className="welcome-privacy">
            Local-first by default. Sign in only if you want cloud backup across devices.
          </p>

          {!cloudUser && (
            <button
              className="welcome-sync-link"
              onClick={() => {
                setSettingsTab('sync');
                setCurrentView('settings');
              }}
            >
              Sign in to back up and sync across devices
            </button>
          )}
        </div>
      </div>
    );
  }

  if (mode === 'templates') {
    if (selectedTemplate) {
      return (
        <div className="welcome-screen">
          <div className="welcome-card welcome-card--wizard">
            <div className="wizard-back-row">
              <button className="wizard-cancel" onClick={() => setSelectedTemplate(null)}>
                Back to templates
              </button>
            </div>
            <div className="welcome-template-icon">{selectedTemplate.emoji}</div>
            <h2 className="wizard-title">Name your {selectedTemplate.label}</h2>
            <p className="wizard-hint">Give it a specific name so you can find it easily later.</p>
            <input
              className="wizard-input"
              type="text"
              autoFocus
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && templateName.trim()) {
                  void createProjectFromTemplate(selectedTemplate, templateName);
                }
              }}
              placeholder={`e.g. ${selectedTemplate.id === 'job-search' ? 'Job Search 2025' : `${selectedTemplate.label} - ${new Date().getFullYear()}`}`}
              maxLength={100}
            />
            <div className="wizard-nav">
              <button
                className="wizard-btn wizard-btn--primary"
                disabled={!templateName.trim() || creating}
                onClick={() => {
                  if (!templateName.trim()) return;
                  setCreating(true);
                  void createProjectFromTemplate(selectedTemplate, templateName).finally(() =>
                    setCreating(false),
                  );
                }}
              >
                {creating ? 'Creating...' : "Let's go"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="welcome-screen">
        <div className="welcome-card welcome-card--templates">
          <h2 className="wizard-title">Choose a template</h2>
          <p className="wizard-hint">Pre-filled goals, rules, and next steps to get you started fast.</p>
          <div className="template-grid">
            {PROJECT_TEMPLATES.map((template) => (
              <button
                key={template.id}
                className="template-card"
                onClick={() => {
                  setSelectedTemplate(template);
                  setTemplateName('');
                }}
              >
                <span className="template-card__emoji">{template.emoji}</span>
                <span className="template-card__label">{template.label}</span>
                <span className="template-card__desc">{template.description}</span>
              </button>
            ))}
          </div>
          <button
            className="wizard-cancel"
            onClick={() => {
              setMode('landing');
              setSelectedTemplate(null);
            }}
          >
            Back to start
          </button>
        </div>
      </div>
    );
  }

  const progressPct = ((step - 1) / 3) * 100;

  return (
    <div className="welcome-screen">
      <div className="welcome-card welcome-card--wizard" style={{ position: 'relative' }}>
        <button
          type="button"
          aria-label="Close wizard"
          onClick={resetWizard}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            width: 36,
            height: 36,
            borderRadius: 999,
            border: '1px solid rgba(148, 163, 184, 0.25)',
            background: 'rgba(15, 23, 42, 0.72)',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 20,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>

        <div className="wizard-progress">
          <div className="wizard-progress__fill" style={{ width: `${progressPct + 33}%` }} />
        </div>

        <div className="wizard-steps">
          {([1, 2, 3] as Step[]).map((wizardStep) => (
            <div
              key={wizardStep}
              className={`wizard-step-dot${wizardStep === step ? ' wizard-step-dot--active' : wizardStep < step ? ' wizard-step-dot--done' : ''}`}
            >
              {wizardStep < step ? 'OK' : wizardStep}
            </div>
          ))}
        </div>

        <h2 className="wizard-title">{STEP_TITLES[step]}</h2>
        <p className="wizard-hint">{STEP_HINTS[step]}</p>

        {step === 1 && (
          <input
            className="wizard-input"
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={STEP_PLACEHOLDERS[1]}
            maxLength={100}
          />
        )}

        {step === 2 && (
          <textarea
            className="wizard-textarea"
            autoFocus
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={STEP_PLACEHOLDERS[2]}
            rows={4}
          />
        )}

        {step === 3 && (
          <textarea
            className="wizard-textarea"
            autoFocus
            value={firstStep}
            onChange={(e) => setFirstStep(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={STEP_PLACEHOLDERS[3]}
            rows={3}
          />
        )}

        <div className="wizard-nav">
          {step > 1 && (
            <button className="wizard-btn wizard-btn--back" onClick={handleBack}>
              Back
            </button>
          )}

          {step === 2 && (
            <button className="wizard-btn wizard-btn--skip" onClick={handleSkipSummary}>
              Skip for now
            </button>
          )}

          {step < 3 ? (
            <button
              className="wizard-btn wizard-btn--primary"
              disabled={step === 1 ? !canAdvanceStep1 : !canAdvanceStep2}
              onClick={handleNext}
            >
              Next
            </button>
          ) : (
            <button
              className="wizard-btn wizard-btn--primary"
              disabled={!canFinish || creating}
              onClick={() => void handleCreate()}
            >
              {creating ? 'Creating...' : 'Start  Set up my first project'}
            </button>
          )}
        </div>

        <button
          className="wizard-cancel"
          onClick={resetWizard}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default WelcomeScreen;
