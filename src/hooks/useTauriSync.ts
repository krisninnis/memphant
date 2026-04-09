import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import { loadAllFromDisk, saveToDisk } from '../services/tauriActions';
import { restoreSession, pullAndMerge, fetchSubscription, drainQueue } from '../services/cloudSync';

export function useTauriSync() {
  const setProjects = useProjectStore((s) => s.setProjects);
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const setLoading = useProjectStore((s) => s.setLoading);
  const showToast = useProjectStore((s) => s.showToast);
  const setCloudUser = useProjectStore((s) => s.setCloudUser);
  const setSyncStatus = useProjectStore((s) => s.setSyncStatus);
  const setLastSyncedAt = useProjectStore((s) => s.setLastSyncedAt);
  const setSubscriptionTier   = useProjectStore((s) => s.setSubscriptionTier);
  const setSubscriptionStatus = useProjectStore((s) => s.setSubscriptionStatus);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        const loaded = await loadAllFromDisk();

        // Restore cloud session if previously signed in
        const user = await restoreSession();
        if (user) {
          setCloudUser(user);

          // Load subscription tier
          const sub = await fetchSubscription(user.id);
          setSubscriptionTier(sub.tier);
          setSubscriptionStatus(sub.status);

          // Drain any queued offline pushes, then pull remote
          setSyncStatus('syncing');
          try {
            await drainQueue();
            const { merged, changed } = await pullAndMerge(loaded);
            setProjects(changed ? merged : loaded);
            setLastSyncedAt(new Date().toISOString());
            setSyncStatus('idle');
          } catch {
            setSyncStatus('error');
            setProjects(loaded);
          }
        } else {
          setProjects(loaded);
        }

        const finalProjects = useProjectStore.getState().projects;
        if (finalProjects.length > 0) {
          setActiveProject(finalProjects[0].id);
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
        showToast('Could not load projects.');
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, []);

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
