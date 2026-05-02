import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useProjectStore } from '../../store/projectStore';
import { useActiveProject } from '../../hooks/useActiveProject';
import { useRecentActivity } from '../../hooks/useRecentActivity';
import {
  copyExportToClipboard,
  generateStateManifest,
  getFilesChangedSince,
} from '../../services/tauriActions';
import {
  formatForClaudeWithManifest,
  formatForPlatform,
  setScannerLevel,
} from '../../utils/exportFormatters';
import { buildContinuityPreamble } from '../../utils/platformConfig';
import {
  appendMemoryBridgeToExport,
  type MemoryBridgeMode,
} from '../../utils/memoryBridge';
import { getChangesSince } from '../../utils/getChangesSince';
import { scoreExport } from '../../utils/exportQuality';
import {
  ensureValidPlatformId,
  getEnabledPlatforms,
  getPlatformConfig,
} from '../../utils/platformRegistry';
import type { ExportMode, HandoffMode } from '../../types/memphant-types';

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

type CopyOption = {
  id: 'full' | 'delta' | 'specialist' | 'deep-state';
  label: string;
  busyLabel?: string;
  onSelect: () => Promise<void>;
  disabled?: boolean;
};

export function ExportButtons() {
  const [copied, setCopied] = useState(false);
  const [manifestCopied, setManifestCopied] = useState(false);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [handoffMode, setHandoffMode] = useState<HandoffMode>('continue');
  const [memoryBridgeMode, setMemoryBridgeMode] = useState<MemoryBridgeMode>('auto');
  const [contextOpen, setContextOpen] = useState(false);
  const [switchReason, setSwitchReason] = useState('');

  const targetPlatform = useProjectStore((s) => s.targetPlatform);
  const setTargetPlatform = useProjectStore((s) => s.setTargetPlatform);
  const currentTask = useProjectStore((s) => s.currentTask);
  const showToast = useProjectStore((s) => s.showToast);
  const settings = useProjectStore((s) => s.settings);
  const updateLastAiSession = useProjectStore((s) => s.updateLastAiSession);
  const updateProject = useProjectStore((s) => s.updateProject);

  const activeProject = useActiveProject();
  const { markdown: recentActivity } = useRecentActivity(
    activeProject?.id ?? '',
    activeProject?.linkedFolder?.path ?? '',
  );

  const enabledPlatforms = useMemo(
    () => getEnabledPlatforms(settings.platforms),
    [settings.platforms],
  );

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

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

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

  const applyMemoryBridgeIfAutomatic = useCallback((exportText: string) => {
    if (!activeProject || memoryBridgeMode !== 'auto') {
      return exportText;
    }

    return appendMemoryBridgeToExport(
      exportText,
      activeProject,
      selectedPlatform.id,
    );
  }, [activeProject, memoryBridgeMode, selectedPlatform.id]);

  const handleCopyMode = useCallback(async (mode: ExportMode) => {
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
        mode,
        selectedPlatform,
        recentActivity,
      );

      const lastExportAt = activeProject.platformState?.[selectedPlatform.id]?.lastExportedAt;
      const changedFiles = lastExportAt && activeProject.linkedFolder?.path
        ? await getFilesChangedSince(activeProject.linkedFolder.path, lastExportAt)
        : [];

      const sessionForPreamble = activeProject.lastAiSession
        ? { ...activeProject.lastAiSession, filesChangedSince: changedFiles }
        : undefined;
      const preamble = buildContinuityPreamble(sessionForPreamble, selectedPlatform.id);
      const preparedExportText = applyMemoryBridgeIfAutomatic(exportText);
      await copyExportToClipboard(preamble + preparedExportText, selectedPlatform.id);

      setCopied(true);
      const modeLabel =
        mode === 'delta'
          ? 'just the essentials'
          : mode === 'specialist'
            ? 'a specific task'
            : 'full context';
      showToast(`Copied ${modeLabel} for ${selectedPlatform.name}`);

      updateLastAiSession(activeProject.id, {
        platform: selectedPlatform.id,
        mode: handoffMode,
        sessionAt: new Date().toISOString(),
        userTaskSummary: currentTask || undefined,
        userSwitchReason: switchReason || undefined,
        filesChangedSince: changedFiles,
      });

      updateProject(activeProject.id, {
        platformState: {
          ...activeProject.platformState,
          [selectedPlatform.id]: {
            ...activeProject.platformState?.[selectedPlatform.id],
            lastExportedAt: new Date().toISOString(),
          },
        },
      });

      setTimeout(() => setCopied(false), 1800);
  } catch (err) {
    console.error('Export failed:', err);
    showToast('Failed to copy export', 'error');
  }
}, [
  activeProject,
  applyMemoryBridgeIfAutomatic,
  currentTask,
  handoffMode,
  recentActivity,
  selectedPlatform,
  settings.privacy.secretsScannerLevel,
  showToast,
  switchReason,
  updateLastAiSession,
  updateProject,
]);

  const handleCopyDeepState = useCallback(async () => {
    if (!activeProject) {
      showToast('Open a project first', 'error');
      return;
    }

    try {
      setManifestLoading(true);
      setScannerLevel(settings.privacy.secretsScannerLevel);

      const manifest = await generateStateManifest(activeProject);
      const exportText = formatForClaudeWithManifest(
        activeProject,
        manifest.text,
        manifest.digest,
        currentTask,
        recentActivity,
      );

      const lastExportAt = activeProject.platformState?.[selectedPlatform.id]?.lastExportedAt;
      const changedFiles = lastExportAt && activeProject.linkedFolder?.path
        ? await getFilesChangedSince(activeProject.linkedFolder.path, lastExportAt)
        : [];

      const sessionForPreamble = activeProject.lastAiSession
        ? { ...activeProject.lastAiSession, filesChangedSince: changedFiles }
        : undefined;
      const preamble = buildContinuityPreamble(sessionForPreamble, selectedPlatform.id);
      const preparedExportText = applyMemoryBridgeIfAutomatic(exportText);
      await copyExportToClipboard(preamble + preparedExportText, 'claude');

      setManifestCopied(true);
      showToast('Copied with full context and deeper project memory');

      updateLastAiSession(activeProject.id, {
        platform: selectedPlatform.id,
        mode: handoffMode,
        sessionAt: new Date().toISOString(),
        userTaskSummary: currentTask || undefined,
        userSwitchReason: switchReason || undefined,
        filesChangedSince: changedFiles,
      });

      updateProject(activeProject.id, {
        platformState: {
          ...activeProject.platformState,
          [selectedPlatform.id]: {
            ...activeProject.platformState?.[selectedPlatform.id],
            lastExportedAt: new Date().toISOString(),
          },
        },
      });

      setTimeout(() => setManifestCopied(false), 1800);
    } catch (err) {
      console.error('Claude deep state export failed:', err);
      const message = err instanceof Error
        ? err.message
        : 'Failed to prepare the deeper context copy';
      showToast(message, 'error');
    } finally {
      setManifestLoading(false);
    }
  }, [
    activeProject,
    applyMemoryBridgeIfAutomatic,
    currentTask,
    handoffMode,
    recentActivity,
    selectedPlatform.id,
    settings.privacy.secretsScannerLevel,
    showToast,
    switchReason,
    updateLastAiSession,
    updateProject,
  ]);

  const handlePrimaryCopy = useCallback(async () => {
    await handleCopyMode('full');
  }, [handleCopyMode]);

  const menuOptions = useMemo<CopyOption[]>(() => {
    const options: CopyOption[] = [
      {
        id: 'full',
        label: 'Copy with full context',
        onSelect: () => handleCopyMode('full'),
      },
      {
        id: 'delta',
        label: 'Copy just the essentials',
        onSelect: () => handleCopyMode('delta'),
      },
      {
        id: 'specialist',
        label: 'Copy for a specific task',
        onSelect: () => handleCopyMode('specialist'),
      },
    ];

    if (selectedPlatform.id === 'claude') {
      options.push({
        id: 'deep-state',
        label: 'Copy with full context + deep state',
        busyLabel: 'Preparing deeper context...',
        onSelect: handleCopyDeepState,
        disabled: manifestLoading,
      });
    }

    return options;
  }, [handleCopyDeepState, handleCopyMode, manifestLoading, selectedPlatform.id]);

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
          title={age ? `Switch to ${platform.name} — last copied ${age}` : `Switch handoff target to ${platform.name}`}
          aria-pressed={isActive}
        >
          <span className="export-pill__icon">{platform.icon ?? 'AI'}</span>
          <span className="export-pill__label">{platform.name}</span>
          {age && <span className="export-pill__age">{age}</span>}
        </button>
      );
    });

  return (
    <div className="export-controls" data-tour="export">
      <div
        aria-label="Memory handoff mode"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
          marginBottom: '10px',
        }}
      >
        {(['auto', 'manual'] as MemoryBridgeMode[]).map((mode) => {
          const isActive = memoryBridgeMode === mode;

          return (
            <button
              key={mode}
              type="button"
              aria-pressed={isActive}
              onClick={() => setMemoryBridgeMode(mode)}
              title={
                mode === 'auto'
                  ? 'Automatic mode includes hippocampus.md and prefrontal.md in the AI handoff.'
                  : 'Manual mode keeps the classic export without the Memory Bridge files.'
              }
              style={{
                padding: '7px 10px',
                borderRadius: '999px',
                border: isActive
                  ? `1.5px solid ${selectedPlatform.color ?? '#64748b'}`
                  : '1.5px solid rgba(255,255,255,0.12)',
                background: isActive
                  ? `${selectedPlatform.color ?? '#64748b'}22`
                  : 'rgba(255,255,255,0.04)',
                color: isActive ? '#f8fafc' : 'rgba(248,250,252,0.58)',
                fontSize: '0.78rem',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {mode === 'auto' ? 'Auto Memory' : 'Manual'}
            </button>
          );
        })}
      </div>

      <div
        ref={menuRef}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'stretch',
          gap: '8px',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 58px',
            gap: '2px',
            width: '100%',
            padding: '2px',
            borderRadius: '20px',
            background: `${selectedPlatform.color ?? '#64748b'}33`,
            boxShadow: `0 10px 24px ${selectedPlatform.color ?? '#64748b'}29`,
          }}
        >
          <button
            type="button"
            className={`export-copy-btn${copied ? ' export-copy-btn--copied' : ''}`}
            style={{
              '--pill-color': selectedPlatform.color ?? '#64748b',
              borderTopRightRadius: '16px',
              borderBottomRightRadius: '16px',
            } as CSSProperties}
            onClick={() => void handlePrimaryCopy()}
            disabled={!activeProject}
            title={
              memoryBridgeMode === 'auto'
                ? `Copy full context plus hippocampus.md and prefrontal.md for ${selectedPlatform.name}`
                : `Copy full project context for ${selectedPlatform.name}`
            }
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
                <span className="export-copy-btn__icon">{selectedPlatform.icon ?? 'AI'}</span>
                <span className="export-copy-btn__text">
                  Copy for AI
                  <span className="export-copy-btn__target">{selectedPlatform.name}</span>
                  {syncLabel && <span className="export-copy-btn__age">{syncLabel}</span>}
                </span>
              </>
            )}
          </button>

          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Choose a copy option"
            disabled={!activeProject}
            onClick={() => setMenuOpen((open) => !open)}
            style={{
              border: 'none',
              borderRadius: '16px',
              background: copied
                ? 'linear-gradient(180deg, #0f9f6e 0%, #0a7f57 100%)'
                : `linear-gradient(180deg, ${selectedPlatform.color ?? '#64748b'} 0%, ${selectedPlatform.color ?? '#64748b'}dd 100%)`,
              color: '#fffaf2',
              fontSize: '1rem',
              fontWeight: 800,
              cursor: activeProject ? 'pointer' : 'not-allowed',
              opacity: activeProject ? 1 : 0.6,
              boxShadow: copied
                ? '0 10px 24px rgba(15, 159, 110, 0.24)'
                : `0 10px 24px ${selectedPlatform.color ?? '#64748b'}47`,
            }}
            title="Choose a shorter or more focused copy option"
          >
            ▾
          </button>
        </div>

        {menuOpen && activeProject && (
          <div
            role="menu"
            aria-label="Copy options"
            style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              minWidth: '280px',
              padding: '10px',
              borderRadius: '18px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(20, 20, 20, 0.96)',
              boxShadow:
                '0 20px 40px rgba(0, 0, 0, 0.28), 0 4px 12px rgba(0, 0, 0, 0.18)',
              backdropFilter: 'blur(14px)',
              zIndex: 30,
            }}
          >
            {menuOptions.slice(0, 3).map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  void option.onSelect();
                }}
                title={
                  option.id === 'full'
                    ? `Copy full project context for ${selectedPlatform.name}`
                    : option.id === 'delta'
                      ? `Copy essential project context for ${selectedPlatform.name}`
                      : `Copy task-focused project context for ${selectedPlatform.name}`
                }
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 14px',
                  border: 'none',
                  borderRadius: '14px',
                  background: 'transparent',
                  color: '#f8fafc',
                  textAlign: 'left',
                  fontSize: '0.96rem',
                  lineHeight: 1.45,
                  cursor: 'pointer',
                }}
              >
                {option.label}
              </button>
            ))}

            {selectedPlatform.id === 'claude' && (
              <>
                <div
                  role="separator"
                  style={{
                    height: '1px',
                    margin: '8px 4px',
                    background: 'rgba(255, 255, 255, 0.12)',
                  }}
                />
                {menuOptions.slice(3).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitem"
                    disabled={option.disabled}
                    onClick={() => {
                      setMenuOpen(false);
                      void option.onSelect();
                    }}
                    title="Copy full project context with deeper project memory for Claude"
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '12px 14px',
                      border: 'none',
                      borderRadius: '14px',
                      background: manifestCopied ? 'rgba(15, 159, 110, 0.14)' : 'transparent',
                      color: option.disabled ? 'rgba(248, 250, 252, 0.6)' : '#f8fafc',
                      textAlign: 'left',
                      fontSize: '0.96rem',
                      lineHeight: 1.45,
                      cursor: option.disabled ? 'wait' : 'pointer',
                    }}
                  >
                    {option.disabled ? option.busyLabel ?? option.label : option.label}
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </div>

<div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
  {(['continue', 'debug', 'review'] as HandoffMode[]).map((m) => (
    <button
      key={m}
      type="button"
      onClick={() => setHandoffMode(m)}
      title={
        m === 'continue'
          ? 'Pick up where the last AI left off'
          : m === 'debug'
            ? 'Diagnose a problem — returns cause, fix, and verification steps'
            : 'Check decisions and risks — returns structured critique and next steps'
      }
      style={{
        flex: 1,
        padding: '6px 0',
        border: handoffMode === m
          ? `1.5px solid ${selectedPlatform.color ?? '#64748b'}`
          : '1.5px solid rgba(255,255,255,0.12)',
        borderRadius: '10px',
        background: handoffMode === m
          ? `${selectedPlatform.color ?? '#64748b'}22`
          : 'transparent',
        color: handoffMode === m ? '#f8fafc' : 'rgba(248,250,252,0.5)',
        fontSize: '0.82rem',
        fontWeight: handoffMode === m ? 600 : 400,
        cursor: 'pointer',
        textTransform: 'capitalize',
        transition: 'all 0.15s ease',
      }}
    >
      {m}
    </button>
  ))}
</div>

<div style={{ marginTop: '6px' }}>
  <button
    type="button"
    onClick={() => setContextOpen((o) => !o)}
    aria-expanded={contextOpen}
    title="Add a note about what you were working on and why you are switching"
    style={{
      background: 'none',
      border: 'none',
      color: 'rgba(248,250,252,0.45)',
      fontSize: '0.8rem',
      cursor: 'pointer',
      padding: '2px 0',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    }}
  >
    <span>{contextOpen ? '▴' : '▾'}</span>
    Add context (optional)
  </button>
  {contextOpen && (
    <textarea
      value={switchReason}
      onChange={(e) => setSwitchReason(e.target.value)}
      placeholder="Why are you switching platforms or starting a new session?"
      title="Explain why you are switching tools for this handoff"
      rows={2}
      style={{
        width: '100%',
        marginTop: '6px',
        padding: '8px 10px',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.05)',
        color: '#f8fafc',
        fontSize: '0.85rem',
        resize: 'vertical',
        boxSizing: 'border-box',
      }}
    />
  )}
</div>
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
