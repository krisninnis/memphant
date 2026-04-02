/** iOS-style toggle switch */
import './Toggle.css';

interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export function Toggle({ value, onChange, disabled = false, label }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={value}
      aria-label={label}
      className={`toggle ${value ? 'toggle--on' : ''} ${disabled ? 'toggle--disabled' : ''}`}
      onClick={() => !disabled && onChange(!value)}
      type="button"
    >
      <span className="toggle-dot" />
    </button>
  );
}

export default Toggle;
