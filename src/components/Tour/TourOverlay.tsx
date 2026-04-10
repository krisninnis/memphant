/**
 * TourOverlay — guided onboarding tour.
 *
 * 4 spotlight steps (the intro/welcome screen is now handled by IntroModal):
 *  1. New Project button (sidebar)
 *  2. Project editor
 *  3. Export buttons
 *  4. Paste zone
 *
 * The tour is OPT-IN only. It never auto-launches.
 * It is triggered by:
 *  a) User clicking "Show me how it works" in IntroModal
 *  b) User clicking "Restart Tour" in Settings (via the tourActive store flag)
 *
 * Completion stored in localStorage ('pb_tour_done') so finish state persists.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '../../store/projectStore';
import './TourOverlay.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TourStep {
  id: string;
  target?: string; // data-tour attribute value
  placement?: 'top' | 'bottom' | 'left' | 'right';
  title: string;
  body: string;
  cta?: string;
}

interface Rect { top: number; left: number; width: number; height: number; }

// ─── Steps ────────────────────────────────────────────────────────────────────
// The welcome/intro step has been removed — IntroModal handles that now.

const STEPS: TourStep[] = [
  {
    id: 'new-project',
    target: 'new-project',
    placement: 'right',
    title: 'Create a project',
    body: 'Start here. Give your project a name and Memphant instantly fills in goals, a summary, and next steps to get you started.',
  },
  {
    id: 'editor',
    target: 'editor-name',
    placement: 'bottom',
    title: 'Your project memory',
    body: 'Goals, key decisions, next steps — fill these in and every AI you talk to will understand your project instantly, without you having to explain it again.',
  },
  {
    id: 'export',
    target: 'export',
    placement: 'bottom',
    title: 'Copy to any AI in one click',
    body: 'Pick a platform — Claude, ChatGPT, Gemini, Grok, Perplexity — and click Copy. Memphant formats the perfect prompt and puts it on your clipboard.',
  },
  {
    id: 'paste',
    target: 'paste',
    placement: 'top',
    title: 'Paste the AI\'s response back',
    body: 'When the AI responds with ideas or updates, paste it here. We detect what changed and ask if you want to apply it. Then your next AI picks up right where this one left off.',
    cta: "Got it — let's start ✦",
  },
];

const STORAGE_KEY = 'pb_tour_done';
const PADDING = 10; // px of breathing room around spotlight

// ─── Component ────────────────────────────────────────────────────────────────

export function TourOverlay() {
  const tourActive   = useProjectStore((s) => s.tourActive);
  const setTourActive = useProjectStore((s) => s.setTourActive);

  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible]     = useState(false);
  const [spotlight, setSpotlight] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    top?: number; bottom?: number; left?: number; right?: number;
  }>({});
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step   = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  // ── Show when tourActive is set in the store ───────────────────────────────

  useEffect(() => {
    if (tourActive) {
      setStepIndex(0);
      // Small delay so the app shell finishes any pending renders
      const t = setTimeout(() => setVisible(true), 400);
      return () => clearTimeout(t);
    }
  }, [tourActive]);

  // ── Position spotlight + tooltip whenever step changes ────────────────────

  const positionStep = useCallback(() => {
    if (!step.target) {
      setSpotlight(null);
      setTooltipPos({});
      return;
    }

    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return;

    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    const rect = el.getBoundingClientRect();
    const sp: Rect = {
      top:    rect.top    - PADDING,
      left:   rect.left   - PADDING,
      width:  rect.width  + PADDING * 2,
      height: rect.height + PADDING * 2,
    };
    setSpotlight(sp);

    const margin   = 16;
    const tooltipW = 300;
    const tooltipH = 200;
    const pad      = 12;

    const clampLeft = (x: number) =>
      Math.max(pad, Math.min(x, window.innerWidth  - tooltipW - pad));
    const clampTop  = (y: number) =>
      Math.max(pad, Math.min(y, window.innerHeight - tooltipH - pad));

    switch (step.placement) {
      case 'right':
        setTooltipPos({
          top:  clampTop(sp.top),
          left: clampLeft(sp.left + sp.width + margin),
        });
        break;
      case 'left':
        setTooltipPos({
          top:  clampTop(sp.top),
          left: clampLeft(sp.left - tooltipW - margin),
        });
        break;
      case 'bottom':
        setTooltipPos({
          top:  clampTop(sp.top + sp.height + margin),
          left: clampLeft(sp.left),
        });
        break;
      case 'top':
      default:
        setTooltipPos({
          top:  clampTop(sp.top - tooltipH - margin),
          left: clampLeft(sp.left),
        });
        break;
    }
  }, [step]);

  useEffect(() => {
    if (!visible) return;
    positionStep();
    window.addEventListener('resize', positionStep);
    return () => window.removeEventListener('resize', positionStep);
  }, [visible, stepIndex, positionStep]);

  // ── Controls ───────────────────────────────────────────────────────────────

  function finish() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
    setTourActive(false);
  }

  function next() {
    if (isLast) {
      finish();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function prev() {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }

  if (!visible) return null;

  const ctaText = step.cta ?? (isLast ? "Let's go ✦" : 'Next →');

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Onboarding tour">

      {/* Spotlight: dark bg with transparent hole via box-shadow */}
      {spotlight && (
        <div
          className="tour-spotlight"
          style={{
            top:    spotlight.top,
            left:   spotlight.left,
            width:  spotlight.width,
            height: spotlight.height,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className={`tour-tooltip tour-tooltip--${step.placement ?? 'top'}`}
        style={tooltipPos}
        role="document"
      >
        {/* Arrow pointing toward the target */}
        <div className="tour-tooltip__arrow" />

        {/* Step counter */}
        <div className="tour-tooltip__meta">
          <div className="tour-dots">
            {STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`tour-dot ${i === stepIndex ? 'tour-dot--active' : ''}`}
              />
            ))}
          </div>
          <span className="tour-step-count">
            {stepIndex + 1} of {STEPS.length}
          </span>
        </div>

        <h3 className="tour-tooltip__title">{step.title}</h3>
        <p className="tour-tooltip__body">{step.body}</p>

        <div className="tour-tooltip__footer">
          <button className="tour-btn tour-btn--ghost" onClick={finish}>
            Skip
          </button>
          <div className="tour-nav">
            {stepIndex > 0 && (
              <button className="tour-btn tour-btn--back" onClick={prev}>
                ← Back
              </button>
            )}
            <button className="tour-btn tour-btn--primary" onClick={next}>
              {ctaText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TourOverlay;
