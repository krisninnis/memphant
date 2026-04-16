import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

export interface PWAState {
  isInstallable: boolean;
  isInstalled: boolean;
  updateAvailable: boolean;
  isChecking: boolean;
  isApplyingUpdate: boolean;
  lastChecked: Date | null;
  updateMessage: string | null;
  install: () => Promise<void>;
  checkForUpdates: () => Promise<boolean>;
  applyUpdate: () => Promise<void>;
  dismissUpdate: () => void;
}

function getIsInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const PWAContext = createContext<PWAState | null>(null);

export function PWAProvider({ children }: { children: ReactNode }) {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(getIsInstalled);
  const [isChecking, setIsChecking] = useState(false);
  const [isApplyingUpdate, setIsApplyingUpdate] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const updateIntervalRef = useRef<number | null>(null);
  const updateAvailableRef = useRef(false);

  const {
    needRefresh: [updateAvailable, setUpdateAvailable],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedRefresh() {
      console.log('[PWA] Update available: waiting service worker detected');
      setUpdateMessage(null);
    },
    onOfflineReady() {
      console.log('[PWA] Offline cache ready');
    },
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration || null;
      console.log('[PWA] Service worker registered', {
        hasRegistration: Boolean(registration),
        hasInstallingWorker: Boolean(registration?.installing),
        hasWaitingWorker: Boolean(registration?.waiting),
        hasActiveWorker: Boolean(registration?.active),
      });

      if (isTauri() || !registration) return;

      const logWorkerState = (label: string, worker: ServiceWorker | null) => {
        if (!worker) return;
        console.log(`[PWA] ${label}`, {
          state: worker.state,
          scriptURL: worker.scriptURL,
        });
      };

      logWorkerState('registration.waiting', registration.waiting);
      logWorkerState('registration.installing', registration.installing);
      logWorkerState('registration.active', registration.active);

      registration.addEventListener('updatefound', () => {
        console.log('[PWA] updatefound fired');
        const installingWorker = registration.installing;
        logWorkerState('registration.installing', installingWorker);

        installingWorker?.addEventListener('statechange', () => {
          console.log('[PWA] installing worker state changed', {
            state: installingWorker.state,
            hasWaitingWorker: Boolean(registration.waiting),
          });
        });
      });

      if (updateIntervalRef.current) {
        window.clearInterval(updateIntervalRef.current);
      }

      window.setTimeout(() => {
        void registration.update().then(
          () => setLastChecked(new Date()),
          (error) => console.error('[PWA] Startup update check failed:', error),
        );
      }, 1500);

      updateIntervalRef.current = window.setInterval(() => {
        void registration.update().then(
          () => setLastChecked(new Date()),
          (error) => console.error('[PWA] Periodic update check failed:', error),
        );
      }, 60 * 60 * 1000);
    },
    onRegisterError(error) {
      console.error('[PWA] Registration error:', error);
    },
  });

  useEffect(() => {
    updateAvailableRef.current = updateAvailable;
    console.log('[PWA] needRefresh changed', { updateAvailable });
  }, [updateAvailable]);

  useEffect(() => {
    if (typeof window === 'undefined' || isTauri()) return;

    const handleBeforeInstall = (event: Event) => {
      const e = event as BeforeInstallPromptEvent;
      e.preventDefault();
      deferredPromptRef.current = e;
      setIsInstallable(true);
      console.log('[PWA] Install prompt available');
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      deferredPromptRef.current = null;
      console.log('[PWA] App installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(display-mode: standalone)');

    const syncInstalledState = () => {
      setIsInstalled(getIsInstalled());
    };

    syncInstalledState();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncInstalledState);
      return () => mediaQuery.removeEventListener('change', syncInstalledState);
    }

    mediaQuery.addListener(syncInstalledState);
    return () => mediaQuery.removeListener(syncInstalledState);
  }, []);

  useEffect(() => {
    return () => {
      if (updateIntervalRef.current) {
        window.clearInterval(updateIntervalRef.current);
        updateIntervalRef.current = null;
      }
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferredPromptRef.current || isTauri()) return;

    await deferredPromptRef.current.prompt();
    const { outcome } = await deferredPromptRef.current.userChoice;

    if (outcome === 'accepted') {
      setIsInstalled(true);
      setIsInstallable(false);
    }

    deferredPromptRef.current = null;
  }, []);

  const checkForUpdates = useCallback(async (): Promise<boolean> => {
    if (isTauri() || !registrationRef.current) return false;

    setIsChecking(true);
    console.log('[PWA] checkForUpdates start', {
      hasWaitingWorker: Boolean(registrationRef.current.waiting),
    });

    try {
      await registrationRef.current.update();
      setLastChecked(new Date());

      await new Promise((resolve) => window.setTimeout(resolve, 1200));

      console.log('[PWA] checkForUpdates complete', {
        updateAvailable: updateAvailableRef.current,
        hasWaitingWorker: Boolean(registrationRef.current?.waiting),
      });

      return updateAvailableRef.current;
    } catch (err) {
      console.error('[PWA] Update check failed:', err);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, []);

  const applyUpdate = useCallback(async () => {
    console.log('[PWA] applyUpdate clicked', {
      hasRegistration: Boolean(registrationRef.current),
      hasWaitingWorker: Boolean(registrationRef.current?.waiting),
      hasActiveWorker: Boolean(registrationRef.current?.active),
    });

    if (isTauri()) {
      console.warn('[PWA] applyUpdate ignored in Tauri environment');
      setIsApplyingUpdate(false);
      setUpdateMessage('Update will apply the next time the web app reloads.');
      return;
    }

    const registration = registrationRef.current;

    if (!registration) {
      console.warn('[PWA] applyUpdate aborted: no service worker registration');
      setIsApplyingUpdate(false);
      setUpdateMessage('No update is ready yet. Please try again in a moment.');
      return;
    }

    setIsApplyingUpdate(true);
    setUpdateMessage(null);

    try {
      if (!registration.waiting) {
        console.log('[PWA] No waiting worker; requesting registration.update()');
        await registration.update();
        setLastChecked(new Date());
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }

      const waitingWorker = registration.waiting;

      if (!waitingWorker) {
        console.warn('[PWA] applyUpdate aborted: still no waiting worker after update check');
        setIsApplyingUpdate(false);
        setUpdateMessage('No update is ready yet. Please try again in a moment.');
        return;
      }

      console.log('[PWA] Waiting worker found; triggering activation', {
        state: waitingWorker.state,
        scriptURL: waitingWorker.scriptURL,
      });

      const controllerChangeTimeout = window.setTimeout(() => {
        console.warn('[PWA] controllerchange timeout while applying update');
        setIsApplyingUpdate(false);
        setUpdateMessage('Update is installing. If nothing changes, reopen the app.');
      }, 5000);

      const handleControllerChange = () => {
        window.clearTimeout(controllerChangeTimeout);
        console.log('[PWA] controllerchange fired, refreshing page');
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange, {
        once: true,
      });

      await updateServiceWorker(true);
      console.log('[PWA] updateServiceWorker(true) called');

      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        console.log('[PWA] SKIP_WAITING message posted to waiting worker');
      }
    } catch (error) {
      console.error('[PWA] applyUpdate failed:', error);
      setUpdateMessage('Update could not be applied. Please try again in a moment.');
      setIsApplyingUpdate(false);
    }
  }, [updateServiceWorker]);

  const dismissUpdate = useCallback(() => {
    console.log('[PWA] Update prompt dismissed');
    setUpdateMessage(null);
    setIsApplyingUpdate(false);
    setUpdateAvailable(false);
  }, [setUpdateAvailable]);

  const value = useMemo<PWAState>(
    () => ({
      isInstallable,
      isInstalled,
      updateAvailable,
      isChecking,
      isApplyingUpdate,
      lastChecked,
      updateMessage,
      install,
      checkForUpdates,
      applyUpdate,
      dismissUpdate,
    }),
    [
      isInstallable,
      isInstalled,
      updateAvailable,
      isChecking,
      isApplyingUpdate,
      lastChecked,
      updateMessage,
      install,
      checkForUpdates,
      applyUpdate,
      dismissUpdate,
    ],
  );

  return createElement(PWAContext.Provider, { value }, children);
}

export function usePWA(): PWAState {
  const context = useContext(PWAContext);

  if (!context) {
    throw new Error('usePWA must be used within a PWAProvider');
  }

  return context;
}
