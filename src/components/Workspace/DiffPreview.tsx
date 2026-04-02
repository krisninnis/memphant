/**
 * DiffPreview — shows a visual diff of changes from a pasted AI update.
 * Shown in the Paste Zone after detecting a valid update.
 */
import type { DiffResult } from '../../types/project-brain-types';
import { fieldLabel } from '../../utils/diffEngine';

interface DiffPreviewProps {
  diffs: DiffResult[];
  onApply: () => void;
  onDiscard: () => void;
}

function renderValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'object' && v !== null ? (v as { decision?: string }).decision || JSON.stringify(v) : String(v)))
      .join(', ');
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value ?? '');
}

export function DiffPreview({ diffs, onApply, onDiscard }: DiffPreviewProps) {
  if (diffs.length === 0) {
    return (
      <div className="diff-preview diff-preview--empty">
        <p>No new changes to apply.</p>
        <button className="diff-discard" onClick={onDiscard}>
          Clear
        </button>
      </div>
    );
  }

  return (
    <div className="diff-preview">
      <div className="diff-preview__header">
        <span className="diff-preview__title">
          {diffs.length} change{diffs.length !== 1 ? 's' : ''} detected
        </span>
      </div>
      <div className="diff-preview__list">
        {diffs.map((diff, i) => (
          <div key={i} className={`diff-item diff-item--${diff.action}`}>
            <span className="diff-item__field">{fieldLabel(diff.field)}</span>
            <span className="diff-item__action">
              {diff.action === 'added' ? '＋' : diff.action === 'removed' ? '－' : '✎'}
            </span>
            <span className="diff-item__value">
              {diff.action === 'updated'
                ? `"${renderValue(diff.oldValue)}" → "${renderValue(diff.newValue)}"`
                : renderValue(diff.action === 'added' ? diff.newValue : diff.oldValue)}
            </span>
          </div>
        ))}
      </div>
      <div className="diff-preview__actions">
        <button className="diff-apply" onClick={onApply}>
          Apply Changes
        </button>
        <button className="diff-discard" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}

export default DiffPreview;
