/**
 * WelcomeScreen — shown when no projects exist.
 *
 * Two modes:
 *   1. Landing: choose "guided setup" or "scan a folder"
 *   2. Wizard: 3-step guided flow → creates a project with enough content
 *              to make the first export genuinely useful
 */
import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { createProjectFromFolder, createProjectFromTemplate, saveToDisk } from '../../services/tauriActions';
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
  1: 'Give it a clear name — this is how you will find it later.',
  2: "One or two sentences is enough. Your AI will read this every session to get up to speed.",
  3: 'Add the one thing you want to tackle in your first AI session.',
};

const STEP_PLACEHOLDERS: Record<Step, string> = {
  1: 'e.g. Landing page redesign, Mobile app MVP, Research paper...',
  2: 'e.g. A Tauri desktop app that lets users carry project context between AI platforms without losing continuity.',
  3: 'e.g. Design the onboarding flow. Fix the login bug. Write the executive summary.',
};

function buildFirstProject(name: string, summary: string, firstStep: string): ProjectMemory {
  const now = new Date().toISOString();
  const id = name.trim().replace(/\s+/g, '_').toLowerCase() + '_' + Date.now();

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

  const handleCreate = async () => {
    if (!canFinish || creating) return;
    setCreating(true);

    try {
      const project = buildFirstProject(name, summary, firstStep);
      await saveToDisk(project);
      addProject(project);
      setActiveProject(project.id);
      showToast(`"${project.name}" is ready — copy it for your AI to get started.`);
    } catch (err) {
      console.error('Create failed:', err);
      showToast('Could not create the project — please try again.', 'error');
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (step < 3 && (step === 1 ? canAdvanceStep1 : canAdvanceStep2)) handleNext();
      else if (step === 3 && canFinish) void handleCreate();
    }
  };

  // ── Landing ────────────────────────────────────────────────────────────────

  if (mode === 'landing') {
    return (
      <div className="welcome-screen">
        <div className="welcome-card">
          <div className="welcome-logo">
  <img src="/icons/icon-192.png" alt="Memephant logo" className="welcome-logo__image" />
</div>
          <h1 className="welcome-title">Memephant</h1>
          <p className="welcome-tagline">
            Remember your projects so your AIs don&apos;t have to.
          </p>

          <div className="welcome-actions">
            <button
              className="welcome-btn welcome-btn--primary"
              onClick={() => setMode('wizard')}
            >
              <span>✏️</span>
              Set up my first project
            </button>
            <button
              className="welcome-btn welcome-btn--secondary"
              onClick={() => setMode('templates')}
            >
              <span>📋</span>
              Start from a template
            </button>
            <button
              className="welcome-btn welcome-btn--secondary"
              onClick={() => void createProjectFromFolder()}
            >
              <span>📂</span>
              Scan a project folder
            </button>
          </div>

          <p className="welcome-description">
            Switch between ChatGPT, Claude, Grok, Perplexity and Gemini — without starting over.
          </p>
          <p className="welcome-privacy">🔒 Your data stays on this device. No accounts required.</p>

          {!cloudUser && (
            <button
              className="welcome-sync-link"
              onClick={() => { setSettingsTab('sync'); setCurrentView('settings'); }}
            >
              ☁️ Sign in to back up &amp; sync across devices →
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Templates ──────────────────────────────────────────────────────────────

  if (mode === 'templates') {
    // Step 2: name the chosen template
    if (selectedTemplate) {
      return (
        <div className="welcome-screen">
          <div className="welcome-card welcome-card--wizard">
            <div className="wizard-back-row">
              <button className="wizard-cancel" onClick={() => setSelectedTemplate(null)}>
                ← Templates
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
              placeholder={`e.g. ${selectedTemplate.id === 'job-search' ? 'Job Search 2025' : selectedTemplate.label + ' — ' + new Date().getFullYear()}`}
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
                {creating ? 'Creating…' : "Let's go 🚀"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Step 1: pick a template
    return (
      <div className="welcome-screen">
        <div className="welcome-card welcome-card--templates">
          <h2 className="wizard-title">Choose a template</h2>
          <p className="wizard-hint">Pre-filled goals, rules, and next steps to get you started fast.</p>
          <div className="template-grid">
            {PROJECT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                className="template-card"
                onClick={() => { setSelectedTemplate(t); setTemplateName(''); }}
              >
                <span className="template-card__emoji">{t.emoji}</span>
                <span className="template-card__label">{t.label}</span>
                <span className="template-card__desc">{t.description}</span>
              </button>
            ))}
          </div>
          <button
            className="wizard-cancel"
            onClick={() => { setMode('landing'); setSelectedTemplate(null); }}
          >
            ← Back to start
          </button>
        </div>
      </div>
    );
  }

  // ── Wizard ─────────────────────────────────────────────────────────────────

  const progressPct = ((step - 1) / 3) * 100;

  return (
    <div className="welcome-screen">
      <div className="welcome-card welcome-card--wizard">

        {/* Progress bar */}
        <div className="wizard-progress">
          <div
            className="wizard-progress__fill"
            style={{ width: `${progressPct + 33}%` }}
          />
        </div>

        {/* Step indicator */}
        <div className="wizard-steps">
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              className={`wizard-step-dot${s === step ? ' wizard-step-dot--active' : s < step ? ' wizard-step-dot--done' : ''}`}
            >
              {s < step ? '✓' : s}
            </div>
          ))}
        </div>

        <h2 className="wizard-title">{STEP_TITLES[step]}</h2>
        <p className="wizard-hint">{STEP_HINTS[step]}</p>

        {/* Step 1 — Name */}
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

        {/* Step 2 — Summary */}
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

        {/* Step 3 — First next step */}
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

        {/* Navigation */}
        <div className="wizard-nav">
          {step > 1 && (
            <button className="wizard-btn wizard-btn--back" onClick={handleBack}>
              ← Back
            </button>
          )}

          {step === 1 && (
            <button
              className="wizard-btn wizard-btn--primary"
              onClick={handleNext}
              disabled={!canAdvanceStep1}
            >
              Next →
            </button>
          )}

          {step === 2 && (
            <>
              <button
                className="wizard-btn wizard-btn--skip"
                onClick={handleSkipSummary}
              >
                Skip for now
              </button>
              <button
                className="wizard-btn wizard-btn--primary"
                onClick={handleNext}
                disabled={!canAdvanceStep2}
              >
                Next →
              </button>
            </>
          )}

          {step === 3 && (
            <button
              className="wizard-btn wizard-btn--primary"
              onClick={() => void handleCreate()}
              disabled={!canFinish || creating}
            >
              {creating ? 'Creating…' : "Let's go 🚀"}
            </button>
          )}
        </div>

        <button
          className="wizard-cancel"
          onClick={() => { setMode('landing'); setStep(1); setName(''); setSummary(''); setFirstStep(''); }}
        >
          ← Back to start
        </button>
      </div>
    </div>
  );
}

export default WelcomeScreen;
