interface EditableFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}

export function EditableField({
  label,
  value,
  onChange,
  multiline = false,
  placeholder,
}: EditableFieldProps) {
  return (
    <div className="editable-field">
      <label className="editable-field__label">{label}</label>
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
