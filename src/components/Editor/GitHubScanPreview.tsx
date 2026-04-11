/**
 * GitHubScanPreview
 *
 * Inline panel that appears below the GitHub repo field after a successful scan.
 * Shows what was found and what will be added, then lets the user accept or dismiss.
 *
 * Design rules:
 *  - Never show raw code — only structured signals
 *  - Label all inferences as assumptions
 *  - One clear CTA: "Add to my project"
 */

import type { GitHubScanResult } from '../../services/githubScanner';

// ─── Stack chip colours ───────────────────────────────────────────────────────

const STACK_COLORS: Record<string, { bg: string; fg: string }> = {
  'React':              { bg: '#1a3a4a', fg: '#61dafb' },
  'TypeScript':         { bg: '#1a2a40', fg: '#3b82f6' },
  'Next.js':            { bg: '#222', fg: '#fff' },
  'Vue':                { bg: '#1a3a28', fg: '#42d392' },
  'SvelteKit':          { bg: '#2a1a0a', fg: '#ff3e00' },
  'Svelte':             { bg: '#2a1a0a', fg: '#ff3e00' },
  'Rust':               { bg: '#2a1a00', fg: '#f97316' },
  'Tauri':              { bg: '#2a1a00', fg: '#fcd34d' },
  'Python':             { bg: '#1a2a3a', fg: '#60a5fa' },
  'FastAPI':            { bg: '#0a2a2a', fg: '#34d399' },
  'Django':             { bg: '#0a2010', fg: '#22c55e' },
  'Flask':              { bg: '#2a2a2a', fg: '#aaa' },
  'Go':                 { bg: '#0a2a3a', fg: '#00add8' },
  'Supabase':           { bg: '#0a2a1a', fg: '#3ecf8e' },
  'Stripe':             { bg: '#1a1a3a', fg: '#7c3aed' },
  'Tailwind CSS':       { bg: '#0a2a3a', fg: '#38bdf8' },
  'Docker':             { bg: '#0a1a3a', fg: '#2496ed' },
  'Vercel':             { bg: '#222', fg: '#fff' },
  'GitHub Actions CI':  { bg: '#1a2410', fg: '#84cc16' },
  'Vite':               { bg: '#2a1a2a', fg: '#9d6fff' },
  'Prisma':             { bg: '#1a2a2a', fg: '#4dd0e1' },
  'Zustand':            { bg: '#2a1a10', fg: '#fb923c' },
};

function stackColor(name: string): { bg: string; fg: string } {
  return STACK_COLORS[name] ?? { bg: '#1e2436', fg: '#a0aec0' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <div className="scan-preview__section-title">{children}</div>;
}

function EmptySlot({ label }: { label: string }) {
  return <span className="scan-preview__empty">— {label}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface GitHubScanPreviewProps {
  result: GitHubScanResult;
  onAccept: () => void;
  onDismiss: () => void;
}

export function GitHubScanPreview({ result, onAccept, onDismiss }: GitHubScanPreviewProps) {
  const repoShort = result.repoUrl.replace('https://github.com/', '');

  const hasAnythingUseful =
    result.detectedStack.length > 0 ||
    result.extractedSummary ||
    result.keyFiles.length > 0 ||
    result.inferredDecisions.length > 0 ||
    result.suggestedNextSteps.length > 0;

  return (
    <div className="scan-preview" role="region" aria-label="Scan results">
      {/* Header */}
      <div className="scan-preview__header">
        <div className="scan-preview__header-left">
          <span className="scan-preview__icon">📡</span>
          <div>
            <div className="scan-preview__title">Scan complete</div>
            <div className="scan-preview__subtitle">
              <a
                href={result.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="scan-preview__repo-link"
              >
                {repoShort}
              </a>
              {' · '}
              {formatDate(result.scannedAt)}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="scan-preview__dismiss-x"
          onClick={onDismiss}
          aria-label="Dismiss scan results"
        >
          ×
        </button>
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="scan-preview__warning">
          ⚠️ {result.warnings.join(' ')}
        </div>
      )}

      {/* Tech stack */}
      {result.detectedStack.length > 0 && (
        <div className="scan-preview__section">
          <SectionHeader>Detected stack</SectionHeader>
          <div className="scan-preview__chips">
            {result.detectedStack.map((tech) => {
              const { bg, fg } = stackColor(tech);
              return (
                <span
                  key={tech}
                  className="scan-preview__chip"
                  style={{ background: bg, color: fg }}
                >
                  {tech}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* What will be added */}
      {hasAnythingUseful && (
        <div className="scan-preview__section">
          <SectionHeader>What will be added to your project</SectionHeader>
          <div className="scan-preview__adds">

            {/* Summary */}
            <div className="scan-preview__add-row">
              <span className="scan-preview__add-field">Summary</span>
              {result.extractedSummary
                ? <span className="scan-preview__add-value">{result.extractedSummary}</span>
                : <EmptySlot label="nothing extracted" />}
            </div>

            {/* Key files */}
            {result.keyFiles.length > 0 && (
              <div className="scan-preview__add-row">
                <span className="scan-preview__add-field">Important files</span>
                <span className="scan-preview__add-value scan-preview__files">
                  {result.keyFiles.map((f) => (
                    <code key={f} className="scan-preview__file-chip">{f}</code>
                  ))}
                </span>
              </div>
            )}

            {/* Next steps */}
            {result.suggestedNextSteps.length > 0 && (
              <div className="scan-preview__add-row">
                <span className="scan-preview__add-field">Next steps</span>
                <ul className="scan-preview__add-list">
                  {result.suggestedNextSteps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Inferred decisions */}
            {result.inferredDecisions.length > 0 && (
              <div className="scan-preview__add-row">
                <span className="scan-preview__add-field">
                  Decisions{' '}
                  <span className="scan-preview__assumption-badge" title="These are inferences — verify them">
                    assumptions
                  </span>
                </span>
                <ul className="scan-preview__add-list">
                  {result.inferredDecisions.map((d) => (
                    <li key={d.decision}>{d.decision}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Open questions */}
            {result.suggestedOpenQuestions.length > 0 && (
              <div className="scan-preview__add-row">
                <span className="scan-preview__add-field">Open questions</span>
                <ul className="scan-preview__add-list">
                  {result.suggestedOpenQuestions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Safety note */}
      <div className="scan-preview__safety-note">
        🔒 No code, secrets, or .env files were read. Existing project fields won't be overwritten.
      </div>

      {/* Actions */}
      <div className="scan-preview__actions">
        <button
          type="button"
          className="scan-preview__accept-btn"
          onClick={onAccept}
        >
          ✓ Add to my project
        </button>
        <button
          type="button"
          className="scan-preview__skip-btn"
          onClick={onDismiss}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

export default GitHubScanPreview;
