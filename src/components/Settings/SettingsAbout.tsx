import { useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { PWAInstallButton } from '../PWAInstallButton';
import { usePWA } from '../../hooks/usePWA';
import {
  checkForUpdate,
  downloadAndInstall,
  getInstalledVersion,
  relaunch,
} from '../../services/updater';
import type { UpdateInfo } from '../../services/updater';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const PRIVACY_SUMMARY = `Memephant stores your project memory on your device first.
Cloud backup is optional. There is no tracking or analytics.

When you click "Copy for [Platform]", text goes to your clipboard only.
Memephant does not connect to ChatGPT, Claude, or any AI service directly.

Open source under the MIT license - inspect the code on GitHub.`;

type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'ready'
  | 'error';

function formatLastChecked(date: Date | null): string | null {
  if (!date) return null;

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 15_000) return 'Updated just now';
  if (diffMs < 60_000) return `Updated ${Math.max(1, Math.floor(diffMs / 1000))} seconds ago`;
  if (diffMs < 3_600_000) return `Updated ${Math.max(1, Math.floor(diffMs / 60_000))} minutes ago`;

  return `Updated ${date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })} at ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function statusDescription(phase: UpdatePhase, info: UpdateInfo | null, progress: number): string {
  switch (phase) {
    case 'idle':
      return 'Check for the latest version of Memephant.';
    case 'checking':
      return 'Checking for updates...';
    case 'available':
      return `Memephant ${info?.version} is available`;
    case 'up-to-date':
      return "You're on the latest version.";
    case 'downloading':
      return `Downloading update... ${progress}%`;
    case 'ready':
      return 'Update installed - restart to finish';
    case 'error':
      return 'Could not check for updates - check your connection';
    default:
      return '';
  }
}

function statusIcon(phase: UpdatePhase): string {
  switch (phase) {
    case 'up-to-date':
      return 'OK';
    case 'available':
      return 'NEW';
    case 'downloading':
      return '...';
    case 'ready':
      return 'READY';
    case 'error':
      return 'ERR';
    default:
      return '';
  }
}

export function SettingsAbout() {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [installedVersion, setInstalledVersion] = useState<string>('...');

  const { isChecking, updateAvailable, checkForUpdates, applyUpdate, lastChecked } = usePWA();

  useEffect(() => {
    if (isTauri()) {
      void getInstalledVersion().then(setInstalledVersion);
      return;
    }

    setInstalledVersion('0.2.0');
  }, []);

  useEffect(() => {
    if (!isTauri() || phase !== 'idle') return undefined;

    const timer = window.setTimeout(() => {
      void silentCheck();
    }, 800);

    return () => window.clearTimeout(timer);
  }, [phase]);

  const silentCheck = async () => {
    try {
      const info = await checkForUpdate();
      if (info) {
        setUpdateInfo(info);
        setPhase('available');
      } else {
        setUpdateInfo(null);
        setPhase('idle');
      }
    } catch {
      // Silent background check.
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
        setUpdateInfo(null);
        setPhase('up-to-date');
      }
    } catch {
      setUpdateInfo(null);
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
      return;
    }

    window.open(url, '_blank');
  };

  const webUpdateLabel = isChecking
    ? 'Checking updates'
    : updateAvailable
      ? 'Update available'
      : 'Check for updates';

  const webUpdateDescription = isChecking
    ? 'Checking for the latest version of Memephant...'
    : updateAvailable
      ? 'A newer version is ready. Refresh or reinstall the app to use the latest version.'
      : 'Make sure you’re using the latest version of Memephant.';

  const webUpdateButtonText = isChecking
    ? 'Checking...'
    : updateAvailable
      ? 'Install update'
      : 'Check for updates';

  return (
    <div>
      <div className="about-header">
        <div className="about-header__icon">🐘</div>
        <h2 className="settings-section-title about-header__title">Memephant</h2>
        <p className="about-header__subtitle">Keep your project context ready for any AI.</p>
      </div>

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
            <div className="setting-label">License</div>
            <div className="setting-description">MIT - free and open source</div>
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
            <div className="setting-description">Open an issue on GitHub if something is not working.</div>
          </div>
          <button
            className="setting-btn"
            onClick={() =>
              openLink(
                'https://github.com/krisninnis/memphant/issues/new?template=bug_report.md&labels=bug',
              )
            }
          >
            Report a bug
          </button>
        </div>
      </div>

      {!isTauri() && (
        <div className="settings-group">
          <div className="settings-group-title">App Updates</div>

          <div className="setting-row setting-row--update">
            <div className="setting-info setting-info--grow">
              <div className="setting-label">{webUpdateLabel}</div>
              <div className="setting-description">{webUpdateDescription}</div>
              {formatLastChecked(lastChecked) && (
                <div className="about-update-timestamp">{formatLastChecked(lastChecked)}</div>
              )}
            </div>

            <div className="about-update-actions">
              <button
                className="setting-btn"
                onClick={() => void checkForUpdates()}
                disabled={isChecking}
              >
                {webUpdateButtonText}
              </button>

              {updateAvailable && (
                <button
                  className="setting-btn setting-btn--primary"
                  onClick={() => void applyUpdate()}
                >
                  Install update
                </button>
              )}
            </div>
          </div>

          {!isChecking && !updateAvailable && lastChecked && (
            <div className="settings-trust-box" style={{ marginTop: 12 }}>
              You’re already on the latest version.
            </div>
          )}

          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Install App</div>
              <div className="setting-description">
                Install Memephant for quick access from your device.
              </div>
            </div>
            <PWAInstallButton variant="settings" />
          </div>
        </div>
      )}

      {isTauri() && (
        <div className="settings-group">
          <div className="settings-group-title">Updates</div>

          <div className="setting-row setting-row--update">
            <div className="setting-info setting-info--grow">
              <div className="setting-label about-update-label">
                {statusIcon(phase) && <span style={{ fontSize: 12 }}>{statusIcon(phase)}</span>}
                {phase === 'available' && updateInfo
                  ? `Memephant ${updateInfo.version} is available`
                  : phase === 'ready'
                    ? 'Update ready'
                    : 'Check for updates'}
              </div>
              <div className="setting-description">
                {statusDescription(phase, updateInfo, downloadProgress)}
              </div>
            </div>

            <div className="about-update-actions">
              {phase === 'ready' ? (
                <button className="setting-btn setting-btn--primary" onClick={handleRelaunch}>
                  Restart now
                </button>
              ) : phase === 'available' ? (
                <button
                  className="setting-btn setting-btn--primary"
                  onClick={() => void handleInstallUpdate()}
                >
                  Install update
                </button>
              ) : (
                <button
                  className="setting-btn"
                  onClick={() => void handleCheckForUpdates()}
                  disabled={phase === 'checking' || phase === 'downloading'}
                >
                  {phase === 'checking' ? 'Checking...' : 'Check for updates'}
                </button>
              )}
            </div>
          </div>

          {phase === 'up-to-date' && (
            <div className="settings-trust-box" style={{ marginTop: 12 }}>
              You’re already on the latest version.
            </div>
          )}

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

          {phase === 'available' && updateInfo?.body && (
            <div className="about-release-notes">
              <div className="about-release-notes__title">What’s new</div>
              <div className="about-release-notes__body">{updateInfo.body.slice(0, 600)}</div>
            </div>
          )}

          {phase === 'ready' && (
            <div className="about-update-ready">
              Memephant has been updated. Click <strong>Restart now</strong> to reopen with the
              latest version. Your projects stay safe during the update.
            </div>
          )}

          {phase === 'error' && (
            <div className="about-update-error">
              Update check failed. Make sure you’re connected to the internet, then try again.{` `}
              <button
                className="about-update-error-retry"
                onClick={() => {
                  setPhase('idle');
                  void handleCheckForUpdates();
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}

      <div className="settings-group">
        <div className="settings-group-title">Privacy</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Privacy policy</div>
            <div className="setting-description">
              What data is stored locally, what cloud backup does, and what never leaves your device
            </div>
          </div>
          <button className="setting-btn" onClick={() => setShowPrivacy((v) => !v)}>
            {showPrivacy ? 'Hide' : 'Read'}
          </button>
        </div>

        {showPrivacy && <div className="about-privacy-body">{PRIVACY_SUMMARY}</div>}
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Help improve Memephant</div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <button
            className="setting-btn"
            onClick={() => openLink('https://tally.so/r/memephant')}
          >
            ✉ Send feedback
          </button>

          <button
            className="setting-btn"
            onClick={() => openLink('https://github.com/krisninnis/memphant/issues/new')}
          >
            🐛 Report a bug
          </button>
        </div>
      </div>

      <div className="settings-trust-box" style={{ marginTop: 8 }}>
        Your project memory stays local first. Cloud backup is optional, and AI exports only happen
        when you explicitly copy them.
      </div>

      <div className="about-footer-note">
        Memephant is not affiliated with OpenAI, Anthropic, xAI, Perplexity, or Google.
      </div>
    </div>
  );
}

export default SettingsAbout;
