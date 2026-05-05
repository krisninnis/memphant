/**
 * Context Passport Modal
 *
 * Previews the generated Context Passport and lets the user copy it
 * in four formats: generic Markdown, ChatGPT, Claude, and Codex.
 *
 * READ-ONLY — never mutates project data.
 */

import { useEffect, useRef, useState } from 'react';
import type { ProjectMemory } from '../../types/memphant-types';
import {
  generateContextPassport,
  type PassportFormat,
} from '../../utils/passportGenerator';
import './ContextPassportModal.css';

interface ContextPassportModalProps {
  project: ProjectMemory;
  onClose: () => void;
}

const FORMAT_TABS: { id: PassportFormat; label: string; icon: string; description: string }[] = [
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    icon: '🤖',
    description: 'Markdown with a clear "continue from here" instruction.',
  },
  {
    id: 'claude',
    label: 'Claude',
    icon: '🟠',
    description: 'Structured XML-style sections for precise context loading.',
  },
  {
    id: 'codex',
    label: 'Codex',
    icon: '⚡',
    description: 'Implementation-focused: status, rules, files, and next steps.',
  },
  {
    id: 'markdown',
    label: 'Markdown',
    icon: '📄',
    description: 'Plain portable Markdown. Works with any AI tool.',
  },
];

export function ContextPassportModal({ project, onClose }: ContextPassportModalProps) {
  const [activeFormat, setActiveFormat] = useState<PassportFormat>('chatgpt');
  const [copied, setCopied] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Generate passport once on mount — pure, no side effects
  const passport = generateContextPassport(project);
  const currentText = passport.formats[activeFormat];

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may not be available (e.g. in some embedded contexts)
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const activeTab = FORMAT_TABS.find((t) => t.id === activeFormat);

  return (
    <div
      className="passport-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Context Passport"
    >
      <div className="passport-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="passport-modal__header">
          <div className="passport-modal__title-row">
            <span className="passport-modal__emoji">🗺️</span>
            <div>
              <h2 className="passport-modal__title">Context Passport</h2>
              <p className="passport-modal__subtitle">{passport.projectName}</p>
            </div>
          </div>
          <button
            type="button"
            className="passport-modal__close"
            onClick={onClose}
            aria-label="Close passport preview"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Format tabs */}
        <div className="passport-modal__tabs" role="tablist" aria-label="Passport format">
          {FORMAT_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeFormat === tab.id}
              className={`passport-modal__tab${activeFormat === tab.id ? ' passport-modal__tab--active' : ''}`}
              onClick={() => {
                setActiveFormat(tab.id);
                setCopied(false);
              }}
              title={tab.description}
            >
              <span className="passport-modal__tab-icon">{tab.icon}</span>
              <span className="passport-modal__tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Format description */}
        {activeTab && (
          <p className="passport-modal__format-desc">{activeTab.description}</p>
        )}

        {/* Passport preview */}
        <textarea
          className="passport-modal__preview"
          value={currentText}
          readOnly
          spellCheck={false}
          aria-label={`Context Passport for ${activeTab?.label ?? 'selected format'}`}
          title="Passport preview — copy using the button below"
        />

        {/* Footer actions */}
        <div className="passport-modal__footer">
          <p className="passport-modal__safe-note">
            🔒 Secrets, API keys, and local paths are excluded.
          </p>
          <button
            type="button"
            className={`passport-modal__copy-btn${copied ? ' passport-modal__copy-btn--copied' : ''}`}
            onClick={() => void handleCopy()}
            title={`Copy ${activeTab?.label ?? ''} passport to clipboard`}
          >
            {copied ? `✅ Copied for ${activeTab?.label}!` : `Copy for ${activeTab?.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ContextPassportModal;
