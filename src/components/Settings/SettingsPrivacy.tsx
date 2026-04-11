import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { getProjectsPath, loadAllFromDisk, downloadAllData } from '../../services/tauriActions';
import { checkOllamaAvailability } from '../../services/localAiService';
import ConfirmDialog from '../Shared/ConfirmDialog';
import Toggle from '../Shared/Toggle';
import '../Shared/Toggle.css';

export function SettingsPrivacy() {
  const showToast = useProjectStore((s) => s.showToast);
  const setProjects = useProjectStore((s) => s.setProjects);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const setSettingsTab = useProjectStore((s) => s.setSettingsTab);
  const settings = useProjectStore((s) => s.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const [confirmClear, setConfirmClear] = useState(false);
  const [dataPath, setDataPath] = useState<string | null>(null);

  const p = settings.privacy;
  const update = (updates: Partial<typeof p>) => {
    updateSettings({ privacy: { ...p, ...updates } });
  };

  const localAi = settings.localAi;
  const updateLocalAi = (updates: Partial<typeof localAi>, opts?: { toast?: boolean }) => {
    updateSettings({ localAi: { ...localAi, ...updates } });
    if (opts?.toast) {
      showToast('Setting saved');
    }
  };

  const handleTestLocalAi = async () => {
    const endpoint = localAi.endpoint?.trim();
    if (!endpoint) {
      showToast('Set an Ollama endpoint first', 'error');
      return;
    }

    const ok = await checkOllamaAvailability(endpoint);
    if (ok) {
      showToast('Ollama is reachable', 'success');
    } else {
      showToast('Could not reach Ollama at that endpoint', 'error');
    }
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
        🔒 Memephant keeps all your data on this device. Nothing is sent to any server.
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Cloud</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Cloud Backup &amp; Sync</div>
            <div className="setting-description">
              Back up your projects and sync across devices — sign in to get started
            </div>
          </div>
          <button
            className="setting-btn"
            onClick={() => setSettingsTab('sync')}
          >
            Open Cloud Backup →
          </button>
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
        <div className="settings-group-title">Local AI (Optional)</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Use local Ollama model</div>
            <div className="setting-description">
              Optional. If enabled and available, Memephant will try Ollama to extract structured updates, then fall back safely.
            </div>
          </div>
          <Toggle
            value={localAi.enabled}
            onChange={(v) => updateLocalAi({ enabled: v }, { toast: true })}
          />
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Ollama endpoint</div>
            <div className="setting-description">Default: http://127.0.0.1:11434</div>
          </div>
          <input
            className="setting-select"
            value={localAi.endpoint}
            onChange={(e) => updateLocalAi({ endpoint: e.target.value })}
            placeholder="http://127.0.0.1:11434"
            spellCheck={false}
            inputMode="url"
            disabled={!localAi.enabled}
          />
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Model</div>
            <div className="setting-description">Example: llama3.1:8b</div>
          </div>
          <input
            className="setting-select"
            value={localAi.model}
            onChange={(e) => updateLocalAi({ model: e.target.value })}
            placeholder="llama3.1:8b"
            spellCheck={false}
            disabled={!localAi.enabled}
          />
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Connection</div>
            <div className="setting-description">Check whether Ollama is running at your configured endpoint</div>
          </div>
          <button
            className="setting-btn"
            onClick={() => void handleTestLocalAi()}
            disabled={!localAi.enabled}
          >
            Test connection
          </button>
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
