import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  isDesktopApp,
  createProject,
  createProjectFromFolder,
  createProjectFromTemplate,
  importProjectFromFile,
  deleteProject,
} from '../../services/tauriActions';
import { PROJECT_TEMPLATES } from '../../utils/projectTemplates';
import type { ProjectTemplate } from '../../utils/projectTemplates';
import {
  ensureValidPlatformId,
  getPlatformConfig,
} from '../../utils/platformRegistry';
import ProjectCard from './ProjectCard';
import ConfirmDialog from '../Shared/ConfirmDialog';
import LaunchpadWizard from '../Launchpad/LaunchpadWizard';

interface SidebarProps {
  onNavigate?: () => void;
}

type CreateMode = 'none' | 'name' | 'templates' | 'template-name';

function getInitials(email: string) {
  const name = email.split('@')[0] || 'U';
  const parts = name.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getDisplayName(email: string) {
  const raw = email.split('@')[0] || 'User';
  return raw
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const Sidebar = ({ onNavigate }: SidebarProps) => {
  const projects = useProjectStore((s) => s.projects);
  const cloudUser = useProjectStore((s) => s.cloudUser);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const targetPlatform = useProjectStore((s) => s.targetPlatform);
  const settings = useProjectStore((s) => s.settings);

  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const setCurrentView = useProjectStore((s) => s.setCurrentView);
  const setSettingsTab = useProjectStore((s) => s.setSettingsTab);

  const [createMode, setCreateMode] = useState<CreateMode>('none');
  const [showLaunchpad, setShowLaunchpad] = useState(false);
  const [newName, setNewName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDesktopPrompt, setShowDesktopPrompt] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [cloudNudgeDismissed, setCloudNudgeDismissed] = useState(
    () => localStorage.getItem('mph_cloud_nudge_dismissed') === '1',
  );

  const nameInputRef = useRef<HTMLInputElement>(null);
  const templateNameRef = useRef<HTMLInputElement>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const desktopApp = isDesktopApp();
  const selectedPlatformId = ensureValidPlatformId(
    targetPlatform,
    settings.platforms,
    settings.general.defaultPlatform,
  );
  const selectedPlatform = getPlatformConfig(
    selectedPlatformId,
    settings.platforms,
  );

  useEffect(() => {
    if (desktopApp) return;

    const dismissed = sessionStorage.getItem('mph_desktop_prompt_seen') === '1';
    if (dismissed) return;

    const showTimer = window.setTimeout(() => {
      setShowDesktopPrompt(true);
    }, 700);

    const hideTimer = window.setTimeout(() => {
      setShowDesktopPrompt(false);
      sessionStorage.setItem('mph_desktop_prompt_seen', '1');
    }, 5200);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [desktopApp]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(value), 120);
  }, []);

  const filteredProjects = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.summary?.toLowerCase().includes(q) ||
        p.currentState?.toLowerCase().includes(q) ||
        p.goals?.some((g) => g.toLowerCase().includes(q)) ||
        p.nextSteps?.some((s) => s.toLowerCase().includes(q)) ||
        p.decisions?.some((d) =>
          (typeof d === 'string' ? d : d.decision).toLowerCase().includes(q),
        ),
    );
  }, [projects, debouncedSearch]);

  const resetCreate = () => {
    setCreateMode('none');
    setNewName('');
    setTemplateName('');
    setSelectedTemplate(null);
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createProject(newName);
    resetCreate();
    onNavigate?.();
  };

  const handleCreateFromTemplate = async () => {
    if (!selectedTemplate || !templateName.trim()) return;
    await createProjectFromTemplate(selectedTemplate, templateName);
    resetCreate();
    onNavigate?.();
  };

  const handleNewProjectClick = () => {
  resetCreate();
  setShowLaunchpad(true);
  };

  const handleImportClick = () => {
  importFileRef.current?.click();

  // Show desktop prompt again when user tries to import,
  // but don't restart it if it's already visible
  if (!desktopApp && !showDesktopPrompt) {
    setShowDesktopPrompt(true);

    window.setTimeout(() => {
      setShowDesktopPrompt(false);
    }, 4000);
  }
};

  const handleImportFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    await importProjectFromFile(file);
    event.target.value = '';
    onNavigate?.();
  };

  const openCloudBackup = () => {
    setSettingsTab('sync');
    setCurrentView('settings');
    onNavigate?.();
  };

  const openDesktopDownload = () => {
    window.open('https://memephant.com/download', '_blank', 'noopener,noreferrer');
  };

  const pendingDeleteProject = pendingDeleteId
    ? projects.find((p) => p.id === pendingDeleteId)
    : null;

  const planLabel = 'Free during early access';

  return (
    <div className="sidebar-inner">
      {!desktopApp && showDesktopPrompt && (
        <button
          type="button"
          className="sidebar-desktop-prompt"
          onClick={openDesktopDownload}
        >
          Want full project tracking? Use the desktop app
        </button>
      )}

      <div className="sidebar-header">
        <div>
          <h2 className="sidebar-brand">Memephant</h2>
          <p className="sidebar-tagline">Your project context, ready for any AI.</p>
        </div>
        <button
          type="button"
          className="sidebar-settings-btn"
          onClick={() => {
            setCurrentView('settings');
            onNavigate?.();
          }}
          title="Settings"
          aria-label="Open settings"
        >
          ⚙️
        </button>
      </div>

      <div className="sidebar-actions">
        {createMode === 'none' && (
          <>
            <button
              type="button"
              className="sidebar-action-btn sidebar-action-btn--primary"
              data-tour="new-project"
              onClick={handleNewProjectClick}
              style={{ background: selectedPlatform.color ?? '#64748b' }}
            >
              + New Project
            </button>

            <button
              type="button"
              className="sidebar-action-btn"
              onClick={() => {
                setCreateMode('templates');
              }}
            >
              📋 From template
            </button>

            {desktopApp ? (
                <button
                  type="button"
                  className="sidebar-action-btn"
                  onClick={() => void createProjectFromFolder()}
                >
                  📂 Select folder
                </button>
            ) : (
              <>
                <button
                  type="button"
                  className="sidebar-action-btn"
                  onClick={handleImportClick}
                >
                  📥 Import project JSON
                </button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={(e) => void handleImportFileChange(e)}
                />
              </>
            )}
          </>
        )}

        {createMode === 'name' && (
          <div className="sidebar-create-form">
            <input
              ref={nameInputRef}
              type="text"
              className="sidebar-create-input"
              placeholder="Project name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
                if (e.key === 'Escape') resetCreate();
              }}
            />
            <div className="sidebar-create-buttons">
              <button
                type="button"
                className="sidebar-action-btn sidebar-action-btn--primary"
                onClick={() => void handleCreate()}
              >
                Create
              </button>
              <button type="button" className="sidebar-action-btn" onClick={resetCreate}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {createMode === 'templates' && (
          <div className="sidebar-template-picker">
            <p className="sidebar-template-title">Pick a template</p>
            {PROJECT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                className="sidebar-template-option"
                onClick={() => {
                  setSelectedTemplate(t);
                  setTemplateName('');
                  setCreateMode('template-name');
                  setTimeout(() => templateNameRef.current?.focus(), 50);
                }}
              >
                <span>{t.emoji}</span>
                <span>{t.label}</span>
              </button>
            ))}
            <button type="button" className="sidebar-action-btn" onClick={resetCreate}>
              Cancel
            </button>
          </div>
        )}

        {createMode === 'template-name' && selectedTemplate && (
          <div className="sidebar-create-form">
            <p className="sidebar-template-chosen">
              {selectedTemplate.emoji} {selectedTemplate.label}
            </p>
            <input
              ref={templateNameRef}
              type="text"
              className="sidebar-create-input"
              placeholder="Project name..."
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateFromTemplate();
                if (e.key === 'Escape') resetCreate();
              }}
            />
            <div className="sidebar-create-buttons">
              <button
                type="button"
                className="sidebar-action-btn sidebar-action-btn--primary"
                disabled={!templateName.trim()}
                onClick={() => void handleCreateFromTemplate()}
              >
                Create
              </button>
              <button type="button" className="sidebar-action-btn" onClick={resetCreate}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {!cloudUser && projects.length > 0 && !cloudNudgeDismissed && (
        <div className="sidebar-cloud-nudge">
          <div className="sidebar-cloud-nudge__text">
            <span>☁️</span>
            <span>Back up your projects and sync across devices</span>
          </div>
          <div className="sidebar-cloud-nudge__actions">
            <button className="sidebar-cloud-nudge__cta" onClick={openCloudBackup}>
              Sign in free →
            </button>
            <button
              className="sidebar-cloud-nudge__dismiss"
              aria-label="Dismiss"
              onClick={() => {
                localStorage.setItem('mph_cloud_nudge_dismissed', '1');
                setCloudNudgeDismissed(true);
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {projects.length > 2 && (
        <div className="sidebar-search">
          <input
            type="search"
            className="sidebar-search-input"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button
              className="sidebar-search-clear"
              onClick={() => {
                handleSearchChange('');
                setDebouncedSearch('');
              }}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      )}

      <div className="sidebar-projects">
        {projects.length === 0 && (
          <p className="sidebar-empty">
            {desktopApp
              ? 'No projects yet — create one above or open a folder.'
              : 'No projects yet — create one above or import a project.'}
          </p>
        )}

        {projects.length > 0 && filteredProjects.length === 0 && (
          <p className="sidebar-empty">No projects match "{searchQuery}".</p>
        )}

        {filteredProjects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            isActive={project.id === activeProjectId}
            onSelect={() => {
              setActiveProject(project.id);
              setCurrentView('projects');
              onNavigate?.();
            }}
            onDelete={() => setPendingDeleteId(project.id)}
          />
        ))}
      </div>

      <div className="sidebar-account-dock">
        {!cloudUser ? (
          <div className="sidebar-auth-card">
            <div className="sidebar-auth-content">
              <div className="sidebar-auth-icon">☁️</div>

              <div className="sidebar-auth-text">
                <p className="sidebar-auth-title">Back up & sync</p>
                <p className="sidebar-auth-desc">
                  Access your projects on any device and never lose your context.
                </p>
              </div>

              <div className="sidebar-auth-actions">
                <button
                  type="button"
                  className="sidebar-auth-btn sidebar-auth-btn--primary"
                  onClick={openCloudBackup}
                >
                  Create account
                </button>

                <button
                  type="button"
                  className="sidebar-auth-btn sidebar-auth-btn--secondary"
                  onClick={openCloudBackup}
                >
                  Sign in
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="sidebar-account-card"
            onClick={openCloudBackup}
            title="Open account and cloud backup"
          >
            <div className="sidebar-account-card__avatar">
              {getInitials(cloudUser.email)}
            </div>

            <div className="sidebar-account-card__meta">
              <div className="sidebar-account-card__name">
                {getDisplayName(cloudUser.email)}
              </div>
              <div className="sidebar-account-card__subline">
                {planLabel} plan
              </div>
            </div>

            <div className="sidebar-account-card__chevron">›</div>
          </button>
        )}
      </div>

      {pendingDeleteProject && (
        <ConfirmDialog
          title={`Remove "${pendingDeleteProject.name}"?`}
          message="This removes the project from the app. Your files won't be deleted."
          confirmLabel="Remove"
          onConfirm={() => {
            void deleteProject(pendingDeleteProject.id);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
      {showLaunchpad && (
  <LaunchpadWizard
    onClose={() => setShowLaunchpad(false)}
    onScanExisting={() => {
      setShowLaunchpad(false);
      void createProjectFromFolder();
      onNavigate?.();
    }}
    onCreateBlankMemory={() => {
      setShowLaunchpad(false);
      setCreateMode('name');
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }}
  />
)}
    </div>
  );
};

export default Sidebar;
