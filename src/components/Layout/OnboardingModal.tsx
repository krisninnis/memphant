import { useEffect, useMemo, useState } from 'react';
import { isDesktopApp, linkFolder } from '../../services/tauriActions';
import { useProjectStore } from '../../store/projectStore';
import type { ExportMode, Platform } from '../../types/memphant-types';
import './OnboardingModal.css';

type OnboardingChoice = 'writing' | 'coding' | 'research' | 'business' | 'mix';

type ChoiceDefaults = {
  platform: Platform;
  mode: ExportMode;
};

const CHOICE_DEFAULTS: Record<OnboardingChoice, ChoiceDefaults> = {
  writing: { platform: 'chatgpt', mode: 'full' },
  coding: { platform: 'claude', mode: 'full' },
  research: { platform: 'perplexity', mode: 'delta' },
  business: { platform: 'chatgpt', mode: 'smart' },
  mix: { platform: 'claude', mode: 'full' },
};

const OPTIONS: Array<{ value: OnboardingChoice; emoji: string; label: string }> = [
  { value: 'writing', emoji: '🖊', label: 'Writing and content' },
  { value: 'coding', emoji: '💻', label: 'Coding and development' },
  { value: 'research', emoji: '🔍', label: 'Research and analysis' },
  { value: 'business', emoji: '🏢', label: 'Running a business' },
  { value: 'mix', emoji: '✨', label: 'Mix of everything' },
];

export function OnboardingModal() {
  const settings = useProjectStore((s) => s.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const [step, setStep] = useState(1);
  const [selection, setSelection] = useState<OnboardingChoice>('mix');
  const desktop = isDesktopApp();

  const selectedDefaults = useMemo(() => CHOICE_DEFAULTS[selection], [selection]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const completeOnboarding = () => {
    updateSettings({
      general: {
        ...settings.general,
        hasSeenOnboarding: true,
        defaultPlatform: selectedDefaults.platform,
      },
      projects: {
        ...settings.projects,
        defaultExportMode: selectedDefaults.mode,
      },
    });
  };

  const handleSkip = () => {
    completeOnboarding();
  };

  const handleLinkFolder = async () => {
    completeOnboarding();
    await linkFolder();
  };

  return (
    <div className="onboarding-root" role="dialog" aria-modal="true" aria-label="Welcome to Memephant">
      <div className="onboarding-backdrop" />

      <div className="onboarding-card">
        <div className="onboarding-progress" aria-hidden="true">
          {[1, 2, 3].map((dot) => (
            <span
              key={dot}
              className={`onboarding-progress__dot${dot === step ? ' onboarding-progress__dot--active' : ''}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="onboarding-step onboarding-step--welcome">
            <div className="onboarding-logo">🐘</div>
            <h1 className="onboarding-title">Your AI sessions, finally connected</h1>
            <p className="onboarding-subtitle">
              Memephant keeps your project context ready for any AI — so you never explain yourself from scratch again.
            </p>
            <p className="onboarding-subtitle">
              Switch between ChatGPT, Claude, Codex, and more — Memephant carries the context so the next AI picks up
              exactly where you left off.
            </p>

            <div className="onboarding-actions">
              <button
                type="button"
                className="onboarding-btn onboarding-btn--primary"
                onClick={() => setStep(2)}
              >
                Get started →
              </button>

              <button
                type="button"
                className="onboarding-btn onboarding-btn--ghost"
                onClick={handleSkip}
              >
                Skip setup
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step">
            <h2 className="onboarding-title">What do you mainly use AI for?</h2>
            <div className="onboarding-options">
              {OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`onboarding-option${selection === option.value ? ' onboarding-option--selected' : ''}`}
                  onClick={() => setSelection(option.value)}
                >
                  <span className="onboarding-option__emoji">{option.emoji}</span>
                  <span className="onboarding-option__label">{option.label}</span>
                </button>
              ))}
            </div>

            <div className="onboarding-actions">
              <div className="onboarding-actions__row">
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn--secondary"
                  onClick={() => setStep(1)}
                >
                  Back
                </button>

                <button
                  type="button"
                  className="onboarding-btn onboarding-btn--primary"
                  onClick={() => setStep(3)}
                >
                  Continue →
                </button>
              </div>

              <button
                type="button"
                className="onboarding-btn onboarding-btn--ghost"
                onClick={handleSkip}
              >
                Skip setup
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onboarding-step">
            <h2 className="onboarding-title">Connect your project folder</h2>
            <p className="onboarding-subtitle">
              Memephant can watch for file changes and automatically keep your AI context fresh.
            </p>

            {!desktop && (
              <p className="onboarding-note">
                Folder linking is available in the desktop app.
              </p>
            )}

            <div className="onboarding-actions">
              <div className="onboarding-actions__row">
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn--secondary"
                  onClick={() => setStep(2)}
                >
                  Back
                </button>

                {desktop ? (
                  <div className="onboarding-folder-actions">
                    <button
                      type="button"
                      className="onboarding-btn onboarding-btn--primary"
                      onClick={() => void handleLinkFolder()}
                    >
                      Select a folder
                    </button>

                    <button
                      type="button"
                      className="onboarding-btn onboarding-btn--secondary"
                      onClick={completeOnboarding}
                    >
                      Skip for now
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="onboarding-btn onboarding-btn--primary"
                    onClick={completeOnboarding}
                  >
                    Skip for now
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OnboardingModal;
