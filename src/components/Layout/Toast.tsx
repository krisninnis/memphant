import { useProjectStore } from '../../store/projectStore';

export function Toast() {
  const toastMessage = useProjectStore((s) => s.toastMessage);

  if (!toastMessage) return null;

  return (
    <div className="toast">
      <span className="toast__message">{toastMessage}</span>
    </div>
  );
}

export default Toast;
