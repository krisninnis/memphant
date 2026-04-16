import { useProjectStore } from '../../store/projectStore';
import Toggle from '../Shared/Toggle';
import '../Shared/Toggle.css';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

const appVersion = import.meta.env.VITE_APP_VERSION || 'dev';

export function SettingsGeneral() {
  const settings = useProjectStore((s) => s.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const showToast = useProjectStore((s) => s.showToast);
  const setTourActive = useProjectStore((s) => s.setTourActive);

  const g = settings.general;
  const desktop = isTauri();

  const update = (updates: Partial<typeof g>) => {
    updateSettings({ general: { ...g, ...updates } });
  };

  return (
    <div>
      <h2 className="settings-section-title">General</h2>
      <p className="settings-section-subtitle">How Memephant looks and behaves</p>

      <div className="settings-group">
        <div className="settings-group-title">Appearance</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">App theme</div>
            <div className="setting-description">How the app looks</div>
          </div>
          <select
            className="setting-select"
            value={g.theme}
            onChange={(e) => {
              const v = e.target.value as 'dark' | 'light' | 'system';
              if (v !== 'dark') {
                showToast('Only dark theme is available right now', 'info');
                return;
              }
              update({ theme: v });
            }}
          >
            <option value="dark">Dark</option>
            <option value="light">Light (coming soon)</option>
            <option value="system">Match system (coming soon)</option>
          </select>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Default AI platform</div>
            <div className="setting-description">Which AI is selected when you open the app</div>
          </div>
          <select
            className="setting-select"
            value={g.defaultPlatform}
            onChange={(e) => update({ defaultPlatform: e.target.value as typeof g.defaultPlatform })}
          >
            <option value="claude">Claude</option>
            <option value="chatgpt">ChatGPT</option>
            <option value="grok">Grok</option>
            <option value="perplexity">Perplexity</option>
            <option value="gemini">Gemini</option>
          </select>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Behaviour</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Auto-save</div>
            <div className="setting-description">Automatically save changes as you type</div>
          </div>
          <Toggle
            value={g.autoSave}
            onChange={(v) => update({ autoSave: v })}
          />
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Run on startup</div>
            <div className="setting-description">Start Memephant when you log in</div>
          </div>
          <Toggle
            value={g.runOnStartup}
            disabled={!desktop}
            onChange={(v) => {
              if (!desktop) {
                showToast('Run on startup is available in the desktop app', 'info');
                return;
              }

              const prev = g.runOnStartup;
              update({ runOnStartup: v });

              void (async () => {
                try {
                  await tauriInvoke(v ? 'enable_autostart' : 'disable_autostart');
                  showToast(v ? 'Startup enabled' : 'Startup disabled');
                } catch (err) {
                  console.error('Autostart toggle failed:', err);
                  update({ runOnStartup: prev });
                  showToast('Could not update startup setting', 'error');
                }
              })();
            }}
          />
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">System tray</div>
            <div className="setting-description">Hide the window instead of quitting when you close it</div>
          </div>
          <Toggle
            value={g.systemTray}
            disabled={!desktop}
            onChange={(v) => {
              if (!desktop) {
                showToast('System tray mode is available in the desktop app', 'info');
                return;
              }

              const prev = g.systemTray;
              update({ systemTray: v });

              void (async () => {
                try {
                  await tauriInvoke('toggle_tray_mode', { enabled: v });
                  showToast(v ? 'Tray mode enabled' : 'Tray mode disabled');
                } catch (err) {
                  console.error('Tray toggle failed:', err);
                  update({ systemTray: prev });
                  showToast('Could not update tray mode', 'error');
                }
              })();
            }}
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Onboarding</div>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">App tour</div>
            <div className="setting-description">Replay the guided walkthrough</div>
          </div>
          <button
            className="setting-btn"
            onClick={() => {
              localStorage.removeItem('pb_tour_done');
              localStorage.removeItem('mph_intro_done');
              setTourActive(true);
              showToast('Starting tour…');
            }}
          >
            Restart Tour
          </button>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Updates</div>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">App version</div>
            <div className="setting-description">{appVersion}</div>
          </div>
          <button
            className="setting-btn"
            onClick={() => showToast("You're on the latest version", 'success')}
          >
            Check Now
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsGeneral;