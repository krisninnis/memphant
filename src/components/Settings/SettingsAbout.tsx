import { useState, useEffect } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  checkForUpdate,
  downloadAndInstall,
  relaunch,
  getInstalledVersion,
} from '../../services/updater';
import type { UpdateInfo } from '../../services/updater';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const PRIVACY_SUMMARY = `Memephant stores everything on your device.
Nothing is sent to any server. No accounts. No tracking. No analytics.

Your project files live in your OS application data folder.
You can see the exact path in Settings → Privacy → View stored data.

When you click "Copy for [Platform]", text goes to your clipboard only.
Memephant never connects to ChatGPT, Claude, or any AI service directly.

Open source under MIT licence — inspect everything at github.com/krisninnis/memphant`;

// ─── Update status helpers ────────────────────────────────────────────────────

type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'ready'
  | 'error';

function statusDescription(phase: UpdatePhase, info: UpdateInfo | null, progress: number): string {
  switch (phase) {
    case 'idle':        return 'Check if a newer version is available';
    case 'checking':    return 'Checking for updates…';
    case 'available':   return `Memephant ${info?.version} is available`;
    case 'up-to-date':  return 'You\'re on the latest version';
    case 'downloading': return `Downloading update… ${progress}%`;
    case 'ready':       return 'Update installed — restart to finish';
    case 'error':       return 'Could not check for updates — check your connection';
  }
}

function statusIcon(phase: UpdatePhase): string {
  switch (phase) {
    case 'up-to-date':  return '✅';
    case 'available':   return '🆕';
    case 'downloading': return '⏳';
    case 'ready':       return '🎉';
    case 'error':       return '⚠️';
    default:            return '';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SettingsAbout() {
  const [showPrivacy, setShowPrivacy]           = useState(false);
  const [phase, setPhase]                       = useState<UpdatePhase>('idle');
  const [updateInfo, setUpdateInfo]             = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [installedVersion, setInstalledVersion] = useState<string>('…');

  // Read the real version from the binary on mount
  useEffect(() => {
    if (isTauri()) {
      void getInstalledVersion().then(setInstalledVersion);
    } else {
      setInstalledVersion('0.2.0');
    }
  }, []);

  // Auto-check once when the About tab opens (silently — only surfaces UI if update found)
  useEffect(() => {
    if (!isTauri() || phase !== 'idle') return;
    const timer = setTimeout(() => {
      void silentCheck();
    }, 800); // slight delay so the tab feels snappy
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const silentCheck = async () => {
    try {
      const info = await checkForUpdate();
      if (info) {
        setUpdateInfo(info);
        setPhase('available');
      }
      // If nothing found: stay 'idle' — don't show "up to date" when user didn't ask
    } catch {
      // Silent failure — user can still press the button manually
    }
  };

  const handleCheckForUpdates = async () => {
    if (!isTauri()) return;
    setPhase('checking');
    try {
      const info = await checkForUpdate();
      if (info) {
        setUpdateInfo(info);
        setPhase('available');
      } else {
        setPhase('up-to-date');
      }
    } catch {
      setPhase('error');
    }
  };

  const handleInstallUpdate = async () => {
    setPhase('downloading');
    setDownloadProgress(0);
    try {
      await downloadAndInstall((pct) => setDownloadProgress(pct));
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  };

  const handleRelaunch = () => {
    void relaunch();
  };

  const openLink = (url: string) => {
    if (isTauri()) {
      void openUrl(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div>
      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🐘</div>
        <h2 className="settings-section-title" style={{ textAlign: 'center' }}>
          Memephant
        </h2>
        <p style={{ color: '#666', fontSize: 13 }}>
          Remember your projects so your AIs don&apos;t have to.
        </p>
      </div>

      {/* App details */}
      <div className="settings-group">
        <div className="settings-group-title">Details</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Version</div>
          </div>
          <span className="setting-badge">v{installedVersion}</span>
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
          <button
            className="setting-btn"
            onClick={() => openLink('https://github.com/krisninnis/memphant')}
          >
            View on GitHub
          </button>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Report a bug</div>
            <div className="setting-description">Something not working? Open an issue on GitHub</div>
          </div>
          <button
            className="setting-btn"
            onClick={() => openLink('https://github.com/krisninnis/memphant/issues/new?template=bug_report.md&labels=bug')}
          >
            Report a bug
          </button>
        </div>
      </div>

      {/* Updates — iOS-style */}
      {isTauri() && (
        <div className="settings-group">
          <div className="settings-group-title">Updates</div>

          <div className="setting-row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div className="setting-info" style={{ flex: 1 }}>
              <div className="setting-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {statusIcon(phase) && (
                  <span style={{ fontSize: 16 }}>{statusIcon(phase)}</span>
                )}
                {phase === 'available' && updateInfo
                  ? `Memephant ${updateInfo.version} is available`
                  : phase === 'ready'
                  ? 'Update ready'
                  : 'App version'}
              </div>
              <div className="setting-description">
                {statusDescription(phase, updateInfo, downloadProgress)}
              </div>
            </div>

            {/* Action button — changes based on phase */}
            <div style={{ flexShrink: 0 }}>
              {phase === 'ready' ? (
                <button
                  className="setting-btn setting-btn--primary"
                  onClick={handleRelaunch}
                  style={{ minWidth: 120 }}
                >
                  Restart now
                </button>
              ) : phase === 'available' ? (
                <button
                  className="setting-btn setting-btn--primary"
                  onClick={() => void handleInstallUpdate()}
                  style={{ minWidth: 120 }}
                >
                  Install update
                </button>
              ) : (
                <button
                  className="setting-btn"
                  onClick={() => void handleCheckForUpdates()}
                  disabled={phase === 'checking' || phase === 'downloading'}
                  style={{ minWidth: 120 }}
                >
                  {phase === 'checking' ? 'Checking…' : 'Check for updates'}
                </button>
              )}
            </div>
          </div>

          {/* Download progress bar */}
          {phase === 'downloading' && (
            <div className="about-update-progress">
              <div className="about-update-progress__track">
                <div
                  className="about-update-progress__fill"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <span className="about-update-progress__label">{downloadProgress}%</span>
            </div>
          )}

          {/* Release notes — shown when update is available */}
          {phase === 'available' && updateInfo?.body && (
            <div className="about-release-notes">
              <div className="about-release-notes__title">What&apos;s new</div>
              <div className="about-release-notes__body">
                {updateInfo.body.slice(0, 600)}
              </div>
            </div>
          )}

          {/* Ready state — explain what happened */}
          {phase === 'ready' && (
            <div className="about-update-ready">
              Memephant has been updated. Click <strong>Restart now</strong> to reopen with the new version.
              Your projects are safe — nothing changes when you update.
            </div>
          )}

          {/* Error state */}
          {phase === 'error' && (
            <div className="about-update-error">
              ⚠️ Update check failed. Make sure you&apos;re connected to the internet, then try again.{' '}
              <button
                className="about-update-error-retry"
                onClick={() => { setPhase('idle'); void handleCheckForUpdates(); }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Privacy */}
      <div className="settings-group">
        <div className="settings-group-title">Privacy</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Privacy policy</div>
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
          <div className="about-privacy-body">
            {PRIVACY_SUMMARY}
          </div>
        )}
      </div>

      <div className="settings-trust-box" style={{ marginTop: 8 }}>
        🔒 Your data stays on this device. Nothing is sent to any server. No accounts required.
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#444' }}>
        Memephant is not affiliated with OpenAI, Anthropic, xAI, Perplexity, or Google.
      </div>
    </div>
  );
}

export default SettingsAbout;
