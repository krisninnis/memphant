/** Decision card — shows a decision with optional rationale and source */
import { useState } from 'react';
import type { Decision } from '../../types/memphant-types';

interface DecisionCardProps {
  decision: Decision;
  onRemove: () => void;
}

export function DecisionCard({ decision, onRemove }: DecisionCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="decision-card">
      <div className="decision-card__header">
        <button
          className="decision-card__toggle"
          onClick={() => setExpanded(!expanded)}
          type="button"
          aria-expanded={expanded}
        >
          <span className="decision-card__arrow">{expanded ? '▾' : '▸'}</span>
          <span className="decision-card__text">{decision.decision}</span>
        </button>
        <button
          className="list-item-remove"
          onClick={onRemove}
          type="button"
          aria-label="Remove decision"
        >
          ×
        </button>
      </div>
      {expanded && (
        <div className="decision-card__body">
          {decision.rationale && (
            <p className="decision-card__rationale">{decision.rationale}</p>
          )}
          {decision.alternativesConsidered && decision.alternativesConsidered.length > 0 && (
            <div className="decision-card__alternatives">
              <span className="decision-card__alt-label">Alternatives considered:</span>
              <ul>
                {decision.alternativesConsidered.map((alt, i) => (
                  <li key={i}>{alt}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {decision.source && (
        <span className="decision-card__source">from {decision.source}</span>
      )}
    </div>
  );
}

interface DecisionListProps {
  decisions: Decision[];
  onChange: (decisions: Decision[]) => void;
}

export function DecisionList({ decisions, onChange }: DecisionListProps) {
  const [newText, setNewText] = useState('');
  const [newRationale, setNewRationale] = useState('');

  const handleAdd = () => {
    if (!newText.trim()) return;
    const newDecision: Decision = {
      decision: newText.trim(),
      rationale: newRationale.trim() || undefined,
      timestamp: new Date().toISOString(),
      source: 'user',
    };
    onChange([...decisions, newDecision]);
    setNewText('');
    setNewRationale('');
  };

  const handleRemove = (index: number) => {
    onChange(decisions.filter((_, i) => i !== index));
  };

  return (
    <div className="field-group">
      <div className="field-label">Key Decisions</div>
      <div className="decision-list">
        {decisions.map((d, i) => (
          <DecisionCard key={i} decision={d} onRemove={() => handleRemove(i)} />
        ))}
        <div className="decision-add-form">
          <input
            className="field-input"
            type="text"
            placeholder="Decision made…"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <input
            className="field-input"
            type="text"
            placeholder="Why? (optional)"
            value={newRationale}
            onChange={(e) => setNewRationale(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button
            className="add-button"
            onClick={handleAdd}
            disabled={!newText.trim()}
            type="button"
          >
            + Add Decision
          </button>
        </div>
      </div>
    </div>
  );
}

export default DecisionCard;
