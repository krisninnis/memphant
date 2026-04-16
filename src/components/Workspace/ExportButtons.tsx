import { useCallback, useState, type CSSProperties } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useActiveProject, useEnabledPlatforms } from '../../hooks/useActiveProject';
import { copyExportToClipboard } from '../../services/tauriActions';
import { formatForPlatform, setScannerLevel } from '../../utils/exportFormatters';
import { getChangesSince } from '../../utils/getChangesSince';
import { scoreExport } from '../../utils/exportQuality';
import { PLATFORM_CONFIG } from '../../utils/platformConfig';
import type { Platform } from '../../types/memphant-types';

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
  const defaultExportMode = useProjectStore((s) => s.settings.projects.defaultExportMode);
  const secretsScannerLevel = useProjectStore((s) => s.settings.privacy.secretsScannerLevel);
  const effectiveExportMode = defaultExportMode;

  const activeProject = useActiveProject();
  const enabledPlatforms = useEnabledPlatforms();

  const selectedProject = activeProject;
  const lastSeenAt = selectedProject?.platformState?.[targetPlatform]?.lastSeenAt;
  const recentChanges = selectedProject ? getChangesSince(selectedProject, lastSeenAt) : [];

  const visiblePlatforms = enabledPlatforms.slice(0, 5);
  const targetConfig = PLATFORM_CONFIG[targetPlatform];
  const targetState = activeProject?.platformState?.[targetPlatform];
  const syncLabel = targetState?.lastExportedAt
    ? formatSyncAge(targetState.lastExportedAt)
    : null;
  const quality = activeProject ? scoreExport(activeProject) : null;
  const allCheckpoints = activeProject?.checkpoints ?? [];
  const latestAnyCheckpoint =
    allCheckpoints.length > 0 ? allCheckpoints[allCheckpoints.length - 1] : undefined;
  const latestCheckpoint =
    [...allCheckpoints].reverse().find((checkpoint) => checkpoint.platform === targetPlatform)
    ?? latestAnyCheckpoint;
  const checkpointSummary = latestCheckpoint
    ? `Last checkpoint saved ${formatSyncAge(latestCheckpoint.timestamp)}.`
    : 'Every copy saves a checkpoint before anything is pasted back in.';
  const changeSummary = !activeProject
    ? 'Open a project to prepare an AI handoff.'
    : recentChanges.length > 0
      ? `${recentChanges.length} tracked change${recentChanges.length === 1 ? '' : 's'} ready for the next handoff.`
      : syncLabel
        ? `No tracked changes since your last ${targetConfig.name} copy.`
        : `Your first copy for ${targetConfig.name} will create a checkpoint snapshot.`;

  const handleSelectPlatform = (platform: Platform) => {
    if (platform !== targetPlatform) {
      setTargetPlatform(platform);
    }
  };

  const handleCopy = useCallback(async () => {
    if (!activeProject) {
      showToast('Open a project first', 'error');
      return;
    }

    setScannerLevel(secretsScannerLevel);

    const exportText = formatForPlatform(
      activeProject,
      targetPlatform,
      currentTask,
      effectiveExportMode,
    );

    await copyExportToClipboard(exportText, targetPlatform);

    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [
    activeProject,
    currentTask,
    effectiveExportMode,
    secretsScannerLevel,
    showToast,
    targetPlatform,
  ]);

  return (
    <div className="export-controls" data-tour="export">
      <div className="export-buttons" role="tablist" aria-label="Choose AI platform">
        {visiblePlatforms.map((platform) => {
          const config = PLATFORM_CONFIG[platform];
          const isActive = targetPlatform === platform;
          const state = activeProject?.platformState?.[platform];
          const age = state?.lastExportedAt ? formatSyncAge(state.lastExportedAt) : null;

          return (
            <button
              key={platform}
              type="button"
              className={`export-pill${isActive ? ' export-pill--active' : ''}`}
              style={{ '--pill-color': config.color } as CSSProperties}
              onClick={() => handleSelectPlatform(platform)}
              title={age ? `${config.name} - last copied ${age}` : `Select ${config.name}`}
              aria-pressed={isActive}
            >
              <span className="export-pill__icon">{config.icon}</span>
              <span className="export-pill__label">{config.name}</span>
              {age && <span className="export-pill__age">{age}</span>}
            </button>
          );
        })}
      </div>

      {quality && (
        <div className="export-quality" title={quality.message || `Export is ${quality.label}`}>
          <div className="export-quality__bar">
            <div
              className="export-quality__fill"
              style={{ width: `${quality.score}%`, background: quality.color }}
            />
          </div>
          <span className="export-quality__label" style={{ color: quality.color }}>
            {quality.label}
          </span>
          {quality.message && (
            <span className="export-quality__tip">{quality.message}</span>
          )}
        </div>
      )}

      <button
        type="button"
        className={`export-copy-btn${copied ? ' export-copy-btn--copied' : ''}`}
        style={{ '--pill-color': targetConfig.color } as CSSProperties}
        onClick={() => void handleCopy()}
        disabled={!activeProject}
        title={
          syncLabel
            ? `Last copied for ${targetConfig.name}: ${syncLabel}`
            : `Copy project context for ${targetConfig.name}`
        }
      >
        {copied ? (
          <>
            <span className="export-copy-btn__icon">OK</span>
            <span className="export-copy-btn__text">Copied. Paste into {targetConfig.name}.</span>
          </>
        ) : (
          <>
            <span className="export-copy-btn__icon">{targetConfig.icon}</span>
            <span className="export-copy-btn__text">
              Copy for {targetConfig.name}
              {syncLabel && <span className="export-copy-btn__age">{syncLabel}</span>}
            </span>
          </>
        )}
      </button>

      <div className="export-trust-card">
        <div className="export-trust-card__row">
          <span className="export-trust-card__label">Checkpoint</span>
          <span className="export-trust-card__value">{checkpointSummary}</span>
        </div>

        {latestCheckpoint && (
          <div className="export-trust-card__detail">
            {targetConfig.name} handoff from {formatCheckpointTime(latestCheckpoint.timestamp)}
            {latestCheckpoint.summary ? ` - ${latestCheckpoint.summary}` : ''}
          </div>
        )}

        <div className="export-trust-card__row">
          <span className="export-trust-card__label">Ready now</span>
          <span className="export-trust-card__value">{changeSummary}</span>
        </div>

        <div className="export-trust-card__detail">
          Nothing leaves this device until you click copy. Cloud backup is separate from AI export.
        </div>
      </div>
    </div>
  );
}

export default ExportButtons;
