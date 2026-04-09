import { useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { checkForUpdate, downloadAndInstall } from '../../services/updater';
import type { UpdateInfo } from '../../services/updater';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const PRIVACY_SUMMARY = `Project Brain stores everything on your device.
Nothing is sent to any server. No accounts. No tracking. No analytics.

Your project files live in your OS application data folder.
You can see the exact path in Settings → Privacy → View stored data.

When you click "Copy for [Platform]", text goes to your clipboard only.
Project Brain never connects to ChatGPT, Claude, or any AI service directly.

Open source under MIT licence — inspect everything at github.com/krisninnis/project-brain`;

export function SettingsAbout() {
  const [showPrivacy, setShowPrivacy]           = useState(false);
  const [updateStatus, setUpdateStatus]         = useState<'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'error'>('idle');
  const [updateInfo, setUpdateInfo]             = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const handleCheckForUpdates = async () => {
    if (!isTauri()) return;
    setUpdateStatus('checking');
    try {
      const info = await checkForUpdate();
      if (info) {
        setUpdateInfo(info);
        setUpdateStatus('available');
      } else {
        setUpdateStatus('up-to-date');
      }
    } catch {
      setUpdateStatus('error');
    }
  };

  const handleInstallUpdate = async () => {
    setUpdateStatus('downloading');
    setDownloadProgress(0);
    try {
      await downloadAndInstall((pct) => setDownloadProgress(pct));
      setUpdateStatus('idle');
    } catch {
      setUpdateStatus('error');
    }
  };

  const handleGitHub = () => {
    if (isTauri()) {
      void openUrl('https://github.com/krisninnis/project-brain');
    } else {
      window.open('https://github.com/krisninnis/project-brain', '_blank');
    }
  };

  const handleReportBug = () => {
    const url = 'https://github.com/krisninnis/project-brain/issues/new?template=bug_report.md&labels=bug';
    if (isTauri()) {
      void openUrl(url);
    } else {
      window.open(url, '_blank');
    }
  };

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
          <span className="setting-badge">0.1.0 beta</span>
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
            <div className="setting-description">MIT — free and open source forever</div>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Source code</div>
            <div className="setting-description">View, inspect, or contribute on GitHub</div>
          </div>
          <button className="setting-btn" onClick={handleGitHub}>
            View on GitHub
          </button>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Report a bug</div>
            <div className="setting-description">Something not working? Let us know on GitHub</div>
          </div>
          <button className="setting-btn" onClick={handleReportBug}>
            Report a bug
          </button>
        </div>
      </div>

      {isTauri() && (
        <div className="settings-group">
          <div className="settings-group-title">Updates</div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">App version</div>
              <div className="setting-description">
                {updateStatus === 'up-to-date' && '✅ You are on the latest version'}
                {updateStatus === 'available' && updateInfo && `🆕 Version ${updateInfo.version} available`}
                {updateStatus === 'downloading' && `⏳ Downloading… ${downloadProgress}%`}
                {updateStatus === 'error' && '⚠️ Could not check for updates'}
                {(updateStatus === 'idle' || updateStatus === 'checking') && 'Check if a newer version is available'}
              </div>
            </div>
            {updateStatus === 'available' ? (
              <button className="setting-btn setting-btn--primary" onClick={() => void handleInstallUpdate()}>
                Install update
              </button>
            ) : (
              <button
                className="setting-btn"
                onClick={() => void handleCheckForUpdates()}
                disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
              >
                {updateStatus === 'checking' ? 'Checking…' : 'Check for updates'}
              </button>
            )}
          </div>
          {updateStatus === 'available' && updateInfo?.body && (
            <div style={{ fontSize: 12, color: '#888', padding: '8px 0 4px', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
              {updateInfo.body.slice(0, 300)}
            </div>
          )}
        </div>
      )}

      <div className="settings-group">
        <div className="settings-group-title">Privacy</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Privacy Policy</div>
            <div className="setting-description">
              What data we store, what we never do, and how your files stay yours
            </div>
          </div>
          <button
            className="setting-btn"
            onClick={() => setShowPrivacy((v) => !v)}
          >
            {showPrivacy ? 'Hide' : 'Read'}
          </button>
        </div>

        {showPrivacy && (
          <div
            style={{
              background: '#0d0d0d',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              padding: '1rem 1.25rem',
              margin: '0 0 0.75rem',
              fontSize: '0.82rem',
              lineHeight: 1.7,
              color: '#b0b0b0',
              whiteSpace: 'pre-line',
            }}
          >
            {PRIVACY_SUMMARY}
          </div>
        )}
      </div>

      <div className="settings-trust-box" style={{ marginTop: 8 }}>
        🔒 Your data stays on this device. Nothing is sent to any server. No accounts required.
      </div>

      <div
        style={{
          textAlign: 'center',
          marginTop: 24,
          fontSize: 12,
          color: '#444',
        }}
      >
        Project Brain is not affiliated with OpenAI, Anthropic, xAI, Perplexity, or Google.
      </div>
    </div>
  );
}

export default SettingsAbout;
