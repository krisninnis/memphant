/**
 * TourOverlay — guided onboarding tour.
 *
 * 5 steps:
 *  1. Welcome modal (centered, no target)
 *  2. New Project button (sidebar)
 *  3. Project editor
 *  4. Export buttons
 *  5. Paste zone
 *
 * Uses the classic box-shadow spotlight technique — no external library needed.
 * Completion stored in localStorage so it never shows again.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
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

const STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Project Brain',
    body: 'Every time you switch AI platforms you lose context — you have to explain your project from scratch. Project Brain fixes that. One project, every AI, always in sync.',
    cta: 'Show me how →',
  },
  {
    id: 'new-project',
    target: 'new-project',
    placement: 'right',
    title: 'Create a project',
    body: 'Start here. Give your project a name and Project Brain instantly fills in goals, a summary, and next steps to get you started.',
  },
  {
    id: 'editor',
    target: 'editor-name',      // targets just the project name field, not the whole panel
    placement: 'bottom',
    title: 'Your project memory',
    body: 'Goals, key decisions, next steps — fill these in and every AI you talk to will understand your project instantly, without you having to explain it again.',
  },
  {
    id: 'export',
    target: 'export',
    placement: 'bottom',        // below the pills, not above (avoids top-of-screen cutoff)
    title: 'Copy to any AI in one click',
    body: 'Pick a platform — Claude, ChatGPT, Gemini, Grok, Perplexity — and click Copy. Project Brain formats the perfect prompt and puts it on your clipboard.',
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

interface TourOverlayProps {
  /** If false, forces the tour off even if localStorage says it should show */
  enabled?: boolean;
}

export function TourOverlay({ enabled = true }: TourOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [spotlight, setSpotlight] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number }>({});
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step = STEPS[stepIndex];
  const isWelcome = !step.target;
  const isLast = stepIndex === STEPS.length - 1;

  // ── Show on first launch ───────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      // Small delay so the app finishes rendering before overlay appears
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
  }, [enabled]);

  // ── Position spotlight + tooltip whenever step changes ────────────────────

  const positionStep = useCallback(() => {
    if (!step.target) {
      setSpotlight(null);
      setTooltipPos({});
      return;
    }

    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return;

    // Scroll target into view quietly
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    const rect = el.getBoundingClientRect();
    const sp: Rect = {
      top:    rect.top    - PADDING,
      left:   rect.left   - PADDING,
      width:  rect.width  + PADDING * 2,
      height: rect.height + PADDING * 2,
    };
    setSpotlight(sp);

    // Position tooltip relative to spotlight — clamped to viewport
    const margin   = 16;
    const tooltipW = 300;
    const tooltipH = 200; // conservative estimate
    const pad      = 12;  // min distance from screen edge

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

      {/* Overlay / backdrop */}
      {isWelcome ? (
        // Welcome: simple full-screen dark bg
        <div className="tour-backdrop" onClick={(e) => e.stopPropagation()} />
      ) : (
        // Spotlight: dark bg with transparent hole via box-shadow
        spotlight && (
          <div
            className="tour-spotlight"
            style={{
              top:    spotlight.top,
              left:   spotlight.left,
              width:  spotlight.width,
              height: spotlight.height,
            }}
          />
        )
      )}

      {/* Tooltip / modal card */}
      {isWelcome ? (
        <div className="tour-modal" role="document">
          <div className="tour-modal__icon">✦</div>
          <h2 className="tour-modal__title">{step.title}</h2>
          <p className="tour-modal__body">{step.body}</p>
          <div className="tour-modal__footer">
            <button className="tour-btn tour-btn--ghost" onClick={finish}>
              Skip tour
            </button>
            <button className="tour-btn tour-btn--primary" onClick={next}>
              {ctaText}
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={tooltipRef}
          className={`tour-tooltip tour-tooltip--${step.placement ?? 'top'}`}
          style={tooltipPos}
          role="document"
        >
          {/* Arrow */}
          <div className="tour-tooltip__arrow" />

          {/* Step counter */}
          <div className="tour-tooltip__meta">
            <div className="tour-dots">
              {STEPS.filter(s => s.target).map((s, i) => {
                const targetedSteps = STEPS.filter(s => s.target);
                const currentTargetIndex = targetedSteps.findIndex(s => s.id === step.id);
                return (
                  <span
                    key={s.id}
                    className={`tour-dot ${i === currentTargetIndex ? 'tour-dot--active' : ''}`}
                  />
                );
              })}
            </div>
            <span className="tour-step-count">
              {STEPS.filter(s => s.target).findIndex(s => s.id === step.id) + 1} of {STEPS.filter(s => s.target).length}
            </span>
          </div>

          <h3 className="tour-tooltip__title">{step.title}</h3>
          <p className="tour-tooltip__body">{step.body}</p>

          <div className="tour-tooltip__footer">
            <button className="tour-btn tour-btn--ghost" onClick={finish}>
              Skip
            </button>
            <div className="tour-nav">
              {stepIndex > 1 && (
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
      )}
    </div>
  );
}

export default TourOverlay;
