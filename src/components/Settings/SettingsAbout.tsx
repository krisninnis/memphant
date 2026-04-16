import { useState, useEffect } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  checkForUpdate,
  downloadAndInstall,
  relaunch,
  getInstalledVersion,
} from '../../services/updater';
import type { UpdateInfo } from '../../services/updater';
import { usePWA } from '../../hooks/usePWA';
import { PWAInstallButton } from '../PWAInstallButton';

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

function statusDescription(phase: UpdatePhase, info: UpdateInfo | null, progress: number): string {
  switch (phase) {
    case 'idle':
      return 'Check if a newer version is available';
    case 'checking':
      return 'Checking for updates...';
    case 'available':
      return `Memephant ${info?.version} is available`;
    case 'up-to-date':
      return "You're on the latest version";
    case 'downloading':
      return `Downloading update... ${progress}%`;
    case 'ready':
      return 'Update installed - restart to finish';
    case 'error':
      return 'Could not check for updates - check your connection';
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
    } else {
      setInstalledVersion('0.2.0');
    }
  }, []);

  useEffect(() => {
    if (!isTauri() || phase !== 'idle') return;

    const timer = setTimeout(() => {
      void silentCheck();
    }, 800);

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
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🐘</div>
        <h2 className="settings-section-title" style={{ textAlign: 'center' }}>
          Memephant
        </h2>
        <p style={{ color: '#666', fontSize: 13 }}>
          Keep your project context ready for any AI.
        </p>
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

          <div className="setting-row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div className="setting-info" style={{ flex: 1 }}>
              <div className="setting-label">
                {updateAvailable ? 'New browser app version available' : 'Browser app version'}
              </div>
              <div className="setting-description">
                {updateAvailable
                  ? 'A new version is ready. Apply the update to refresh Memephant.'
                  : 'Check whether a newer PWA version is available.'}
              </div>
              {lastChecked && (
                <div style={{ color: '#777', fontSize: 12, marginTop: 6 }}>
                  Last checked: {lastChecked.toLocaleString()}
                </div>
              )}
            </div>

            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
              }}
            >
              <button
                className="setting-btn"
                onClick={() => void checkForUpdates()}
                disabled={isChecking}
                style={{ minWidth: 140 }}
              >
                {isChecking
                  ? 'Checking...'
                  : updateAvailable
                    ? 'Update available'
                    : 'Check for updates'}
              </button>

              {updateAvailable && (
                <button
                  className="setting-btn setting-btn--primary"
                  onClick={applyUpdate}
                  style={{ minWidth: 120 }}
                >
                  Apply update
                </button>
              )}
            </div>
          </div>

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

          <div className="setting-row" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div className="setting-info" style={{ flex: 1 }}>
              <div
                className="setting-label"
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                {statusIcon(phase) && <span style={{ fontSize: 12 }}>{statusIcon(phase)}</span>}
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
                  style={{ minWidth: 140 }}
                >
                  {phase === 'checking' ? 'Checking...' : 'Check for updates'}
                </button>
              )}
            </div>
          </div>

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
              <div className="about-release-notes__title">What's new</div>
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
              Update check failed. Make sure you're connected to the internet, then try again.{' '}
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

      <div className="settings-trust-box" style={{ marginTop: 8 }}>
        Your project memory stays local first. Cloud backup is optional, and AI exports only happen
        when you explicitly copy them.
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#444' }}>
        Memephant is not affiliated with OpenAI, Anthropic, xAI, Perplexity, or Google.
      </div>
    </div>
  );
}

export default SettingsAbout;
