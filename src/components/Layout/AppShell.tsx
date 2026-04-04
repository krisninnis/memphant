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
      <div className="app-shell" style={{ placeItems: 'center', display: 'grid' }}>
        <p style={{ color: '#888' }}>Loading projects…</p>
      </div>
    );
  }

  if (currentView === 'settings') {
    return (
      <div className="app-shell">
        <div className="sidebar">
          <Sidebar />
        </div>
        <div className="workspace">
          <SettingsPage />
        </div>
        {/* Mobile bottom bar */}
        <div className="mobile-bottom-bar">
          <button
            className="mobile-bottom-bar__btn"
            onClick={() => { setCurrentView('projects'); setMobileDrawerOpen(true); }}
          >
            <span className="mobile-bottom-bar__icon">🗂️</span>
            <span className="mobile-bottom-bar__label">Projects</span>
          </button>
          <button
            className="mobile-bottom-bar__btn mobile-bottom-bar__btn--active"
            onClick={() => setCurrentView('settings')}
          >
            <span className="mobile-bottom-bar__icon">⚙️</span>
            <span className="mobile-bottom-bar__label">Settings</span>
          </button>
        </div>
        <Toast />
      </div>
    );
  }

  const showWelcome = projects.length === 0;

  return (
    <div className="app-shell">
      <div className="sidebar">
        <Sidebar onNavigate={() => setMobileDrawerOpen(false)} />
      </div>

      {/* Mobile slide-up drawer */}
      {mobileDrawerOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setMobileDrawerOpen(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <Sidebar onNavigate={() => setMobileDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="workspace">
        {showWelcome ? (
          <WelcomeScreen />
        ) : (
          <>
            <ActionBar />
            <div className="workspace-scroll">
              {activeProject && <WorkflowGuide />}
              <PasteZone />
              {activeProject && <ProjectEditor />}
              {!activeProject && (
                <div className="workspace-hint">
                  <p>Select a project from the sidebar to get started.</p>
                </div>
              )}
            </div>
            <TrustFooter />
          </>
        )}
      </div>

      {/* Mobile bottom bar */}
      <div className="mobile-bottom-bar">
        <button
          className={`mobile-bottom-bar__btn${mobileDrawerOpen ? ' mobile-bottom-bar__btn--active' : ''}`}
          onClick={() => setMobileDrawerOpen((o) => !o)}
        >
          <span className="mobile-bottom-bar__icon">🗂️</span>
          <span className="mobile-bottom-bar__label">
            Projects{projects.length > 0 ? ` (${projects.length})` : ''}
          </span>
        </button>
        <button
          className="mobile-bottom-bar__btn"
          onClick={() => { setCurrentView('settings'); setMobileDrawerOpen(false); }}
        >
          <span className="mobile-bottom-bar__icon">⚙️</span>
          <span className="mobile-bottom-bar__label">Settings</span>
        </button>
      </div>

      <Toast />
    </div>
  );
}

export default AppShell;
