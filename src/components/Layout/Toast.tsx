import { useProjectStore } from '../../store/projectStore';

export function Toast() {
  const toastMessage = useProjectStore((s) => s.toastMessage);
  const toastType = useProjectStore((s) => s.toastType);

  if (!toastMessage) return null;

  const icon = toastType === 'error' ? '✕' : toastType === 'info' ? 'ℹ' : '✓';

  return (
    <div className={`toast toast--${toastType}`}>
      <span className="toast__icon">{icon}</span>
      <span className="toast__message">{toastMessage}</span>
    </div>
  );
}

export default Toast;
