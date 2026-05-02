interface EditableFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  helpText?: string;
  /** When provided, a ✨ button appears next to the label */
  onSuggest?: () => void;
  suggestLabel?: string;
}

export function EditableField({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
  helpText,
  onSuggest,
  suggestLabel = 'Auto-fill',
}: EditableFieldProps) {
  return (
    <div className="editable-field">
      <div className="editable-field__header">
        <label className="editable-field__label">{label}</label>
        {onSuggest && (
          <button
            type="button"
            className="suggest-btn"
            onClick={onSuggest}
            title={suggestLabel}
          >
            ✨ {suggestLabel}
          </button>
        )}
      </div>
      {helpText && <p className="editable-field__help">{helpText}</p>}
      {multiline ? (
        <textarea
          className="editable-field__textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
        />
      ) : (
        <input
          type="text"
          className="editable-field__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

export default EditableField;
