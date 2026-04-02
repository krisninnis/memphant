import { openUrl } from '@tauri-apps/plugin-opener';

export function SettingsAbout() {
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🧠</div>
        <h2 className="settings-section-title" style={{ textAlign: 'center' }}>
          Project Brain
        </h2>
        <p style={{ color: '#666', fontSize: 13 }}>
          Remember your projects so your AIs don&apos;t have to.
        </p>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Details</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Version</div>
          </div>
          <span className="setting-badge">0.1.0</span>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Made by</div>
          </div>
          <span style={{ color: '#888', fontSize: 14 }}>Kris Ninnis</span>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Licence</div>
            <div className="setting-description">MIT — free forever</div>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Open source</div>
          </div>
          <button
            className="setting-btn"
            onClick={() => void openUrl('https://github.com/krisninnis/project-brain')}
          >
            View on GitHub
          </button>
        </div>
      </div>

      <div className="settings-trust-box" style={{ marginTop: 16 }}>
        🔒 Your data stays on this device. Nothing is sent to any server. No accounts required.
      </div>
    </div>
  );
}

export default SettingsAbout;
