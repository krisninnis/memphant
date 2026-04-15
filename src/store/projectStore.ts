import { create } from 'zustand';
import type { ProjectMemory, Platform, AppSettings } from '../types/memphant-types';
import { DEFAULT_SETTINGS } from '../types/memphant-types';
import type { CloudUser } from '../services/cloudSync';

export type SyncStatus = 'saved_local' | 'pending' | 'syncing' | 'synced' | 'error';
export type SubscriptionTier = 'free' | 'pro' | 'team';
export type SubscriptionStatus = 'none' | 'active' | 'trialing' | 'past_due' | 'canceled';

const SETTINGS_STORAGE_KEY = 'mph_settings_v1';

function mergeSettings(raw: unknown): AppSettings {
  const candidate = (raw && typeof raw === 'object' ? (raw as Record<string, any>) : null) ?? {};

  return {
    ...DEFAULT_SETTINGS,
    ...candidate,
    general: { ...DEFAULT_SETTINGS.general, ...(candidate.general ?? {}) },
    privacy: { ...DEFAULT_SETTINGS.privacy, ...(candidate.privacy ?? {}) },
    localAi: { ...DEFAULT_SETTINGS.localAi, ...(candidate.localAi ?? {}) },
    projects: { ...DEFAULT_SETTINGS.projects, ...(candidate.projects ?? {}) },
    platforms: {
      enabled: {
        ...DEFAULT_SETTINGS.platforms.enabled,
        ...((candidate.platforms ?? {})?.enabled ?? {}),
      },
    },
  };
}

function loadSettingsFromStorage(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return mergeSettings(JSON.parse(raw));
  } catch (err) {
    console.warn('[Memphant] Failed to load settings:', err);
    return DEFAULT_SETTINGS;
  }
}

function persistSettingsToStorage(settings: AppSettings): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[Memphant] Failed to persist settings:', err);
  }
}

interface ProjectStore {
  // State
  projects: ProjectMemory[];
  activeProjectId: string | null;
  currentTask: string;
  targetPlatform: Platform;
  isLoading: boolean;
  toastMessage: string | null;
  toastType: 'success' | 'error' | 'info';
  settings: AppSettings;
  currentView: 'projects' | 'settings';

  // Rollback state — stores the project snapshot before last AI merge
  preAiBackup: ProjectMemory | null;

  // Cloud sync state
  cloudUser: CloudUser | null;
  cloudDisconnecting: boolean;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;

  // Subscription state (loaded from Supabase after login)
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;

  // Settings navigation
  settingsTab: string;

  // Tour
  tourActive: boolean;

  // Admin
  /** True when the signed-in user has the admin role. Never set for free/pro/team users.
   *  Used to conditionally render admin-only UI in future views. */
  isAdmin: boolean;

  // Actions
  setProjects: (projects: ProjectMemory[]) => void;
  setActiveProject: (id: string | null) => void;
  setCurrentTask: (task: string) => void;
  setTargetPlatform: (platform: Platform) => void;
  setLoading: (loading: boolean) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  clearToast: () => void;
  setCurrentView: (view: 'projects' | 'settings') => void;
  updateSettings: (updates: Partial<AppSettings>) => void;

  // Rollback
  setPreAiBackup: (project: ProjectMemory | null) => void;

  // Cloud sync actions
  setCloudUser: (user: CloudUser | null) => void;
  setCloudDisconnecting: (disconnecting: boolean) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setLastSyncedAt: (at: string) => void;
  resetCloudState: () => void;

  // Subscription actions
  setSubscriptionTier: (tier: SubscriptionTier) => void;
  setSubscriptionStatus: (status: SubscriptionStatus) => void;

  // Settings navigation
  setSettingsTab: (tab: string) => void;
  setTourActive: (active: boolean) => void;

  // Admin
  setIsAdmin: (admin: boolean) => void;

  // Project operations
  updateProject: (id: string, updates: Partial<ProjectMemory>) => void;
  addProject: (project: ProjectMemory) => void;
  removeProject: (id: string) => void;

  // Computed
  activeProject: () => ProjectMemory | undefined;
  enabledPlatforms: () => Platform[];
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  // Initial state
  projects: [],
  activeProjectId: null,
  currentTask: '',
  targetPlatform: 'claude',
  isLoading: false,
  toastMessage: null,
  toastType: 'success',
  settings: loadSettingsFromStorage(),
  currentView: 'projects',
  preAiBackup: null,

  // Cloud sync state
  cloudUser: null,
  cloudDisconnecting: false,
  syncStatus: 'saved_local' as SyncStatus,
  lastSyncedAt: null,

  // Subscription state
  subscriptionTier: 'free' as SubscriptionTier,
  subscriptionStatus: 'none' as SubscriptionStatus,

  // Settings navigation
  settingsTab: 'general',

  // Tour
  tourActive: false,

  // Admin
  isAdmin: false,

  // Actions
  setProjects: (projects) => set({ projects }),
  setActiveProject: (id) => set({ activeProjectId: id }),
  setCurrentTask: (task) => set({ currentTask: task }),
  setTargetPlatform: (platform) => set({ targetPlatform: platform }),
  setLoading: (loading) => set({ isLoading: loading }),
  showToast: (message, type = 'success') => {
    set({ toastMessage: message, toastType: type });
    setTimeout(() => set({ toastMessage: null }), 3000);
  },
  clearToast: () => set({ toastMessage: null }),
  setCurrentView: (view) => set({ currentView: view }),
  updateSettings: (updates) =>
    set((state) => {
      const next = mergeSettings({ ...state.settings, ...updates });
      persistSettingsToStorage(next);
      return { settings: next };
    }),

  // Rollback
  setPreAiBackup: (project) => set({ preAiBackup: project }),

  // Cloud sync actions
  setCloudUser: (user) => set({ cloudUser: user }),
  setCloudDisconnecting: (disconnecting) => set({ cloudDisconnecting: disconnecting }),
  setSyncStatus: (status) => set({ syncStatus: status }),
  setLastSyncedAt: (at) => set({ lastSyncedAt: at }),
  resetCloudState: () =>
    set({
      cloudUser: null,
      cloudDisconnecting: false,
      syncStatus: 'saved_local',
      lastSyncedAt: null,
      subscriptionTier: 'free',
      subscriptionStatus: 'none',
      isAdmin: false,
    }),

  // Subscription actions
  setSubscriptionTier: (tier) => set({ subscriptionTier: tier }),
  setSubscriptionStatus: (status) => set({ subscriptionStatus: status }),

  // Settings navigation
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  setTourActive: (active) => set({ tourActive: active }),

  // Admin
  setIsAdmin: (admin) => set({ isAdmin: admin }),

  // Project operations
  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id
          ? {
              ...p,
              ...updates,
              updatedAt: updates.updatedAt ?? new Date().toISOString(),
            }
          : p
      ),
    })),

  addProject: (project) =>
    set((state) => ({
      projects: [...state.projects, project],
    })),

  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      activeProjectId:
        state.activeProjectId === id ? null : state.activeProjectId,
    })),

  // Computed
  activeProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId);
  },

  enabledPlatforms: () => {
    const { settings } = get();
    return (Object.entries(settings.platforms.enabled) as [Platform, boolean][])
      .filter(([, enabled]) => enabled)
      .map(([platform]) => platform);
  },
}));
