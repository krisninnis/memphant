import { useState } from 'react';
import { useTauriSync } from '../../hooks/useTauriSync';
import { useProjectStore } from '../../store/projectStore';
import { useActiveProject } from '../../hooks/useActiveProject';
import Sidebar from '../Sidebar/Sidebar';
import ActionBar from '../Workspace/ActionBar';
import WorkflowGuide from '../Workspace/WorkflowGuide';
import PasteZone from '../Workspace/PasteZone';
import ProjectEditor from '../Editor/ProjectEditor';
import TrustFooter from './TrustFooter';
import Toast from './Toast';
import WelcomeScreen from './WelcomeScreen';
import SettingsPage from '../Settings/SettingsPage';
import TourOverlay from '../Tour/TourOverlay';
import { CommandPalette } from '../CommandPalette/CommandPalette';
import { PWAInstallButton } from '../PWAInstallButton';

export function AppShell() {
  useTauriSync();

  const isLoading = useProjectStore((s) => s.isLoading);
  const currentView = useProjectStore((s) => s.currentView);
  const setCurrentView = useProjectStore((s) => s.setCurrentView);
  const projects = useProjectStore((s) => s.projects);
  const activeProject = useActiveProject();

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="app-shell app-shell--loading">
        <p className="app-shell__loading-text">Loading projects...</p>
      </div>
    );
  }

  const showWelcome = projects.length === 0;

  const closeMobileDrawer = () => setMobileDrawerOpen(false);
  const openProjectsDrawer = () => {
    setCurrentView('projects');
    setMobileDrawerOpen(true);
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Sidebar onNavigate={closeMobileDrawer} />
      </aside>

      {mobileDrawerOpen && (
        <div className="mobile-drawer-overlay" onClick={closeMobileDrawer}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <Sidebar onNavigate={closeMobileDrawer} />
          </div>
        </div>
      )}

      <main className="workspace">
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            padding: '0.75rem 1rem 0',
            flexShrink: 0,
          }}
        >
          <PWAInstallButton variant="header" />
        </div>

        {currentView === 'settings' ? (
          <SettingsPage />
        ) : showWelcome ? (
          <WelcomeScreen />
        ) : (
          <div className="workspace-scroll">
            <ActionBar />
            <div className="workspace-main">
              {activeProject && <WorkflowGuide />}
              <PasteZone />
              {activeProject ? (
                <ProjectEditor />
              ) : (
                <div className="workspace-hint">
                  <p>Select a project from the sidebar to get started.</p>
                </div>
              )}
            </div>
            <TrustFooter />
          </div>
        )}
      </main>

      <div className="mobile-bottom-bar">
        <button
          type="button"
          className={`mobile-bottom-bar__btn${mobileDrawerOpen ? ' mobile-bottom-bar__btn--active' : ''}`}
          onClick={() => setMobileDrawerOpen((open) => !open)}
        >
          <span className="mobile-bottom-bar__icon" aria-hidden="true">
            📁
          </span>
          <span className="mobile-bottom-bar__label">
            Projects{projects.length > 0 ? ` (${projects.length})` : ''}
          </span>
        </button>

        <button
          type="button"
          className={`mobile-bottom-bar__btn${currentView === 'settings' ? ' mobile-bottom-bar__btn--active' : ''}`}
          onClick={() => {
            setCurrentView('settings');
            closeMobileDrawer();
          }}
        >
          <span className="mobile-bottom-bar__icon" aria-hidden="true">
            ⚙️
          </span>
          <span className="mobile-bottom-bar__label">Settings</span>
        </button>

        <button
          type="button"
          className={`mobile-bottom-bar__btn${currentView === 'projects' && !mobileDrawerOpen ? ' mobile-bottom-bar__btn--active' : ''}`}
          onClick={() => {
            setCurrentView('projects');
            closeMobileDrawer();
          }}
        >
          <span className="mobile-bottom-bar__icon" aria-hidden="true">
            🐘
          </span>
          <span className="mobile-bottom-bar__label">Workspace</span>
        </button>
      </div>

      {currentView === 'settings' && (
        <button
          type="button"
          className="mobile-projects-fab"
          onClick={openProjectsDrawer}
          aria-label="Open projects"
          title="Open projects"
        >
          <span aria-hidden="true">📁</span>
        </button>
      )}

      <Toast />
      <TourOverlay />
      <CommandPalette />
    </div>
  );
}

export default AppShell;
