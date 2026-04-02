import { useProjectStore } from '../../store/projectStore';
import { copyExportToClipboard } from '../../services/tauriActions';
import { formatForPlatform } from '../../utils/exportFormatters';
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
  const activeProject = useProjectStore((s) => s.activeProject());
  const currentTask = useProjectStore((s) => s.currentTask);
  const showToast = useProjectStore((s) => s.showToast);
  const enabledPlatforms = useProjectStore((s) => s.enabledPlatforms());
  const settings = useProjectStore((s) => s.settings);

  const handleCopyFor = async (platform: Platform) => {
    setTargetPlatform(platform);

    if (!activeProject) {
      showToast('Open a project first', 'error');
      return;
    }

    const mode = settings.projects.defaultExportMode;
    const exportText = formatForPlatform(activeProject, platform, currentTask, mode);
    await copyExportToClipboard(exportText, platform);
  };

  // Show up to 4; if more, show first 4 (More dropdown is a future enhancement)
  const visiblePlatforms = enabledPlatforms.slice(0, 4);

  return (
    <div className="export-buttons">
      {visiblePlatforms.map((platform) => {
        const config = PLATFORM_CONFIG[platform];
        const state = activeProject?.platformState?.[platform];
        const syncLabel = state?.lastExportedAt ? formatSyncAge(state.lastExportedAt) : null;

        return (
          <button
            key={platform}
            className={`export-pill ${targetPlatform === platform ? 'export-pill--active' : ''}`}
            style={{ '--pill-color': config.color } as React.CSSProperties}
            onClick={() => void handleCopyFor(platform)}
            title={
              syncLabel
                ? `Last copied for ${config.name}: ${syncLabel}`
                : `Never copied for ${config.name}`
            }
          >
            <span className="export-pill__label">
              {config.icon} {config.name}
            </span>
            {syncLabel && (
              <span className="export-pill__sync">{syncLabel}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default ExportButtons;
