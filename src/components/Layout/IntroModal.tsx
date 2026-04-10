/**
 * IntroModal — first-time hook screen.
 *
 * Shown once, on first launch, before anything else.
 * Gives users an immediate understanding of what Memphant does
 * and a clear choice of what to do next.
 *
 * Storage key: 'mph_intro_done'
 * Once set, this modal never shows again unless manually cleared.
 */
import { useState, useEffect } from 'react';
import './IntroModal.css';

const INTRO_KEY = 'mph_intro_done';

interface IntroModalProps {
  /** Called when user clicks "Show me how" — starts the tour */
  onStartTour: () => void;
}

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

export function IntroModal({ onStartTour }: IntroModalProps) {
  const [visible, setVisible] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(INTRO_KEY)) {
      const t = setTimeout(() => setVisible(true), 350);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [visible]);

  useEffect(() => {
    const isTauri =
      typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

    if (isTauri) return;

    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // iOS Safari
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.navigator as any).standalone === true;

    if (standalone) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (!visible) return null;

  function dismiss(startTour = false) {
    localStorage.setItem(INTRO_KEY, '1');
    if (!startTour) {
      localStorage.setItem('pb_tour_done', '1');
    }
    setVisible(false);
    if (startTour) onStartTour();
  }

  async function handleInstall() {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;

    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
    }

    setInstallPrompt(null);
  }

  const showInstallButton = !isInstalled && !!installPrompt;

  return (
    <div className="intro-root" role="dialog" aria-modal="true" aria-label="Welcome to Memphant">
      <div className="intro-backdrop" onClick={() => dismiss()} />

      <div className="intro-card">
        <div className="intro-logo">🐘</div>

        <h1 className="intro-headline">
          Stop re-explaining your project to every AI
        </h1>

        <p className="intro-subtext">
          Memphant keeps your project in sync across ChatGPT, Claude, Grok and more.
          Start once. Continue anywhere.
        </p>

        <div className="intro-steps">
          <div className="intro-step">
            <span className="intro-step__icon">✏️</span>
            <span className="intro-step__label">Fill in your project once</span>
          </div>
          <div className="intro-step-arrow">→</div>
          <div className="intro-step">
            <span className="intro-step__icon">📋</span>
            <span className="intro-step__label">Copy to any AI</span>
          </div>
          <div className="intro-step-arrow">→</div>
          <div className="intro-step">
            <span className="intro-step__icon">🔄</span>
            <span className="intro-step__label">Paste back to sync</span>
          </div>
        </div>

        <div className="intro-actions">
          <button
            className="intro-btn intro-btn--primary"
            onClick={() => dismiss(false)}
            autoFocus
          >
            Start my first project
          </button>

          <button
            className="intro-btn intro-btn--secondary"
            onClick={() => dismiss(true)}
          >
            Show me how it works
          </button>

          {showInstallButton && (
            <button
              className="intro-btn intro-btn--secondary"
              onClick={() => void handleInstall()}
            >
              Install app
            </button>
          )}

          <button
            className="intro-btn intro-btn--ghost"
            onClick={() => dismiss(false)}
          >
            Skip for now
          </button>
        </div>

        <p className="intro-privacy">🔒 Everything stays on your device. No accounts required.</p>
      </div>
    </div>
  );
}

export default IntroModal;