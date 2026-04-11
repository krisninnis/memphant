import { useCallback, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useActiveProject, useEnabledPlatforms } from '../../hooks/useActiveProject';
import { copyExportToClipboard } from '../../services/tauriActions';
import { formatForPlatform, setScannerLevel } from '../../utils/exportFormatters';
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

export function ExportButtons() {
  const [copied, setCopied] = useState(false);
  const targetPlatform = useProjectStore((s) => s.targetPlatform);
  const setTargetPlatform = useProjectStore((s) => s.setTargetPlatform);
  const currentTask = useProjectStore((s) => s.currentTask);
  const showToast = useProjectStore((s) => s.showToast);
  const defaultExportMode = useProjectStore((s) => s.settings.projects.defaultExportMode);
  const secretsScannerLevel = useProjectStore((s) => s.settings.privacy.secretsScannerLevel);
  const subscriptionTier = useProjectStore((s) => s.subscriptionTier);

  const isPro = subscriptionTier === 'pro' || subscriptionTier === 'team';
  // Fall back to 'full' if the user has Smart selected but isn't on Pro
  const effectiveExportMode = (defaultExportMode === 'smart' && !isPro) ? 'full' : defaultExportMode;

  const activeProject = useActiveProject();
  const enabledPlatforms = useEnabledPlatforms();

  const visiblePlatforms = enabledPlatforms.slice(0, 5);
  const targetConfig = PLATFORM_CONFIG[targetPlatform];
  const targetState = activeProject?.platformState?.[targetPlatform];
  const syncLabel = targetState?.lastExportedAt
    ? formatSyncAge(targetState.lastExportedAt)
    : null;
  const quality = activeProject ? scoreExport(activeProject) : null;

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
      {/* Platform selector pills */}
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
              style={{ '--pill-color': config.color } as React.CSSProperties}
              onClick={() => handleSelectPlatform(platform)}
              title={age ? `${config.name} — last copied ${age}` : `Select ${config.name}`}
              aria-pressed={isActive}
            >
              <span className="export-pill__icon">{config.icon}</span>
              <span className="export-pill__label">{config.name}</span>
              {age && <span className="export-pill__age">{age}</span>}
            </button>
          );
        })}
      </div>

      {/* Quality indicator */}
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

      {/* Single prominent copy button for the active platform */}
      <button
        type="button"
        className={`export-copy-btn${copied ? ' export-copy-btn--copied' : ''}`}
        style={{ '--pill-color': targetConfig.color } as React.CSSProperties}
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
            <span className="export-copy-btn__icon">✓</span>
            <span className="export-copy-btn__text">Copied — paste into {targetConfig.name}!</span>
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
    </div>
  );
}

export default ExportButtons;
