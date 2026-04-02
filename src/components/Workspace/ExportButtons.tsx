import { useProjectStore } from '../../store/projectStore';
import { copyExportToClipboard } from '../../services/tauriActions';
import { buildExportPrompt } from '../../utils/exportBuilder';
import type { Platform } from '../../types/project-brain-types';

const PLATFORM_COLORS: Record<Platform, string> = {
  chatgpt: '#10a37f',
  claude: '#d97706',
  grok: '#1d9bf0',
  perplexity: '#20808d',
};

const PLATFORM_LABELS: Record<Platform, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  grok: 'Grok',
  perplexity: 'Perplexity',
};

const PRIMARY_PLATFORMS: Platform[] = ['chatgpt', 'claude', 'grok', 'perplexity'];

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

  const handleCopyFor = async (platform: Platform) => {
    setTargetPlatform(platform);

    if (!activeProject) {
      showToast('Open a project first.');
      return;
    }

    const exportText = buildExportPrompt(activeProject, platform, currentTask);
    await copyExportToClipboard(exportText, platform);
  };

  return (
    <div className="export-buttons">
      {PRIMARY_PLATFORMS.map((platform) => {
        const state = activeProject?.platformState?.[platform];
        const syncLabel = state?.lastExportedAt
          ? formatSyncAge(state.lastExportedAt)
          : null;

        return (
          <button
            key={platform}
            className={`export-pill ${targetPlatform === platform ? 'export-pill--active' : ''}`}
            style={{
              '--pill-color': PLATFORM_COLORS[platform],
            } as React.CSSProperties}
            onClick={() => void handleCopyFor(platform)}
            title={syncLabel ? `Last copied for ${PLATFORM_LABELS[platform]}: ${syncLabel}` : `Never copied for ${PLATFORM_LABELS[platform]}`}
          >
            <span className="export-pill__label">Copy for {PLATFORM_LABELS[platform]}</span>
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
