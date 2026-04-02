import { useTauriSync } from '../../hooks/useTauriSync';
import { useProjectStore } from '../../store/projectStore';
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
  // Load projects on mount + auto-save active project on changes
  useTauriSync();

  const isLoading = useProjectStore((s) => s.isLoading);
  const currentView = useProjectStore((s) => s.currentView);
  const projects = useProjectStore((s) => s.projects);
  const activeProject = useProjectStore((s) => s.activeProject());

  if (isLoading) {
    return (
      <div className="app-shell" style={{ placeItems: 'center', display: 'grid' }}>
        <p style={{ color: '#888' }}>Loading projects…</p>
      </div>
    );
  }

  // Settings page replaces the workspace entirely
  if (currentView === 'settings') {
    return (
      <div className="app-shell">
        <div className="sidebar">
          <Sidebar />
        </div>
        <div className="workspace">
          <SettingsPage />
        </div>
        <Toast />
      </div>
    );
  }

  // No projects yet → welcome screen
  const showWelcome = projects.length === 0;

  return (
    <div className="app-shell">
      <div className="sidebar">
        <Sidebar />
      </div>

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

      <Toast />
    </div>
  );
}

export default AppShell;
