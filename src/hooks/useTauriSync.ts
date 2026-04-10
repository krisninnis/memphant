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
        // ── Step 1: Load local data from disk first ──────────────────────────
        // Auth listener is attached afterward so that INITIAL_SESSION fires
        // with local projects already available in the closure.
        const loaded = await loadAllFromDisk();
        setProjects(loaded);

        // ── Step 2: Attach onAuthStateChange listener ─────────────────────────
        // This replaces the old one-shot restoreSession() call. The listener
        // stays active for the lifetime of the app and handles:
        //   INITIAL_SESSION — app start with a saved session (startup sync)
        //   SIGNED_IN       — email/OAuth sign-in completed
        //   SIGNED_OUT      — explicit sign-out or session expiry
        //   TOKEN_REFRESHED — silent JWT rotation (no action needed)
        //   USER_UPDATED    — email/metadata change
        if (supabase && cloudAvailable) {
          const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
              // Always read store state fresh inside callbacks to avoid stale closures
              const store = useProjectStore.getState();

              // ── Sign-out: clear everything immediately ──────────────────
              if (event === 'SIGNED_OUT') {
                store.setCloudUser(null);
                store.setSubscriptionTier('free');
                store.setSubscriptionStatus('none');
                store.setSyncStatus('idle');
                return;
              }

              // ── Token rotation: session is still valid, no UI change needed
              if (event === 'TOKEN_REFRESHED') return;

              // ── All other events require a valid user ───────────────────
              const sessionUser = session?.user;
              if (!sessionUser?.email) return;

              const incomingUser = { id: sessionUser.id, email: sessionUser.email };
              const currentId = store.cloudUser?.id;

              // Update cloudUser in store (covers sign-in, restored session,
              // email change via USER_UPDATED)
              store.setCloudUser(incomingUser);

              // Refresh subscription whenever the authenticated user changes
              try {
                const sub = await fetchSubscription(incomingUser.id);
                store.setSubscriptionTier(sub.tier);
                store.setSubscriptionStatus(sub.status);
              } catch {
                // Subscription fetch is non-fatal; free defaults remain
              }

              // ── Cloud sync on app startup only ──────────────────────────
              // INITIAL_SESSION = app opened with an existing saved session.
              // We do the startup sync here, replacing the old restoreSession() flow.
              //
              // SIGNED_IN is intentionally excluded: explicit sign-in flows in
              // SettingsSync already call pushAll + pullAndMerge immediately after
              // the auth call returns, so triggering a second sync here would
              // cause duplicate network calls and potential state races.
              //
              // USER_UPDATED changes metadata only; no sync needed.
              if (event !== 'INITIAL_SESSION') return;

              // Skip startup sync if this user was already synced in a prior
              // render (shouldn't normally happen, but guard against it)
              if (currentId === incomingUser.id) return;

              store.setSyncStatus('syncing');
              try {
                await drainQueue();
                // Use the current store projects (just set from disk above)
                const projectsToSync = useProjectStore.getState().projects;
                const { merged, changed } = await pullAndMerge(projectsToSync);
                if (changed) store.setProjects(merged);
                store.setLastSyncedAt(new Date().toISOString());
                store.setSyncStatus('idle');
              } catch {
                store.setSyncStatus('error');
              }
            },
          );

          unsubscribeAuth = () => subscription.unsubscribe();
        }

        // ── Step 3: Select the first project as active ────────────────────────
        // Read from store (may have been updated by INITIAL_SESSION handler if
        // it fired synchronously)
        const finalProjects = useProjectStore.getState().projects;
        if (finalProjects.length > 0) {
          setActiveProject(finalProjects[0].id);
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
        showToast('Could not load projects.');
      } finally {
        // isLoading covers disk load only; cloud sync progress is shown
        // separately via syncStatus
        setLoading(false);
      }
    }

    init();

    return () => {
      unsubscribeAuth?.();
    };
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
