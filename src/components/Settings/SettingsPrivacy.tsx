import { useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { getProjectsPath, loadAllFromDisk, downloadAllData } from '../../services/tauriActions';
import { checkOllamaAvailability, checkModelExists } from '../../services/localAiService';
import ConfirmDialog from '../Shared/ConfirmDialog';
import Toggle from '../Shared/Toggle';
import '../Shared/Toggle.css';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

type LocalAiConnectionStatus =
  | 'not_tested'
  | 'checking'
  | 'connected'
  | 'failed'
  | 'model_missing';

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '');
}

async function fetchJsonWithTimeout<T>(
  url: string,
  opts: RequestInit,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(id);
  }
}

async function openExternalUrl(url: string): Promise<void> {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    const opener = await import(/* @vite-ignore */ '@tauri-apps/plugin-opener');
    await opener.openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function SettingsPrivacy() {
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
  const [localAiStatus, setLocalAiStatus] = useState<{
    status: LocalAiConnectionStatus;
    endpoint?: string;
    checkedAt?: string;
  }>({ status: 'not_tested' });
  const [localAiPulling, setLocalAiPulling] = useState(false);

  const resetLocalAiStatus = () => {
    setLocalAiStatus({ status: 'not_tested' });
    setLocalAiPulling(false);
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

  const handleTestLocalAi = async () => {
    console.log('[LocalAI] Test clicked');
    if (!localAi.enabled) return;
    if (!inTauri) {
      showToast('Local AI testing is available in the desktop app', 'info');
      return;
    }

    const endpoint = localAi.endpoint?.trim();
    console.log('[LocalAI] Endpoint:', endpoint);
    if (!endpoint) {
      showToast('Checking Ollama...', 'info');
      showToast('Set an Ollama endpoint first', 'error');
      setLocalAiStatus({ status: 'failed', endpoint, checkedAt: new Date().toISOString() });
      return;
    }

    setLocalAiStatus({ status: 'checking', endpoint, checkedAt: new Date().toISOString() });
    showToast('Checking Ollama...', 'info');

    const ok = await checkOllamaAvailability(endpoint);
    console.log('[LocalAI] Result:', ok);

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
      showToast('Could not connect to Ollama', 'error');
      setLocalAiStatus({ status: 'failed', endpoint, checkedAt: new Date().toISOString() });
      return;
    }

    const model = useProjectStore.getState().settings.localAi.model?.trim() ?? '';
    if (!model) {
      showToast('Model not found', 'error');
      setLocalAiStatus({ status: 'model_missing', endpoint, checkedAt: new Date().toISOString() });
      return;
    }

    const exists = await checkModelExists(endpoint, model);
    if (!exists) {
      showToast('Model not found', 'error');
      setLocalAiStatus({ status: 'model_missing', endpoint, checkedAt: new Date().toISOString() });
      return;
    }

    showToast('Ollama connected', 'success');
    setLocalAiStatus({ status: 'connected', endpoint, checkedAt: new Date().toISOString() });
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
    setLocalAiStatus({ status: 'model_missing', endpoint, checkedAt: new Date().toISOString() });

    try {
      const base = normalizeEndpoint(endpoint);
      await fetchJsonWithTimeout(
        `${base}/api/pull`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: model, stream: false }),
        },
        600_000,
      );

      const exists = await checkModelExists(endpoint, model);
      if (exists) {
        showToast('Model downloaded', 'success');
        setLocalAiStatus({ status: 'connected', endpoint, checkedAt: new Date().toISOString() });
      } else {
        showToast('Model download did not complete', 'error');
        setLocalAiStatus({ status: 'model_missing', endpoint, checkedAt: new Date().toISOString() });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not download model', 'error');
      setLocalAiStatus({ status: 'model_missing', endpoint, checkedAt: new Date().toISOString() });
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
        By default, Memephant keeps your data on this device. Cloud Backup is optional and only used if you sign in.
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
            <div className="setting-description">
              {localAi.enabled
                ? 'Check whether Ollama is running at your configured endpoint'
                : 'Optional and local-only. Enable Private Mode to configure and test Ollama.'}
              {!inTauri && (
                <div className="setting-desc-muted" style={{ marginTop: 6 }}>
                  In browser mode, we can’t test Ollama on localhost (blocked by CORS). Use the desktop app.
                </div>
              )}
            </div>
          </div>
          <button
            className="setting-btn"
            onClick={() => void handleTestLocalAi()}
            disabled={!localAi.enabled || !inTauri}
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
              {localAiStatus.status === 'connected' && <span>Connected</span>}
              {localAiStatus.status === 'model_missing' && <span>Model not found</span>}
              {localAiStatus.status === 'failed' && <span>Could not connect</span>}
              {!inTauri && (
                <div className="setting-desc-muted" style={{ marginTop: 6 }}>
                  Browser builds can’t reach `http://127.0.0.1:11434` reliably. Install the desktop app to use Private Mode.
                </div>
              )}
              {localAiStatus.endpoint && (
                <div className="setting-mono-small">
                  {localAiStatus.endpoint}
                </div>
              )}

              {localAiStatus.status === 'failed' && (
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

              {localAiStatus.status === 'model_missing' && (
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
