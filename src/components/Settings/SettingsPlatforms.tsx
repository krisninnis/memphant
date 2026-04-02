import { useProjectStore } from '../../store/projectStore';
import Toggle from '../Shared/Toggle';
import { PLATFORM_CONFIG } from '../../utils/platformConfig';
import type { Platform } from '../../types/project-brain-types';

const ALL_PLATFORMS: Platform[] = ['chatgpt', 'claude', 'grok', 'perplexity', 'gemini'];

export function SettingsPlatforms() {
  const settings = useProjectStore((s) => s.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const showToast = useProjectStore((s) => s.showToast);

  const enabled = settings.platforms.enabled;

  const togglePlatform = (platform: Platform, value: boolean) => {
    // Make sure at least one platform stays enabled
    const enabledCount = Object.values(enabled).filter(Boolean).length;
    if (!value && enabledCount <= 1) {
      showToast('Keep at least one AI platform enabled', 'error');
      return;
    }
    updateSettings({
      platforms: {
        enabled: { ...enabled, [platform]: value },
      },
    });
    const { name } = PLATFORM_CONFIG[platform];
    showToast(`${name} ${value ? 'enabled' : 'disabled'}`);
  };

  return (
    <div>
      <h2 className="settings-section-title">AI Platforms</h2>
      <p className="settings-section-subtitle">
        Choose which AI platforms appear in your action bar
      </p>

      <div className="settings-group">
        {ALL_PLATFORMS.map((platform) => {
          const config = PLATFORM_CONFIG[platform];
          return (
            <div className="setting-row" key={platform}>
              <div className="setting-info">
                <div className="setting-label">
                  <div className="platform-row">
                    <span className="platform-dot" style={{ background: config.color }} />
                    {config.icon} {config.name}
                  </div>
                </div>
              </div>
              <Toggle
                value={enabled[platform] ?? true}
                onChange={(v) => togglePlatform(platform, v)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SettingsPlatforms;
