import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import { loadAllFromDisk, saveToDisk } from '../services/tauriActions';
import { pullAndMerge, fetchSubscription, drainQueue } from '../services/cloudSync';
import { supabase, cloudAvailable } from '../services/supabaseClient';

export function useTauriSync() {
  const setProjects = useProjectStore((s) => s.setProjects);
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const setLoading = useProjectStore((s) => s.setLoading);
  const showToast = useProjectStore((s) => s.showToast);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unsubscribeAuth: (() => void) | null = null;

    async function init() {
      setLoading(true);

      try {
        // Step 1: Load local data from disk first
        const loaded = await loadAllFromDisk();
        setProjects(loaded);

        // Step 2: Attach auth listener after local projects are loaded
        if (supabase && cloudAvailable) {
          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange(async (event, session) => {
            const store = useProjectStore.getState();

            if (event === 'SIGNED_OUT') {
              store.setCloudUser(null);
              store.setSubscriptionTier('free');
              store.setSubscriptionStatus('none');
              store.setSyncStatus('idle');
              store.setIsAdmin(false);
              return;
            }

            if (event === 'TOKEN_REFRESHED') return;

            const sessionUser = session?.user;
            if (!sessionUser?.email) return;

            const incomingUser = {
              id: sessionUser.id,
              email: sessionUser.email,
            };

            const currentId = store.cloudUser?.id;

            store.setCloudUser(incomingUser);

            const role = (sessionUser.app_metadata as Record<string, unknown>)?.role;
            store.setIsAdmin(role === 'admin');

            try {
              const sub = await fetchSubscription(incomingUser.id);
              store.setSubscriptionTier(sub.tier);
              store.setSubscriptionStatus(sub.status);
            } catch (err) {
              console.error('Subscription fetch failed:', err);
            }

            // Only run startup sync when restoring an existing session
            if (event !== 'INITIAL_SESSION') return;

            if (currentId === incomingUser.id) return;

            store.setSyncStatus('syncing');

            try {
              await drainQueue();

              const projectsToSync = useProjectStore.getState().projects;
              const { merged, changed } = await pullAndMerge(projectsToSync);

              if (changed) {
                store.setProjects(merged);
              }

              store.setLastSyncedAt(new Date().toISOString());
              store.setSyncStatus('idle');
            } catch (err) {
              console.error('Cloud sync failed:', err);
              store.setSyncStatus('error');
              store.showToast('Cloud sync failed.', 'error');
            }
          });

          unsubscribeAuth = () => subscription.unsubscribe();
        }

        // Step 3: Select a default active project only if nothing is selected yet
        setTimeout(() => {
          const store = useProjectStore.getState();
          const finalProjects = store.projects;

          if (finalProjects.length > 0 && !store.activeProjectId) {
            setActiveProject(finalProjects[0].id);
          }
        }, 0);
      } catch (err) {
        console.error('Failed to load projects:', err);
        showToast('Could not load projects.', 'error');
      } finally {
        setLoading(false);
      }
    }

    void init();

    return () => {
      unsubscribeAuth?.();
    };
  }, [setActiveProject, setLoading, setProjects, showToast]);

  useEffect(() => {
    if (!activeProjectId) return;

    const project = useProjectStore
      .getState()
      .projects.find((p) => p.id === activeProjectId);

    if (!project) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(async () => {
      try {
        await saveToDisk(project);
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [projects, activeProjectId]);
}