import { useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  createProject,
  createProjectFromFolder,
  createProjectFromTemplate,
  deleteProject,
} from '../../services/tauriActions';
import { PROJECT_TEMPLATES } from '../../utils/projectTemplates';
import type { ProjectTemplate } from '../../utils/projectTemplates';
import ProjectCard from './ProjectCard';
import ConfirmDialog from '../Shared/ConfirmDialog';

const FREE_TIER_LIMIT = 3;

interface SidebarProps {
  onNavigate?: () => void;
}

type CreateMode = 'none' | 'name' | 'templates' | 'template-name';

export function Sidebar({ onNavigate }: SidebarProps) {
  const projects        = useProjectStore((s) => s.projects);
  const cloudUser       = useProjectStore((s) => s.cloudUser);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject  = useProjectStore((s) => s.setActiveProject);
  const setCurrentView    = useProjectStore((s) => s.setCurrentView);
  const setSettingsTab    = useProjectStore((s) => s.setSettingsTab);

  const [createMode, setCreateMode]         = useState<CreateMode>('none');
  const [newName, setNewName]               = useState('');
  const [searchQuery, setSearchQuery]       = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [templateName, setTemplateName]     = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [cloudNudgeDismissed, setCloudNudgeDismissed] = useState(
    () => localStorage.getItem('mph_cloud_nudge_dismissed') === '1',
  );
  const nameInputRef    = useRef<HTMLInputElement>(null);
  const templateNameRef = useRef<HTMLInputElement>(null);

  const atLimit = !cloudUser && projects.length >= FREE_TIER_LIMIT;

  // ── Filtered project list ──────────────────────────────────────────────────
  const filteredProjects = searchQuery.trim()
    ? projects.filter((p) => {
        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.summary?.toLowerCase().includes(q) ||
          p.currentState?.toLowerCase().includes(q) ||
          p.goals?.some((g) => g.toLowerCase().includes(q)) ||
          p.nextSteps?.some((s) => s.toLowerCase().includes(q)) ||
          p.decisions?.some((d) =>
            (typeof d === 'string' ? d : d.decision).toLowerCase().includes(q),
          )
        );
      })
    : projects;

  // ── Handlers ──────────────────────────────────────────────────────────────

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
    if (atLimit) {
      setSettingsTab('sync');
      setCurrentView('settings');
      return;
    }
    setCreateMode('name');
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const pendingDeleteProject = pendingDeleteId
    ? projects.find((p) => p.id === pendingDeleteId)
    : null;

  return (
    <div className="sidebar-inner">
      <div className="sidebar-header">
        <div>
          <h2 className="sidebar-brand">Memephant</h2>
          <p className="sidebar-tagline">Your project context, ready for any AI.</p>
        </div>
        <button
          type="button"
          className="sidebar-settings-btn"
          onClick={() => { setCurrentView('settings'); onNavigate?.(); }}
          title="Settings"
          aria-label="Open settings"
        >
          ⚙️
        </button>
      </div>

      {/* ── Create actions ──────────────────────────────────────────────────── */}
      <div className="sidebar-actions">
        {createMode === 'none' && (
          <>
            <button
              type="button"
              className="sidebar-action-btn sidebar-action-btn--primary"
              data-tour="new-project"
              onClick={handleNewProjectClick}
            >
              + New Project
            </button>
            <button
              type="button"
              className="sidebar-action-btn"
              onClick={() => {
                if (atLimit) { setSettingsTab('sync'); setCurrentView('settings'); return; }
                setCreateMode('templates');
              }}
            >
              📋 From template
            </button>
            <button
              type="button"
              className="sidebar-action-btn"
              onClick={() => void createProjectFromFolder()}
            >
              📂 Open a project folder
            </button>
          </>
        )}

        {/* Name entry */}
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

        {/* Template picker */}
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

        {/* Template name entry */}
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

      {/* ── Cloud backup nudge (non-signed-in, has projects, not at limit) ─── */}
      {!cloudUser && !atLimit && projects.length > 0 && !cloudNudgeDismissed && (
        <div className="sidebar-cloud-nudge">
          <div className="sidebar-cloud-nudge__text">
            <span>☁️</span>
            <span>Back up your projects and sync across devices</span>
          </div>
          <div className="sidebar-cloud-nudge__actions">
            <button
              className="sidebar-cloud-nudge__cta"
              onClick={() => { setSettingsTab('sync'); setCurrentView('settings'); }}
            >
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

      {/* ── Free tier nudge ─────────────────────────────────────────────────── */}
      {atLimit && (
        <button
          className="sidebar-upgrade-nudge"
          onClick={() => { setSettingsTab('sync'); setCurrentView('settings'); }}
        >
          <span>🔒 Free plan — 3 projects</span>
          <span className="sidebar-upgrade-cta">Unlock unlimited →</span>
        </button>
      )}

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      {projects.length > 2 && (
        <div className="sidebar-search">
          <input
            type="search"
            className="sidebar-search-input"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="sidebar-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* ── Project list ────────────────────────────────────────────────────── */}
      <div className="sidebar-projects">
        {projects.length === 0 && (
          <p className="sidebar-empty">
            No projects yet — create one above or open a folder.
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
    </div>
  );
}

export default Sidebar;