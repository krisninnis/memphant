import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import { loadAllFromDisk, saveToDisk } from '../services/tauriActions';
import { fetchSubscription, runCloudSyncCycle } from '../services/cloudSync';
import { supabase, cloudAvailable } from '../services/supabaseClient';
import type { ProjectMemory } from '../types/memphant-types';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function withUiTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  label: string,
  onLateSuccess?: (value: T) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      timedOut = true;
      console.warn('[useTauriSync] ui_timeout_fired', { label, timeoutMs, uiOnly: true });
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) {
          if (timedOut) {
            console.warn('[useTauriSync] late_resolution_applying', { label, timeoutMs });
            onLateSuccess?.(value);
          }
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        if (settled) {
          if (timedOut) {
            console.warn('[useTauriSync] late_rejection_ignored', { label, timeoutMs, error });
          }
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        console.error('[useTauriSync] ui_timeout_rejected', { label, timeoutMs, error });
        reject(error);
      },
    );

    window.setTimeout(() => {
      if (!settled) {
        console.warn('[useTauriSync] underlying_request_still_in_flight', { label, timeoutMs });
      }
    }, timeoutMs + 50);
  });
}

export function useTauriSync() {
  const setProjects = useProjectStore((s) => s.setProjects);
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const setLoading = useProjectStore((s) => s.setLoading);
  const showToast = useProjectStore((s) => s.showToast);
  const general = useProjectStore((s) => s.settings.general);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const desktopPrefsSyncedRef = useRef(false);

  useEffect(() => {
    if (desktopPrefsSyncedRef.current) return;
    if (!isTauri()) return;

    desktopPrefsSyncedRef.current = true;

    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke(general.runOnStartup ? 'enable_autostart' : 'disable_autostart');
      } catch (err) {
        console.warn('[Memephant] Autostart sync failed:', err);
      }

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('toggle_tray_mode', { enabled: general.systemTray });
      } catch (err) {
        console.warn('[Memephant] Tray-mode sync failed:', err);
      }
    })();
  }, [general.runOnStartup, general.systemTray]);

  useEffect(() => {
    let unsubscribeAuth: (() => void) | null = null;

    async function init() {
      setLoading(true);

      try {
        // Step 1: Load local data from disk, but do not immediately publish it
        // into the visible workspace before auth state is known.
        const loaded = await loadAllFromDisk();

        // Step 2: Attach auth listener after local projects are loaded
        if (supabase && cloudAvailable) {
          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange(async (event, session) => {
            const store = useProjectStore.getState();

            if (event === 'SIGNED_OUT') {
              console.warn('[CloudSync] ACCOUNT LOGOUT — clearing visible workspace');
              store.setProjects([]);
              store.resetCloudState();
              return;
            }

            if (event === 'TOKEN_REFRESHED') return;

            const sessionUser = session?.user;
            if (!sessionUser?.email) {
              store.setProjects([]);
              store.resetCloudState();
              return;
            }

            const incomingUser = {
              id: sessionUser.id,
              email: sessionUser.email,
            };

            const currentId = store.cloudUser?.id;
            const cloudSyncEnabled = store.settings.privacy.cloudSyncEnabled;

            store.setCloudUser(incomingUser);

            const role = (sessionUser.app_metadata as Record<string, unknown>)?.role;
            store.setIsAdmin(role === 'admin');

            if (!cloudSyncEnabled) {
              store.setCloudDisconnecting(false);
              store.setSyncStatus('saved_local');
              return;
            }

            try {
              const sub = await fetchSubscription(incomingUser.id);
              store.setSubscriptionTier(sub.tier);
              store.setSubscriptionStatus(sub.status);
            } catch (err) {
              console.error('Subscription fetch failed:', err);
            }

            // Treat both restored sessions and fresh manual sign-ins as
            // account-entry events. On account entry, DO NOT keep device-local
            // projects visible as if they belong to the signed-in user.
            const shouldHydrateCloudProjects =
              event === 'INITIAL_SESSION' || event === 'SIGNED_IN';

            if (!shouldHydrateCloudProjects) return;

            if (currentId === incomingUser.id) return;

            // ACCOUNT ISOLATION: A different user (or first-time login) is taking
            // over. Immediately clear the previous user's projects from the store
            // so they are never visible to the incoming user, even briefly.
            console.warn('[useTauriSync] ACCOUNT SWITCH DETECTED — clearing visible workspace');
            store.setProjects([]);

            store.setSyncStatus('syncing');

            try {
              // Pull ONLY — never push on login. The device may have projects from
              // a different account on disk. Local projects are ignored here; push
              // only happens when the user explicitly saves a project.
              console.warn('[useTauriSync] LOCAL PROJECTS IGNORED ON LOGIN — pulling cloud state only');

              const applyCloudResult = (merged: ProjectMemory[], conflicts: string[]) => {
                const st = useProjectStore.getState();
                console.warn(`[useTauriSync] CLOUD PROJECTS LOADED: ${merged.length} projects`);
                st.setProjects(merged);
                st.setActiveProject(merged[0]?.id ?? null);
                if (conflicts.length > 0) {
                  st.showToast(
                    `Cloud updated ${conflicts.length} project${conflicts.length === 1 ? '' : 's'} from a newer cloud version.`,
                    'info',
                  );
                }
                st.setLastSyncedAt(new Date().toISOString());
                st.setSyncStatus('synced');
              };

              const { merged, conflicts } = await withUiTimeout(
                runCloudSyncCycle([], 'startup', incomingUser.id),
                30000,
                'Cloud restore timed out.',
                'useTauriSync.account_entry_sync_cycle',
                ({ merged: lateM, conflicts: lateC }) => {
                  console.warn('[useTauriSync] LATE CLOUD RESULT ARRIVED — applying to store');
                  useProjectStore.getState().setSyncStatus('synced');
                  applyCloudResult(lateM, lateC);
                },
              );

              applyCloudResult(merged, conflicts);
            } catch (err) {
              console.error('Cloud sync failed:', err);
              store.setSyncStatus('error');
              store.showToast('Cloud sync failed.', 'error');
            }
          });

          unsubscribeAuth = () => subscription.unsubscribe();
        } else {
          // No cloud auth available at all: local-only mode is allowed to
          // show device-local projects immediately.
          setProjects(loaded);
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
        useProjectStore.getState().setSyncStatus('error');
        useProjectStore.getState().showToast('Auto-save failed. Your changes may not be saved.', 'error');
      }
    }, 500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [projects, activeProjectId]);
}
