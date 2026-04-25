interface Props {
  variant?: 'header' | 'settings';
}

const DOWNLOAD_URL = 'https://memephant.com/download/';

export function PWAInstallButton({ variant = 'header' }: Props) {
  // Don't show inside Tauri desktop app
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return null;
  }

  if (variant === 'settings') {
    return (
      <a
        href={DOWNLOAD_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ fontSize: 14, color: '#888' }}
      >
        Get the desktop app →
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        window.location.href = DOWNLOAD_URL;
      }}
      style={{
        background: 'linear-gradient(135deg, #6c5ce7, #a855f7)',
        color: '#fff',
        border: 'none',
        borderRadius: '0.5rem',
        padding: '0.5rem 1rem',
        cursor: 'pointer',
        fontWeight: 500,
        fontSize: '0.875rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
      }}
    >
      <span>⬇</span>
      Install App
    </button>
  );
}