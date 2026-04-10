import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { getProjectsPath, loadAllFromDisk, downloadAllData } from '../../services/tauriActions';
import Toggle from '../Shared/Toggle';
import ConfirmDialog from '../Shared/ConfirmDialog';

export function SettingsPrivacy() {
  const settings = useProjectStore((s) => s.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const showToast = useProjectStore((s) => s.showToast);
  const setProjects = useProjectStore((s) => s.setProjects);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const [confirmClear, setConfirmClear] = useState(false);
  const [dataPath, setDataPath] = useState<string | null>(null);

  const p = settings.privacy;
  const update = (updates: Partial<typeof p>) => {
    updateSettings({ privacy: { ...p, ...updates } });
  };

  const handleViewStoredData = async () => {
    const path = await getProjectsPath();
    setDataPath(path);
  };

  const handleClearData = async () => {
    try {
      // Load all projects then delete each one via tauriActions
      const projects = await loadAllFromDisk();
      const { deleteProject } = await import('../../services/tauriActions');
      for (const project of projects) {
        await deleteProject(project.id);
      }
      setProjects([]);
      setActiveProject(null);
      showToast('All projects deleted from this device');
    } catch {
      showToast('Could not delete all projects', 'error');
    }
    setConfirmClear(false);
  };

  return (
    <div>
      <h2 className="settings-section-title">Privacy &amp; Security</h2>

      <div className="settings-trust-box">
        🔒 Memphant keeps all your data on this device. Nothing is sent to any server.
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Cloud</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Cloud Sync</div>
            <div className="setting-description">
              Sync your projects across devices — coming soon, your data stays fully local for now
            </div>
          </div>
          <Toggle
            value={p.cloudSyncEnabled}
            onChange={() => showToast('Cloud sync is coming soon', 'info')}
            disabled
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Security</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Secrets scanner</div>
            <div className="setting-description">
              How aggressively to scan for passwords and API keys before copying
            </div>
          </div>
          <select
            className="setting-select"
            value={p.secretsScannerLevel}
            onChange={(e) => {
              update({ secretsScannerLevel: e.target.value as 'standard' | 'strict' });
              showToast('Security level updated');
            }}
          >
            <option value="standard">Standard</option>
            <option value="strict">Strict</option>
          </select>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Your Data</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Stored data</div>
            <div className="setting-description">
              {dataPath ? (
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.78rem',
                    color: '#a0cfff',
                    wordBreak: 'break-all',
                  }}
                >
                  {dataPath}
                </span>
              ) : (
                'View where your projects are saved on this device'
              )}
            </div>
          </div>
          <button
            className="setting-btn"
            onClick={() => void handleViewStoredData()}
          >
            View stored data
          </button>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Download all my data</div>
            <div className="setting-description">
              Export all your projects and settings as a single JSON file — for backup or GDPR requests
            </div>
          </div>
          <button
            className="setting-btn"
            onClick={() => void downloadAllData()}
          >
            Download data
          </button>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Clear all data</div>
            <div className="setting-description">
              Delete all projects from this device — cannot be undone
            </div>
          </div>
          <button
            className="setting-btn setting-btn--danger"
            onClick={() => setConfirmClear(true)}
          >
            Clear all data
          </button>
        </div>
      </div>

      {confirmClear && (
        <ConfirmDialog
          title="Delete all projects?"
          message="This will permanently delete all your projects from this device. This cannot be undone."
          confirmLabel="Delete Everything"
          onConfirm={() => void handleClearData()}
          onCancel={() => setConfirmClear(false)}
          dangerous
        />
      )}
    </div>
  );
}

export default SettingsPrivacy;
