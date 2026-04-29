/** iOS-style toggle switch */
import './Toggle.css';

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
  title?: string;
}

export function Toggle({ value, onChange, disabled = false, label, title }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={value}
      aria-label={label}
      title={title}
      className={`toggle ${value ? 'toggle--on' : ''} ${disabled ? 'toggle--disabled' : ''}`}
      onClick={() => !disabled && onChange(!value)}
      type="button"
    >
      <span className="toggle-dot" />
    </button>
  );
}

export default Toggle;
