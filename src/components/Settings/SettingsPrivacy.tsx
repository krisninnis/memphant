import { useEffect, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { getProjectsPath, loadAllFromDisk, downloadAllData } from '../../services/tauriActions';
import {
  checkOllamaAvailability,
  checkModelExists,
  listOllamaModels,
  chooseBestOllamaModel,
  pullOllamaModel,
  DEFAULT_OLLAMA_ENDPOINT,
  DEFAULT_OLLAMA_MODEL,
} from '../../services/localAiService';
import ConfirmDialog from '../Shared/ConfirmDialog';
import Toggle from '../Shared/Toggle';
import '../Shared/Toggle.css';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

type LocalAiConnectionStatus =
  | 'not_tested'
  | 'checking'
  | 'not_installed'
  | 'no_model'
  | 'downloading'
  | 'connected'
  | 'failed';

async function openExternalUrl(url: string): Promise<void> {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    const opener = await import(/* @vite-ignore */ '@tauri-apps/plugin-opener');
    await opener.openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function formatAuditTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPlatformLabel(platform: string): string {
  switch (platform) {
    case 'chatgpt':
      return 'ChatGPT';
    case 'claude':
      return 'Claude';
    case 'grok':
      return 'Grok';
    case 'perplexity':
      return 'Perplexity';
    case 'gemini':
      return 'Gemini';
    default:
      return platform;
  }
}

export function SettingsPrivacy() {
  const projects = useProjectStore((s) => s.projects);
  const showToast = useProjectStore((s) => s.showToast);
  const setProjects = useProjectStore((s) => s.setProjects);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const setSettingsTab = useProjectStore((s) => s.setSettingsTab);
  const settings = useProjectStore((s) => s.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const [confirmClear, setConfirmClear] = useState(false);
  const [dataPath, setDataPath] = useState<string | null>(null);

  const inTauri = isTauri();

  const p = settings.privacy;
  const update = (updates: Partial<typeof p>) => {
    updateSettings({ privacy: { ...p, ...updates } });
  };

  const localAi = settings.localAi;
  const totalCheckpoints = projects.reduce((count, project) => count + (project.checkpoints?.length ?? 0), 0);
  const recentExports = projects
    .flatMap((project) =>
      (project.checkpoints ?? []).map((checkpoint) => ({
        checkpoint,
        projectName: project.name,
      })),
    )
    .sort((a, b) => new Date(b.checkpoint.timestamp).getTime() - new Date(a.checkpoint.timestamp).getTime())
    .slice(0, 5);
  const [localAiStatus, setLocalAiStatus] = useState<{
    status: LocalAiConnectionStatus;
    endpoint?: string;
    checkedAt?: string;
  }>({ status: 'not_tested' });
  const [localAiPulling, setLocalAiPulling] = useState(false);
  const [autoSetupBusy, setAutoSetupBusy] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  const resetLocalAiStatus = () => {
    setLocalAiStatus({ status: 'not_tested' });
    setLocalAiPulling(false);
  };

  const syncDetectedModels = async (
    endpoint: string,
    preferredModel?: string,
  ): Promise<string[]> => {
    const models = await listOllamaModels(endpoint);
    setAvailableModels(models);

    if (models.length > 0) {
      const best = chooseBestOllamaModel(models, preferredModel || localAi.model || DEFAULT_OLLAMA_MODEL);
      if (best && best !== useProjectStore.getState().settings.localAi.model) {
        updateSettings({
          localAi: {
            ...useProjectStore.getState().settings.localAi,
            model: best,
          },
        });
      }
    }

    return models;
  };

  const updateLocalAi = (updates: Partial<typeof localAi>, opts?: { toast?: boolean }) => {
    updateSettings({ localAi: { ...localAi, ...updates } });
    if (Object.prototype.hasOwnProperty.call(updates, 'enabled')) {
      resetLocalAiStatus();
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'endpoint')) {
      resetLocalAiStatus();
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'model')) {
      resetLocalAiStatus();
    }
    if (opts?.toast) {
      showToast('Setting saved');
    }
  };

  useEffect(() => {
    let active = true;

    if (!inTauri || !localAi.enabled) {
      setAvailableModels([]);
      return () => {
        active = false;
      };
    }

    const endpoint = localAi.endpoint?.trim() || DEFAULT_OLLAMA_ENDPOINT;

    void (async () => {
      const ok = await checkOllamaAvailability(endpoint);
      if (!active) return;

      if (!ok) {
        setAvailableModels([]);
        return;
      }

      const models = await listOllamaModels(endpoint);
      if (!active) return;

      setAvailableModels(models);

      if (models.length > 0) {
        const best = chooseBestOllamaModel(models, localAi.model || DEFAULT_OLLAMA_MODEL);
        if (best && best !== localAi.model) {
          updateSettings({
            localAi: {
              ...useProjectStore.getState().settings.localAi,
              model: best,
            },
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [inTauri, localAi.enabled, localAi.endpoint, localAi.model, updateSettings]);

  const handleTestLocalAi = async () => {
    if (!localAi.enabled) return;
    if (!inTauri) {
      showToast('Local AI testing is available in the desktop app', 'info');
      return;
    }

    const endpoint = localAi.endpoint?.trim();
    if (!endpoint) {
      showToast('Checking Ollama...', 'info');
      showToast('Set an Ollama endpoint first', 'error');
      setLocalAiStatus({ status: 'failed', endpoint, checkedAt: new Date().toISOString() });
      return;
    }

    setLocalAiStatus({ status: 'checking', endpoint, checkedAt: new Date().toISOString() });
    showToast('Checking Ollama...', 'info');

    const ok = await checkOllamaAvailability(endpoint);

    // If the user changed config while we were checking, don't show a stale result.
    const latestEndpoint =
      useProjectStore.getState().settings.localAi.endpoint?.trim() ?? '';
    const stillSameEndpoint = latestEndpoint === endpoint;
    const stillEnabled = useProjectStore.getState().settings.localAi.enabled;

    if (!stillEnabled || !stillSameEndpoint) {
      resetLocalAiStatus();
      return;
    }

    if (!ok) {
      showToast('Ollama is not installed or not running', 'error');
      setAvailableModels([]);
      setLocalAiStatus({ status: 'not_installed', endpoint, checkedAt: new Date().toISOString() });
      return;
    }

    const models = await syncDetectedModels(endpoint, useProjectStore.getState().settings.localAi.model);
    const selectedModel = useProjectStore.getState().settings.localAi.model?.trim() ?? '';

    if (models.length === 0 || !selectedModel) {
      showToast('Model not found', 'error');
      setLocalAiStatus({ status: 'no_model', endpoint, checkedAt: new Date().toISOString() });
      return;
    }

    const exists = await checkModelExists(endpoint, selectedModel);
    if (!exists) {
      showToast('Model not found', 'error');
      setLocalAiStatus({ status: 'no_model', endpoint, checkedAt: new Date().toISOString() });
      return;
    }

    showToast('Ollama connected', 'success');
    setLocalAiStatus({ status: 'connected', endpoint, checkedAt: new Date().toISOString() });
  };

  const handleAutoSetupLocalAi = async () => {
    if (!inTauri) {
      showToast('Local AI setup is available in the desktop app', 'info');
      return;
    }

    const endpoint = DEFAULT_OLLAMA_ENDPOINT;
    const desiredModel = DEFAULT_OLLAMA_MODEL;

    setAutoSetupBusy(true);
    updateSettings({
      localAi: {
        ...useProjectStore.getState().settings.localAi,
        enabled: true,
        endpoint,
        model: desiredModel,
      },
    });
    setLocalAiStatus({ status: 'checking', endpoint, checkedAt: new Date().toISOString() });

    try {
      const available = await checkOllamaAvailability(endpoint);
      if (!available) {
        setAvailableModels([]);
        setLocalAiStatus({ status: 'not_installed', endpoint, checkedAt: new Date().toISOString() });
        showToast('Install Ollama to finish Private Mode setup', 'error');
        return;
      }

      let models = await syncDetectedModels(endpoint, desiredModel);
      let selectedModel = chooseBestOllamaModel(models, desiredModel);

      const hasSelected = models.length > 0 && await checkModelExists(endpoint, selectedModel);

      if (!hasSelected) {
        setLocalAiStatus({ status: 'downloading', endpoint, checkedAt: new Date().toISOString() });
        const pulled = await pullOllamaModel(endpoint, desiredModel);
        if (!pulled) {
          setLocalAiStatus({ status: 'failed', endpoint, checkedAt: new Date().toISOString() });
          showToast('Could not download the recommended model', 'error');
          return;
        }

        models = await syncDetectedModels(endpoint, desiredModel);
        selectedModel = chooseBestOllamaModel(models, desiredModel);
      }

      if (models.length === 0) {
        setLocalAiStatus({ status: 'no_model', endpoint, checkedAt: new Date().toISOString() });
        showToast('Ollama is running, but no local model is available yet', 'error');
        return;
      }

      updateSettings({
        localAi: {
          ...useProjectStore.getState().settings.localAi,
          enabled: true,
          endpoint,
          model: selectedModel,
        },
      });

      const connected = await checkModelExists(endpoint, selectedModel);
      if (!connected) {
        setLocalAiStatus({ status: 'no_model', endpoint, checkedAt: new Date().toISOString() });
        showToast('Model not found after setup', 'error');
        return;
      }

      setLocalAiStatus({ status: 'connected', endpoint, checkedAt: new Date().toISOString() });
      showToast('Private Mode is ready', 'success');
    } finally {
      setAutoSetupBusy(false);
    }
  };

  const handleDownloadModel = async () => {
    if (!localAi.enabled) return;
    if (localAiPulling) return;

    const endpoint = localAi.endpoint?.trim();
    const model = localAi.model?.trim();
    if (!endpoint) {
      showToast('Set an Ollama endpoint first', 'error');
      return;
    }
    if (!model) {
      showToast('Set a model name first', 'error');
      return;
    }

    setLocalAiPulling(true);
    setLocalAiStatus({ status: 'downloading', endpoint, checkedAt: new Date().toISOString() });

    try {
      const pulled = await pullOllamaModel(endpoint, model);
      if (!pulled) {
        throw new Error('Could not download model');
      }

      await syncDetectedModels(endpoint, model);
      const exists = await checkModelExists(endpoint, model);
      if (exists) {
        showToast('Model downloaded', 'success');
        setLocalAiStatus({ status: 'connected', endpoint, checkedAt: new Date().toISOString() });
      } else {
        showToast('Model download did not complete', 'error');
        setLocalAiStatus({ status: 'no_model', endpoint, checkedAt: new Date().toISOString() });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not download model', 'error');
      setLocalAiStatus({ status: 'failed', endpoint, checkedAt: new Date().toISOString() });
    } finally {
      setLocalAiPulling(false);
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
        <div>Memephant is local-first. You decide when anything leaves this device.</div>
        <div className="settings-trust-list">
          <div>- Projects and checkpoints stay local by default</div>
          <div>- Cloud backup only runs if you sign in</div>
          <div>- AI exports only happen when you click copy</div>
          <div>- Private Mode keeps Local AI on this device</div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Cloud</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Cloud Backup &amp; Sync</div>
            <div className="setting-description">
              Back up your projects and sync across devices when you choose to sign in.
            </div>
          </div>
          <button
            className="setting-btn"
            onClick={() => setSettingsTab('sync')}
          >
            Open Cloud Backup
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
        <div className="settings-group-title">Local AI (Private Mode)</div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Private Mode</div>
            <div className="setting-description">
              <div className="setting-desc-stack">
                <div>Run AI locally on your device for maximum privacy.</div>
                <div className="setting-desc-bullets setting-desc-muted">
                  <div>- Runs locally on this device</div>
                  <div>- Never required for normal usage</div>
                  <div>- Uses local system resources</div>
                </div>
                <div className="setting-desc-muted">
                  When enabled, Memephant will use a local model (via Ollama) to detect project updates.
                  Your data never leaves your machine. If unavailable, Memephant safely falls back to built-in detection.
                </div>
              </div>
            </div>
          </div>
          <Toggle
            value={localAi.enabled}
            onChange={(v) => updateLocalAi({ enabled: v }, { toast: true })}
          />
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Benefits</div>
            <div className="setting-description">
              <div className="setting-desc-bullets">
                <div>- Better detection of messy AI responses</div>
                <div>- Works even when offline</div>
                <div>- Keeps your project data private</div>
              </div>
            </div>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Warnings</div>
            <div className="setting-description">
              <div className="setting-desc-bullets">
                <div>- Requires Ollama to be installed and running locally</div>
                <div>- Uses your system resources (CPU/RAM)</div>
                <div>- May feel slower on lower-end devices</div>
              </div>
            </div>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Auto setup Local AI</div>
            <div className="setting-description">
              Automatically turn on Private Mode, use the default local endpoint, install the recommended model,
              and test the connection.
            </div>
          </div>
          <button
            className="setting-btn"
            onClick={() => void handleAutoSetupLocalAi()}
            disabled={!inTauri || autoSetupBusy || localAiPulling}
          >
            {autoSetupBusy ? 'Setting up...' : 'Auto setup'}
          </button>
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
            disabled={!localAi.enabled || autoSetupBusy || localAiPulling}
          />
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Model</div>
            <div className="setting-description">
              {availableModels.length > 0
                ? `Detected ${availableModels.length} local model${availableModels.length !== 1 ? 's' : ''}`
                : 'Recommended: llama3.1:8b'}
            </div>
          </div>
          {availableModels.length > 0 ? (
            <select
              className="setting-select"
              value={localAi.model}
              onChange={(e) => updateLocalAi({ model: e.target.value })}
              disabled={!localAi.enabled || autoSetupBusy || localAiPulling}
            >
              {availableModels.map((modelName) => (
                <option key={modelName} value={modelName}>
                  {modelName}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="setting-select"
              value={localAi.model}
              onChange={(e) => updateLocalAi({ model: e.target.value })}
              placeholder="llama3.1:8b"
              spellCheck={false}
              disabled={!localAi.enabled || autoSetupBusy || localAiPulling}
            />
          )}
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Connection</div>
            <div className="setting-description">
              {localAi.enabled
                ? 'Check whether Ollama is running at your configured endpoint'
                : 'Optional and local-only. Enable Private Mode to configure and test Ollama.'}
              {!inTauri && (
                <div className="setting-desc-muted" style={{ marginTop: 6 }}>
                  In browser mode, we can't test Ollama on localhost (blocked by CORS). Use the desktop app.
                </div>
              )}
            </div>
          </div>
          <button
            className="setting-btn"
            onClick={() => void handleTestLocalAi()}
            disabled={!localAi.enabled || !inTauri || autoSetupBusy || localAiPulling}
          >
            {localAiStatus.status === 'checking' ? 'Checking...' : 'Test connection'}
          </button>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Status</div>
            <div className="setting-description">
              {localAiStatus.status === 'not_tested' && <span>Not tested</span>}
              {localAiStatus.status === 'checking' && <span>Checking connection...</span>}
              {localAiStatus.status === 'not_installed' && <span>Ollama is not installed or not running</span>}
              {localAiStatus.status === 'no_model' && <span>No local model found yet</span>}
              {localAiStatus.status === 'downloading' && <span>Downloading the recommended model...</span>}
              {localAiStatus.status === 'connected' && <span>Connected</span>}
              {localAiStatus.status === 'failed' && <span>Could not connect</span>}
              {!inTauri && (
                <div className="setting-desc-muted" style={{ marginTop: 6 }}>
                  Browser builds can't reach http://127.0.0.1:11434 reliably. Install the desktop app to use Private Mode.
                </div>
              )}
              {localAiStatus.endpoint && (
                <div className="setting-mono-small">
                  {localAiStatus.endpoint}
                </div>
              )}

              {localAiStatus.status === 'not_installed' && (
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="setting-btn"
                    onClick={() => void openExternalUrl('https://ollama.com/download')}
                    disabled={!localAi.enabled}
                  >
                    Download Ollama
                  </button>
                </div>
              )}

              {localAiStatus.status === 'no_model' && (
                <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="setting-btn"
                    onClick={() => void handleDownloadModel()}
                    disabled={!localAi.enabled || localAiPulling || !localAi.model?.trim()}
                  >
                    {localAiPulling ? 'Downloading...' : 'Download model'}
                  </button>
                </div>
              )}
            </div>
          </div>
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
              Export all your projects and settings as a single JSON file for backup or GDPR requests.
            </div>
          </div>
          <button
            className="setting-btn"
            onClick={() => void downloadAllData()}
          >
            Download data
          </button>
        </div>

        <div className="setting-row setting-row--stacked">
          <div className="setting-info">
            <div className="setting-label">Recent AI handoffs</div>
            <div className="setting-description">
              {recentExports.length > 0 ? (
                <div className="settings-audit-list">
                  {recentExports.map(({ checkpoint, projectName }) => (
                    <div key={checkpoint.id} className="settings-audit-item">
                      <div className="settings-audit-meta">
                        <strong>{projectName}</strong>
                        <span>{formatPlatformLabel(checkpoint.platform)} • {formatAuditTime(checkpoint.timestamp)}</span>
                      </div>
                      <div className="settings-audit-summary">
                        {checkpoint.summary || 'Exported project snapshot'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                'No AI exports yet. Each time you click copy, Memephant saves a checkpoint before anything is pasted back in.'
              )}
            </div>
          </div>
          <span className="setting-badge">{totalCheckpoints} checkpoint{totalCheckpoints === 1 ? '' : 's'}</span>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <div className="setting-label">Clear all data</div>
            <div className="setting-description">
              Delete all projects from this device. This cannot be undone.
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
