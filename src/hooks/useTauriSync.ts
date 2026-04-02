import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import { loadAllFromDisk, saveToDisk } from '../services/tauriActions';

/**
 * Hook that bridges Tauri file system with the Zustand store.
 * - Loads all projects on mount
 * - Auto-saves the active project on changes (debounced 500ms)
 *
 * Call this ONCE in AppShell. All action functions (create, delete, etc.)
 * live in services/tauriActions.ts and can be imported directly by components.
 */
export function useTauriSync() {
  const setProjects = useProjectStore((s) => s.setProjects);
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const setLoading = useProjectStore((s) => s.setLoading);
  const showToast = useProjectStore((s) => s.showToast);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load all projects on mount
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        const loaded = await loadAllFromDisk();
        setProjects(loaded);
        if (loaded.length > 0) {
          setActiveProject(loaded[0].id);
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
        showToast('Could not load projects.');
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced auto-save when the active project changes
  const activeProject = projects.find((p) => p.id === activeProjectId);

  useEffect(() => {
    if (!activeProject) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveToDisk(activeProject);
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [activeProject]);
}
