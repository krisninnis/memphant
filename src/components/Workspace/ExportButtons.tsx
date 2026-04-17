import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useActiveProject } from '../../hooks/useActiveProject';
import { copyExportToClipboard } from '../../services/tauriActions';
import { formatForPlatform, setScannerLevel } from '../../utils/exportFormatters';
import { getChangesSince } from '../../utils/getChangesSince';
import { scoreExport } from '../../utils/exportQuality';
import {
  ensureValidPlatformId,
  getEnabledPlatforms,
  getPlatformConfig,
} from '../../utils/platformRegistry';

function formatSyncAge(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  if (diffM < 2) return 'Just now';
  if (diffH < 1) return `${diffM}m ago`;
  if (diffD < 1) return `${diffH}h ago`;
  if (diffD === 1) return 'Yesterday';
  return `${diffD}d ago`;
}

function formatCheckpointTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ExportButtons() {
  const [copied, setCopied] = useState(false);

  const targetPlatform = useProjectStore((s) => s.targetPlatform);
  const setTargetPlatform = useProjectStore((s) => s.setTargetPlatform);
  const currentTask = useProjectStore((s) => s.currentTask);
  const showToast = useProjectStore((s) => s.showToast);
  const settings = useProjectStore((s) => s.settings);

  const activeProject = useActiveProject();

  const enabledPlatforms = useMemo(
    () => getEnabledPlatforms(settings.platforms),
    [settings.platforms],
  );

  // Ensure valid platform selection
  useEffect(() => {
    const nextPlatformId = ensureValidPlatformId(
      targetPlatform,
      settings.platforms,
      settings.general.defaultPlatform,
    );

    if (nextPlatformId !== targetPlatform) {
      setTargetPlatform(nextPlatformId);
    }
  }, [targetPlatform, settings, setTargetPlatform]);

  const selectedPlatformId = ensureValidPlatformId(
    targetPlatform,
    settings.platforms,
    settings.general.defaultPlatform,
  );

  const selectedPlatform = getPlatformConfig(
    selectedPlatformId,
    settings.platforms,
  );

  const selectedProject = activeProject;

  const lastSeenAt = selectedProject?.platformState?.[selectedPlatform.id]?.lastSeenAt;

  const recentChanges = selectedProject
    ? getChangesSince(selectedProject, lastSeenAt)
    : [];

  const chatPlatforms = enabledPlatforms.filter((p) => p.category === 'chat');
  const devPlatforms = enabledPlatforms.filter((p) => p.category === 'dev');
  const localPlatforms = enabledPlatforms.filter((p) => p.category === 'local');

  const selectedPlatformState = selectedProject?.platformState?.[selectedPlatform.id];

  const syncLabel = selectedPlatformState?.lastExportedAt
    ? formatSyncAge(selectedPlatformState.lastExportedAt)
    : null;

  const quality = activeProject ? scoreExport(activeProject) : null;

  const allCheckpoints = activeProject?.checkpoints ?? [];

  const latestAnyCheckpoint =
    allCheckpoints.length > 0 ? allCheckpoints[allCheckpoints.length - 1] : undefined;

  const latestCheckpoint =
    [...allCheckpoints].reverse().find((c) => c.platform === selectedPlatform.id)
    ?? latestAnyCheckpoint;

  const checkpointSummary = latestCheckpoint
    ? `Last checkpoint saved ${formatSyncAge(latestCheckpoint.timestamp)}.`
    : 'Every copy saves a checkpoint before anything is pasted back in.';

  const changeSummary = !activeProject
    ? 'Open a project to prepare an AI handoff.'
    : recentChanges.length > 0
      ? `${recentChanges.length} tracked change${recentChanges.length === 1 ? '' : 's'} ready for the next handoff.`
      : syncLabel
        ? `No tracked changes since your last ${selectedPlatform.name} copy.`
        : `Your first copy for ${selectedPlatform.name} will create a checkpoint snapshot.`;

  const handleSelectPlatform = (platformId: string) => {
    if (platformId !== selectedPlatform.id) {
      setTargetPlatform(platformId);
    }
  };

  const handleCopy = useCallback(async () => {
    if (!activeProject) {
      showToast('Open a project first', 'error');
      return;
    }

    try {
      setScannerLevel(settings.privacy.secretsScannerLevel);

      const exportText = formatForPlatform(
        activeProject,
        selectedPlatform.id,
        currentTask,
        settings.projects.defaultExportMode,
        selectedPlatform,
      );

      await copyExportToClipboard(exportText, selectedPlatform.id);

      setCopied(true);
      showToast(`Copied for ${selectedPlatform.name}`);

      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      console.error('Export failed:', err);
      showToast('Failed to copy export', 'error');
    }
  }, [
    activeProject,
    currentTask,
    selectedPlatform,
    settings,
    showToast,
  ]);

  const renderPillGroup = (platforms: typeof enabledPlatforms) =>
    platforms.map((platform) => {
      const isActive = selectedPlatform.id === platform.id;
      const state = activeProject?.platformState?.[platform.id];
      const age = state?.lastExportedAt ? formatSyncAge(state.lastExportedAt) : null;

      return (
        <button
          key={platform.id}
          type="button"
          className={`export-pill${isActive ? ' export-pill--active' : ''}`}
          style={{ '--pill-color': platform.color ?? '#64748b' } as CSSProperties}
          onClick={() => handleSelectPlatform(platform.id)}
          title={age ? `${platform.name} — last copied ${age}` : `Select ${platform.name}`}
          aria-pressed={isActive}
        >
          <span className="export-pill__icon">{platform.icon ?? '🧩'}</span>
          <span className="export-pill__label">{platform.name}</span>
          {age && <span className="export-pill__age">{age}</span>}
        </button>
      );
    });

  return (
    <div className="export-controls" data-tour="export">
      <button
        type="button"
        className={`export-copy-btn${copied ? ' export-copy-btn--copied' : ''}`}
        style={{ '--pill-color': selectedPlatform.color ?? '#64748b' } as CSSProperties}
        onClick={() => void handleCopy()}
        disabled={!activeProject}
      >
        {copied ? (
          <>
            <span className="export-copy-btn__icon">OK</span>
            <span className="export-copy-btn__text">
              Copied. Paste into {selectedPlatform.name}.
            </span>
          </>
        ) : (
          <>
            <span className="export-copy-btn__icon">{selectedPlatform.icon ?? '🧩'}</span>
            <span className="export-copy-btn__text">
              Copy for AI
              <span className="export-copy-btn__target">{selectedPlatform.name}</span>
              {syncLabel && <span className="export-copy-btn__age">{syncLabel}</span>}
            </span>
          </>
        )}
      </button>

      <div className="export-platform-pills" role="tablist">
        {chatPlatforms.length > 0 && (
          <div className="export-pill-group">{renderPillGroup(chatPlatforms)}</div>
        )}
        {devPlatforms.length > 0 && (
          <div className="export-pill-group export-pill-group--dev">
            <span className="export-pill-group__label">Dev tools</span>
            {renderPillGroup(devPlatforms)}
          </div>
        )}
        {localPlatforms.length > 0 && (
          <div className="export-pill-group export-pill-group--local">
            <span className="export-pill-group__label">Local AI</span>
            {renderPillGroup(localPlatforms)}
          </div>
        )}
      </div>

      {quality && (
        <div className="export-quality">
          <div className="export-quality__bar">
            <div
              className="export-quality__fill"
              style={{ width: `${quality.score}%`, background: quality.color }}
            />
          </div>
          <span className="export-quality__label" style={{ color: quality.color }}>
            {quality.label}
          </span>
        </div>
      )}

      <div className="export-trust-card">
        <div className="export-trust-card__row">
          <span>Checkpoint</span>
          <span>{checkpointSummary}</span>
        </div>

        {latestCheckpoint && (
          <div className="export-trust-card__detail">
            {selectedPlatform.name} handoff from {formatCheckpointTime(latestCheckpoint.timestamp)}
          </div>
        )}

        <div className="export-trust-card__row">
          <span>Ready now</span>
          <span>{changeSummary}</span>
        </div>
      </div>
    </div>
  );
}

export default ExportButtons;