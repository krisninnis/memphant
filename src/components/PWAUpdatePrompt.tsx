import { usePWA } from '../hooks/usePWA';

export function PWAUpdatePrompt() {
  const { updateAvailable, isApplyingUpdate, updateMessage, applyUpdate, dismissUpdate } = usePWA();

  if (!updateAvailable) return null;

  return (
    <div className="pwa-update-prompt" role="status" aria-live="polite">
      <div className="pwa-update-prompt__title">Update available</div>
      <div className="pwa-update-prompt__body">
        A newer version of Memephant is ready. Update now to use the latest build.
      </div>
      {updateMessage ? <div className="pwa-update-prompt__body">{updateMessage}</div> : null}
      <div className="pwa-update-prompt__actions">
        <button
          onClick={applyUpdate}
          className="pwa-update-prompt__btn pwa-update-prompt__btn--primary"
          disabled={isApplyingUpdate}
        >
          {isApplyingUpdate ? 'Updating...' : 'Update now'}
        </button>
        <button
          onClick={dismissUpdate}
          className="pwa-update-prompt__btn pwa-update-prompt__btn--secondary"
          disabled={isApplyingUpdate}
        >
          Later
        </button>
      </div>
    </div>
  );
}
