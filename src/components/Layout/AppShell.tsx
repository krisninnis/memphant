import { useTauriSync } from '../../hooks/useTauriSync';
import { useProjectStore } from '../../store/projectStore';
import Sidebar from '../Sidebar/Sidebar';
import ActionBar from '../Workspace/ActionBar';
import WorkflowGuide from '../Workspace/WorkflowGuide';
import PasteZone from '../Workspace/PasteZone';
import ProjectEditor from '../Editor/ProjectEditor';
import TrustFooter from './TrustFooter';
import Toast from './Toast';

export function AppShell() {
  // Load projects on mount + auto-save active project on changes
  useTauriSync();

  const isLoading = useProjectStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <div className="app-shell" style={{ placeItems: 'center', display: 'grid' }}>
        <p style={{ color: '#888' }}>Loading projects\u2026</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="sidebar">
        <Sidebar />
      </div>

      <div className="workspace">
        <ActionBar />

        <div className="workspace-scroll">
          <WorkflowGuide />
          <PasteZone />
          <ProjectEditor />
        </div>

        <TrustFooter />
      </div>

      <Toast />
    </div>
  );
}

export default AppShell;
