import { useProjectStore } from '../../store/projectStore';
import Toggle from '../Shared/Toggle';
import '../Shared/Toggle.css';

export function SettingsGeneral() {
  const settings = useProjectStore((s) => s.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const showToast = useProjectStore((s) => s.showToast);

  const g = settings.general;

  const update = (updates: Partial<typeof g>) => {
    updateSettings({ general: { ...g, ...updates } });
  };

  return (
    <div>
      <h2 className="settings-section-title">General</h2>
      <p className="settings-section-subtitle">How Project Brain looks and behaves</p>

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
            <div className="setting-description">Start Project Brain when you log in</div>
          </div>
          <Toggle
            value={g.runOnStartup}
            onChange={(v) => {
              update({ runOnStartup: v });
              showToast('Startup setting saved', 'info');
            }}
          />
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">System tray</div>
            <div className="setting-description">Keep running in the background when you close the window</div>
          </div>
          <Toggle
            value={g.systemTray}
            onChange={(v) => {
              update({ systemTray: v });
              showToast('System tray setting saved', 'info');
            }}
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Updates</div>
        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">App version</div>
            <div className="setting-description">0.1.0</div>
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
