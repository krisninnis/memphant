import { useCallback } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useActiveProject, useEnabledPlatforms } from '../../hooks/useActiveProject';
import { copyExportToClipboard } from '../../services/tauriActions';
import { formatForPlatform, setScannerLevel } from '../../utils/exportFormatters';
import { PLATFORM_CONFIG } from '../../utils/platformConfig';
import type { Platform } from '../../types/project-brain-types';

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
  const targetPlatform = useProjectStore((s) => s.targetPlatform);
  const setTargetPlatform = useProjectStore((s) => s.setTargetPlatform);
  const activeProject = useActiveProject();
  const currentTask = useProjectStore((s) => s.currentTask);
  const showToast = useProjectStore((s) => s.showToast);
  const enabledPlatforms = useEnabledPlatforms();

  // Read both settings that affect export behaviour
  const defaultExportMode = useProjectStore((s) => s.settings.projects.defaultExportMode);
  const secretsScannerLevel = useProjectStore((s) => s.settings.privacy.secretsScannerLevel);

  const handleCopyFor = useCallback(
    async (platform: Platform) => {
      if (platform !== targetPlatform) {
        setTargetPlatform(platform);
      }

      if (!activeProject) {
        showToast('Open a project first', 'error');
        return;
      }

      // Apply scanner level before generating export text
      setScannerLevel(secretsScannerLevel);
      const exportText = formatForPlatform(activeProject, platform, currentTask, defaultExportMode);
      await copyExportToClipboard(exportText, platform);
    },
    [setTargetPlatform, targetPlatform, activeProject, currentTask, showToast, defaultExportMode, secretsScannerLevel]
  );

  const visiblePlatforms = enabledPlatforms.slice(0, 5);

  return (
    <div className="export-buttons">
      {visiblePlatforms.map((platform) => {
        const config = PLATFORM_CONFIG[platform];
        const state = activeProject?.platformState?.[platform];
        const syncLabel = state?.lastExportedAt ? formatSyncAge(state.lastExportedAt) : null;

        return (
          <button
            key={platform}
            className={`export-pill${targetPlatform === platform ? ' export-pill--active' : ''}`}
            style={{ '--pill-color': config.color } as React.CSSProperties}
            onClick={() => void handleCopyFor(platform)}
            title={
              syncLabel
                ? `Last copied for ${config.name}: ${syncLabel}`
                : `Copy for ${config.name}`
            }
          >
            <span className="export-pill__icon">{config.icon}</span>
            <span className="export-pill__label">
              {config.name}
              {syncLabel && (
                <span className="export-pill__age">{syncLabel}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default ExportButtons;
