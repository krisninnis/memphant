/**
 * DiffPreview - shows a visual diff of changes from a pasted AI update.
 * Shown in the Paste Zone after detecting a valid update.
 */
import type { DiffResult } from '../../types/memphant-types';
import { fieldLabel } from '../../utils/diffEngine';

const labelMap: Record<string, string> = {
  strict_json: 'Structured',
  code_block: 'Code Block',
  bare_json: 'Loose JSON',
  natural_language: 'Natural Language',
  smart_local_fallback: 'Local AI',
};

interface DiffPreviewProps {
  diffs: DiffResult[];
  detectionMeta?: {
    source: string;
    confidence: number;
  } | null;
  onApply: () => void;
  onDiscard: () => void;
}

function renderValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          const maybeDecision = item as { decision?: string; rationale?: string };

          if (maybeDecision.decision) {
            return maybeDecision.rationale
              ? `${maybeDecision.decision} (${maybeDecision.rationale})`
              : maybeDecision.decision;
          }

          return JSON.stringify(item);
        }

        return String(item);
      })
      .join(', ');
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }

  return String(value ?? '');
}

export function DiffPreview({
  diffs,
  detectionMeta,
  onApply,
  onDiscard,
}: DiffPreviewProps) {
  if (diffs.length === 0) {
    return (
      <div className="diff-preview diff-preview--empty">
        <p>No new changes to apply.</p>
        <button type="button" className="diff-discard" onClick={onDiscard}>
          Clear
        </button>
      </div>
    );
  }

  const fallbackUsed = detectionMeta?.source === 'smart_local_fallback';
  const confidencePercent = detectionMeta ? Math.round(detectionMeta.confidence * 100) : 0;
  const isHighConfidence = (detectionMeta?.confidence ?? 0) >= 0.75;
  const sourceLabel = detectionMeta ? (labelMap[detectionMeta.source] ?? detectionMeta.source) : '';

  return (
    <div className="diff-preview">
      <div className="diff-preview__header">
        <span className="diff-preview__title">
          {diffs.length} change{diffs.length !== 1 ? 's' : ''} detected
        </span>

        {detectionMeta && (
          <span className="diff-preview__source">
            {sourceLabel} - {confidencePercent}%
          </span>
        )}
      </div>

      {fallbackUsed && (
        <div className="diff-warning">
          Warning:{' '}
          {isHighConfidence
            ? `Local AI detected this update (${confidencePercent}% confidence)`
            : `Low confidence detection (${confidencePercent}%) - review carefully`}
        </div>
      )}

      <div className="diff-preview__list">
        {diffs.map((diff, index) => (
          <div
            key={`${diff.field}-${diff.action}-${index}`}
            className={`diff-item diff-item--${diff.action}`}
          >
            <span className="diff-item__field">{fieldLabel(diff.field)}</span>

            <span className="diff-item__action" aria-hidden="true">
              {diff.action === 'added' ? '+' : diff.action === 'removed' ? '-' : '~'}
            </span>

            <span className="diff-item__value">
              {diff.action === 'updated'
                ? `"${renderValue(diff.oldValue)}" -> "${renderValue(diff.newValue)}"`
                : renderValue(diff.newValue ?? diff.oldValue)}
            </span>
          </div>
        ))}
      </div>

      <div className="diff-preview__actions">
        <button type="button" className="diff-apply" onClick={onApply}>
          Apply changes
        </button>
        <button type="button" className="diff-discard" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}

export default DiffPreview;
