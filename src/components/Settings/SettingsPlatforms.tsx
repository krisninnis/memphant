import { useMemo, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import Toggle from '../Shared/Toggle';
import type {
  CustomPlatformConfig,
  Platform,
  PlatformCategory,
  PlatformExportStyle,
} from '../../types/memphant-types';
import {
  ensureValidPlatformId,
  getEnabledPlatforms,
  makeCustomPlatformId,
  normaliseCustomPlatform,
  resolvePlatformRegistry,
} from '../../utils/platformRegistry';

type PlatformFormState = {
  id?: Platform;
  name: string;
  category: PlatformCategory;
  exportStyle: PlatformExportStyle;
  promptPrefix: string;
  icon: string;
};

const EMPTY_FORM: PlatformFormState = {
  name: '',
  category: 'custom',
  exportStyle: 'structured',
  promptPrefix: '',
  icon: '',
};

export function SettingsPlatforms() {
  const settings = useProjectStore((s) => s.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const showToast = useProjectStore((s) => s.showToast);
  const targetPlatform = useProjectStore((s) => s.targetPlatform);
  const setTargetPlatform = useProjectStore((s) => s.setTargetPlatform);

  const [form, setForm] = useState<PlatformFormState>(EMPTY_FORM);
  const [editingPlatformId, setEditingPlatformId] = useState<Platform | null>(null);

  const registry = useMemo(() => resolvePlatformRegistry(settings.platforms), [settings.platforms]);
  const builtInPlatforms = registry.filter((platform) => platform.builtIn);
  const customPlatforms = registry.filter((platform) => !platform.builtIn);

  const togglePlatform = (platformId: Platform, value: boolean) => {
    const currentEnabled = settings.platforms.enabled ?? {};
    const nextEnabled = {
      ...currentEnabled,
      [platformId]: value,
    };

    const enabledCount = Object.values(nextEnabled).filter(Boolean).length;
    if (!value && enabledCount <= 0) {
      showToast('Keep at least one AI platform enabled', 'error');
      return;
    }

    updateSettings({
      general: {
        ...settings.general,
        defaultPlatform: ensureValidPlatformId(settings.general.defaultPlatform, {
          ...settings.platforms,
          enabled: nextEnabled,
        }),
      },
      platforms: {
        ...settings.platforms,
        enabled: nextEnabled,
      },
    });

    if (!value && targetPlatform === platformId) {
      setTargetPlatform(
        ensureValidPlatformId(targetPlatform, {
          ...settings.platforms,
          enabled: nextEnabled,
        }),
      );
    }

    const platformName = registry.find((platform) => platform.id === platformId)?.name ?? platformId;
    showToast(`${platformName} ${value ? 'enabled' : 'disabled'}`);
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingPlatformId(null);
  };

  const handleSaveCustomPlatform = () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      showToast('Add a platform name first', 'error');
      return;
    }

    const nextId = editingPlatformId ?? makeCustomPlatformId(trimmedName);
    const duplicateName = settings.platforms.custom.some(
      (platform) =>
        platform.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
        platform.id !== editingPlatformId,
    );

    if (duplicateName) {
      showToast('That custom platform already exists', 'error');
      return;
    }

    const customPlatform = normaliseCustomPlatform({
      id: nextId,
      name: trimmedName,
      category: form.category,
      exportStyle: form.exportStyle,
      promptPrefix:
        form.promptPrefix.trim() ||
        'Use this project context as a structured handoff and preserve the current state.',
      icon: form.icon.trim() || undefined,
    });

    const nextCustomPlatforms = editingPlatformId
      ? settings.platforms.custom.map((platform) =>
          platform.id === editingPlatformId ? customPlatform : platform,
        )
      : [...settings.platforms.custom, customPlatform];

    updateSettings({
      platforms: {
        ...settings.platforms,
        custom: nextCustomPlatforms,
        enabled: {
          ...settings.platforms.enabled,
          [customPlatform.id]: settings.platforms.enabled[customPlatform.id] ?? true,
        },
      },
    });

    showToast(editingPlatformId ? `${trimmedName} updated` : `${trimmedName} added`);
    resetForm();
  };

  const handleEditCustomPlatform = (platformId: Platform) => {
    const platform = settings.platforms.custom.find((item) => item.id === platformId);
    if (!platform) return;

    setEditingPlatformId(platform.id);
    setForm({
      id: platform.id,
      name: platform.name,
      category: platform.category,
      exportStyle: platform.exportStyle,
      promptPrefix: platform.promptPrefix,
      icon: platform.icon ?? '',
    });
  };

  const handleDeleteCustomPlatform = (platformId: Platform) => {
    const nextCustomPlatforms = settings.platforms.custom.filter((platform) => platform.id !== platformId);
    const nextEnabled = { ...settings.platforms.enabled };
    delete nextEnabled[platformId];

    updateSettings({
      general: {
        ...settings.general,
        defaultPlatform: ensureValidPlatformId(settings.general.defaultPlatform, {
          ...settings.platforms,
          custom: nextCustomPlatforms,
          enabled: nextEnabled,
        }),
      },
      platforms: {
        ...settings.platforms,
        custom: nextCustomPlatforms,
        enabled: nextEnabled,
      },
    });

    if (targetPlatform === platformId) {
      setTargetPlatform(
        ensureValidPlatformId(targetPlatform, {
          ...settings.platforms,
          custom: nextCustomPlatforms,
          enabled: nextEnabled,
        }),
      );
    }

    showToast('Custom platform removed');
    if (editingPlatformId === platformId) {
      resetForm();
    }
  };

  const enabledCount = getEnabledPlatforms(settings.platforms).length;

  return (
    <div>
      <h2 className="settings-section-title">AI Platforms</h2>
      <p className="settings-section-subtitle">
        Choose which AIs appear in Memephant and add your own custom export targets.
      </p>

      <div className="settings-group">
        <div className="settings-group-title">Built-in platforms</div>
        {builtInPlatforms.map((platform) => (
          <div className="setting-row" key={platform.id}>
            <div className="setting-info">
              <div className="setting-label">
                <div className="platform-row">
                  <span
                    className="platform-dot"
                    style={{ background: platform.color ?? '#64748b' }}
                  />
                  {platform.icon} {platform.name}
                </div>
              </div>
              <div className="setting-description">
                {platform.description ?? `${platform.exportStyle} export for ${platform.name}`}
              </div>
            </div>
            <Toggle
              value={platform.enabled}
              disabled={platform.enabled && enabledCount <= 1}
              onChange={(value) => togglePlatform(platform.id, value)}
            />
          </div>
        ))}
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Custom platforms</div>

        {customPlatforms.length === 0 ? (
          <div className="settings-trust-box" style={{ marginBottom: 16 }}>
            Add a custom AI tool if you work with another chat app, local model UI, or internal prompt tool.
          </div>
        ) : (
          customPlatforms.map((platform) => (
            <div className="setting-row setting-row--stacked" key={platform.id}>
              <div className="setting-info">
                <div className="setting-label">
                  <div className="platform-row">
                    <span
                      className="platform-dot"
                      style={{ background: platform.color ?? '#64748b' }}
                    />
                    {platform.icon} {platform.name}
                  </div>
                </div>
                <div className="setting-description">
                  {platform.category} • {platform.exportStyle}
                </div>
                {platform.promptPrefix && (
                  <div className="setting-description">{platform.promptPrefix}</div>
                )}
              </div>

              <div className="settings-platform-actions">
                <Toggle
                  value={platform.enabled}
                  disabled={platform.enabled && enabledCount <= 1}
                  onChange={(value) => togglePlatform(platform.id, value)}
                />
                <button className="setting-btn" onClick={() => handleEditCustomPlatform(platform.id)}>
                  Edit
                </button>
                <button
                  className="setting-btn setting-btn--danger"
                  onClick={() => handleDeleteCustomPlatform(platform.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}

        <div className="settings-platform-form">
          <div className="settings-platform-form__title">
            {editingPlatformId ? 'Edit custom platform' : 'Add custom platform'}
          </div>

          <div className="settings-platform-grid">
            <label className="settings-platform-field">
              <span>Name</span>
              <input
                className="setting-select settings-platform-input"
                value={form.name}
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                placeholder="My team AI"
              />
            </label>

            <label className="settings-platform-field">
              <span>Category</span>
              <select
                className="setting-select"
                value={form.category}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    category: e.target.value as CustomPlatformConfig['category'],
                  }))
                }
              >
                <option value="chat">Chat</option>
                <option value="dev">Dev</option>
                <option value="local">Local</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label className="settings-platform-field">
              <span>Export style</span>
              <select
                className="setting-select"
                value={form.exportStyle}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    exportStyle: e.target.value as CustomPlatformConfig['exportStyle'],
                  }))
                }
              >
                <option value="structured">Structured</option>
                <option value="compact">Compact</option>
                <option value="code-heavy">Code-heavy</option>
              </select>
            </label>

            <label className="settings-platform-field">
              <span>Icon or emoji</span>
              <input
                className="setting-select settings-platform-input"
                value={form.icon}
                onChange={(e) => setForm((current) => ({ ...current, icon: e.target.value }))}
                placeholder="🧩"
              />
            </label>
          </div>

          <label className="settings-platform-field settings-platform-field--full">
            <span>Prompt instructions</span>
            <textarea
              className="setting-select settings-platform-textarea"
              value={form.promptPrefix}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  promptPrefix: e.target.value,
                }))
              }
              placeholder="Tell this AI how to use the exported project context."
            />
          </label>

          <div className="settings-platform-actions settings-platform-actions--form">
            <button className="setting-btn setting-btn--primary" onClick={handleSaveCustomPlatform}>
              {editingPlatformId ? 'Save platform' : 'Add platform'}
            </button>
            {editingPlatformId && (
              <button className="setting-btn" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPlatforms;
