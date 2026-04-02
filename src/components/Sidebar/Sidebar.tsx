import { useRef, useState } from 'react';
import { useProjectStore } from '../../store/projectStore';
import {
  createProject,
  createProjectFromFolder,
  importProjectFromFile,
  deleteProject,
} from '../../services/tauriActions';
import ProjectCard from './ProjectCard';
import ConfirmDialog from '../Shared/ConfirmDialog';

export function Sidebar() {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const setCurrentView = useProjectStore((s) => s.setCurrentView);

  const [newName, setNewName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createProject(newName);
    setNewName('');
    setShowCreate(false);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importProjectFromFile(file);
    e.target.value = '';
  };

  const pendingDeleteProject = pendingDeleteId
    ? projects.find((p) => p.id === pendingDeleteId)
    : null;

  return (
    <div className="sidebar-inner">
      <div className="sidebar-header">
        <div>
          <h2 className="sidebar-brand">Project Brain</h2>
          <p className="sidebar-tagline">Your project context, ready for any AI.</p>
        </div>
        <button
          className="sidebar-settings-btn"
          onClick={() => setCurrentView('settings')}
          title="Settings"
          aria-label="Open settings"
        >
          ⚙️
        </button>
      </div>

      <div className="sidebar-actions">
        {!showCreate ? (
          <button
            className="sidebar-action-btn sidebar-action-btn--primary"
            onClick={() => {
              setShowCreate(true);
              setTimeout(() => nameInputRef.current?.focus(), 50);
            }}
          >
            + New Project
          </button>
        ) : (
          <div className="sidebar-create-form">
            <input
              ref={nameInputRef}
              type="text"
              className="sidebar-create-input"
              placeholder="Project name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
                if (e.key === 'Escape') { setShowCreate(false); setNewName(''); }
              }}
            />
            <div className="sidebar-create-buttons">
              <button className="sidebar-action-btn sidebar-action-btn--primary" onClick={() => void handleCreate()}>
                Create
              </button>
              <button className="sidebar-action-btn" onClick={() => { setShowCreate(false); setNewName(''); }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <button className="sidebar-action-btn" onClick={() => void createProjectFromFolder()}>
          Scan a folder
        </button>

        <button className="sidebar-action-btn" onClick={() => fileInputRef.current?.click()}>
          Open saved project
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={(e) => void handleImportFile(e)}
          style={{ display: 'none' }}
        />
      </div>

      <div className="sidebar-projects">
        {projects.length === 0 && (
          <p className="sidebar-empty">No projects yet. Create one above to get started.</p>
        )}
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            isActive={project.id === activeProjectId}
            onSelect={() => setActiveProject(project.id)}
            onDelete={() => setPendingDeleteId(project.id)}
          />
        ))}
      </div>

      {pendingDeleteProject && (
        <ConfirmDialog
          title={`Remove "${pendingDeleteProject.name}"?`}
          message="This will delete the project from your device. This can't be undone."
          confirmLabel="Delete"
          onConfirm={() => {
            void deleteProject(pendingDeleteProject.id);
            setPendingDeleteId(null);
          }}
          onCancel={() => setPendingDeleteId(null)}
          dangerous
        />
      )}
    </div>
  );
}

export default Sidebar;
