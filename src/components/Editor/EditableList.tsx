/** Editable list component — each item is a text input, + add button at bottom */
import { useRef, useState } from 'react';

interface EditableListProps {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  /** When provided, a ✨ button appears next to the label */
  onSuggest?: () => void;
}

export function EditableList({
  label,
  items,
  onChange,
  placeholder = 'Add item…',
  addLabel = '+ Add',
  onSuggest,
}: EditableListProps) {
  const [newItem, setNewItem] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (index: number, value: string) => {
    const updated = [...items];
    updated[index] = value;
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    if (!newItem.trim()) return;
    onChange([...items, newItem.trim()]);
    setNewItem('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleBlur = (index: number, value: string) => {
    if (!value.trim()) {
      handleRemove(index);
    }
  };

  return (
    <div className="field-group">
      <div className="editable-field__header">
        <div className="field-label">{label}</div>
        {onSuggest && (
          <button
            type="button"
            className="suggest-btn"
            onClick={onSuggest}
            title="Auto-fill"
          >
            ✨ Auto-fill
          </button>
        )}
      </div>
      <div className="editable-list">
        {items.map((item, index) => (
          <div key={index} className="list-item">
            <input
              className="field-input"
              type="text"
              value={item}
              onChange={(e) => handleChange(index, e.target.value)}
              onBlur={(e) => handleBlur(index, e.target.value)}
            />
            <button
              className="list-item-remove"
              onClick={() => handleRemove(index)}
              type="button"
              aria-label="Remove item"
            >
              ×
            </button>
          </div>
        ))}
        <div className="list-item list-item--add">
          <input
            ref={inputRef}
            className="field-input"
            type="text"
            placeholder={placeholder}
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="list-item-add-btn"
            onClick={handleAdd}
            type="button"
            disabled={!newItem.trim()}
          >
            {addLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default EditableList;
