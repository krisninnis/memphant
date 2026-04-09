import { useProjectStore } from '../../store/projectStore';
import Toggle from '../Shared/Toggle';

export function SettingsProjects() {
  const settings = useProjectStore((s) => s.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const showToast = useProjectStore((s) => s.showToast);
  const subscriptionTier = useProjectStore((s) => s.subscriptionTier);

  const isPro = subscriptionTier === 'pro' || subscriptionTier === 'team';

  const p = settings.projects;
  const update = (updates: Partial<typeof p>) => {
    updateSettings({ projects: { ...p, ...updates } });
    showToast('Setting saved');
  };

  return (
    <div>
      <h2 className="settings-section-title">Projects</h2>
      <p className="settings-section-subtitle">How your projects are managed and saved</p>

      <div className="settings-group">
        <div className="settings-group-title">Folders</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Auto-rescan on open</div>
            <div className="setting-description">
              Automatically scan the linked folder when you open a project
            </div>
          </div>
          <Toggle
            value={p.autoRescanOnOpen}
            onChange={(v) => update({ autoRescanOnOpen: v })}
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">History</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Snapshot history</div>
            <div className="setting-description">How many versions of each project to keep</div>
          </div>
          <select
            className="setting-select"
            value={p.snapshotCount}
            onChange={(e) => update({ snapshotCount: Number(e.target.value) })}
          >
            <option value={10}>10 versions</option>
            <option value={20}>20 versions</option>
            <option value={50}>50 versions</option>
          </select>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Handoffs</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Default handoff mode</div>
            <div className="setting-description">
              How much information is included when you copy to an AI
            </div>
          </div>
          <select
            className="setting-select"
            value={p.defaultExportMode}
            onChange={(e) => update({ defaultExportMode: e.target.value as typeof p.defaultExportMode })}
          >
            <option value="full">Full — everything</option>
            <option value="smart" disabled={!isPro}>
              Smart — auto-condensed{isPro ? '' : ' (Pro)'}
            </option>
            <option value="delta">Changes only</option>
            <option value="specialist">Specialist task</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default SettingsProjects;
