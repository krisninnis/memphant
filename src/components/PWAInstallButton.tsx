import { usePWA } from '../hooks/usePWA';

interface Props {
  variant?: 'header' | 'settings';
}

export function PWAInstallButton({ variant = 'header' }: Props) {
  const { isInstallable, isInstalled, install } = usePWA();

  // Don't show in Tauri or if already installed
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return null;
  }

  if (isInstalled) {
    if (variant === 'settings') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4ade80' }}>
          <span>✓</span>
          <span>App installed</span>
        </div>
      );
    }
    return null;
  }

  if (!isInstallable) {
    if (variant === 'settings') {
      return (
        <a
          href="https://memephant.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 14, color: '#888' }}
        >
          Get the desktop app →
        </a>
      );
    }

    if (variant === 'header') {
      return (
        <button
          type="button"
          onClick={() => window.open('https://memephant.com', '_blank', 'noopener,noreferrer')}
          style={{
            background: 'transparent',
            color: 'rgba(255, 255, 255, 0.58)',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontSize: '0.8125rem',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Get the desktop app →
        </button>
      );
    }
  }

  if (variant === 'header') {
    return (
      <button
        onClick={install}
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

  return (
    <button
      onClick={install}
      className="btn btn-primary"
      style={{
        background: 'linear-gradient(135deg, #6c5ce7, #a855f7)',
        color: '#fff',
        border: 'none',
        borderRadius: '0.5rem',
        padding: '0.75rem 1.5rem',
        cursor: 'pointer',
        fontWeight: 500,
      }}
    >
      Install Memephant App
    </button>
  );
}
