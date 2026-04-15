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
  checkpoint?: {
    id: string;
    platform: string;
    timestamp: string;
    summary: string;
  } | null;
  detectionMeta?: {
    source: string;
    confidence: number;
  } | null;
  onApplySafe: () => void;
  onApplyAll: () => void;
  onDiscard: () => void;
}

interface SummaryGroup {
  action: DiffResult['action'];
  fields: string[];
  itemCount: number;
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

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function joinWithAnd(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function getDiffItemCount(diff: DiffResult): number {
  if (Array.isArray(diff.newValue)) return diff.newValue.length;
  if (Array.isArray(diff.oldValue)) return diff.oldValue.length;
  return 1;
}

function buildSummaryGroups(diffs: DiffResult[]): SummaryGroup[] {
  const grouped = new Map<DiffResult['action'], SummaryGroup>();

  for (const diff of diffs) {
    const existing = grouped.get(diff.action);

    if (existing) {
      if (!existing.fields.includes(diff.field)) {
        existing.fields.push(diff.field);
      }
      existing.itemCount += getDiffItemCount(diff);
      continue;
    }

    grouped.set(diff.action, {
      action: diff.action,
      fields: [diff.field],
      itemCount: getDiffItemCount(diff),
    });
  }

  return (['updated', 'added', 'removed'] as const)
    .map((action) => grouped.get(action))
    .filter((group): group is SummaryGroup => Boolean(group));
}

function buildSummarySentence(diffs: DiffResult[]): string {
  const groups = buildSummaryGroups(diffs);

  if (groups.length === 0) {
    return 'This update is ready to review.';
  }

  const clauses = groups.map((group) => {
    const labels = joinWithAnd(group.fields.map((field) => fieldLabel(field)));

    if (group.action === 'updated') {
      const fieldCount = group.fields.length;
      return `update ${fieldCount} ${pluralize(fieldCount, 'field')} (${labels})`;
    }

    const itemWord = group.action === 'removed' ? 'remove' : 'add';
    return `${itemWord} ${group.itemCount} ${pluralize(group.itemCount, 'item')} across ${labels}`;
  });

  return `This update will ${joinWithAnd(clauses)}.`;
}

function buildSummaryChips(diffs: DiffResult[]): string[] {
  return buildSummaryGroups(diffs).map((group) => {
    const labels = group.fields.map((field) => fieldLabel(field));

    if (group.action === 'updated') {
      return `Update ${joinWithAnd(labels)}`;
    }

    const noun = labels.length === 1 ? labels[0] : `${labels.length} sections`;
    const verb = group.action === 'removed' ? 'Remove' : 'Add';
    return `${verb} ${group.itemCount} ${noun}`;
  });
}

function formatCheckpointTime(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function DiffPreview({
  diffs,
  checkpoint,
  detectionMeta,
  onApplySafe,
  onApplyAll,
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
  const summaryText = buildSummarySentence(diffs);
  const summaryChips = buildSummaryChips(diffs);
  const riskyDiffs = diffs.filter((diff) => diff.riskyOverwrite);
  const safeDiffCount = diffs.length - riskyDiffs.length;

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

      {checkpoint && (
        <div className="diff-preview__summary" aria-label="Checkpoint summary">
          <p className="diff-preview__summary-text">
            Comparing this AI response against the last {checkpoint.platform} checkpoint from{' '}
            {formatCheckpointTime(checkpoint.timestamp)}.
          </p>
          {checkpoint.summary && (
            <div className="diff-preview__summary-chips">
              <span className="diff-preview__summary-chip">{checkpoint.summary}</span>
            </div>
          )}
        </div>
      )}

      {fallbackUsed && (
        <div className="diff-warning">
          Warning:{' '}
          {isHighConfidence
            ? `Local AI detected this update (${confidencePercent}% confidence)`
            : `Low confidence detection (${confidencePercent}%) - review carefully`}
        </div>
      )}

      {riskyDiffs.length > 0 && (
        <div className="diff-warning">
          Risky overwrite{riskyDiffs.length !== 1 ? 's' : ''} detected in{' '}
          {joinWithAnd(riskyDiffs.map((diff) => fieldLabel(diff.field)))}. These fields changed since the last checkpoint and will only be overwritten if you choose Apply all.
        </div>
      )}

      <div className="diff-preview__summary" aria-label="Update summary">
        <p className="diff-preview__summary-text">{summaryText}</p>
        <div className="diff-preview__summary-chips">
          {summaryChips.map((chip) => (
            <span key={chip} className="diff-preview__summary-chip">
              {chip}
            </span>
          ))}
        </div>
      </div>

      <div className="diff-preview__list">
        {diffs.map((diff, index) => (
          <div
            key={`${diff.field}-${diff.action}-${index}`}
            className={`diff-item diff-item--${diff.action}${diff.riskyOverwrite ? ' diff-item--risky' : ''}`}
          >
            <span className="diff-item__field">{fieldLabel(diff.field)}</span>

            <span className="diff-item__action" aria-hidden="true">
              {diff.action === 'added' ? '+' : diff.action === 'removed' ? '-' : '~'}
            </span>

            <span className="diff-item__value">
              {diff.action === 'updated' && diff.riskyOverwrite
                ? `Checkpoint: "${renderValue(diff.checkpointValue)}" · Current: "${renderValue(diff.oldValue)}" -> AI: "${renderValue(diff.newValue)}"`
                : diff.action === 'updated'
                ? `"${renderValue(diff.oldValue)}" -> "${renderValue(diff.newValue)}"`
                : renderValue(diff.newValue ?? diff.oldValue)}
            </span>
          </div>
        ))}
      </div>

      <div className="diff-preview__actions">
        <button type="button" className="diff-apply" onClick={onApplySafe}>
          Apply safe only
        </button>
        <button type="button" className="diff-discard" onClick={onApplyAll}>
          Apply all
        </button>
        <button type="button" className="diff-discard" onClick={onDiscard}>
          Cancel
        </button>
      </div>

      {riskyDiffs.length > 0 && safeDiffCount >= 0 && (
        <p className="diff-preview__summary-text" style={{ marginTop: 10 }}>
          {safeDiffCount} safe change{safeDiffCount !== 1 ? 's' : ''} can be applied without overwriting newer local edits.
        </p>
      )}
    </div>
  );
}

export default DiffPreview;
