import { create } from 'zustand';
import type { ProjectMemory, Platform, AppSettings } from '../types/project-brain-types';
import { DEFAULT_SETTINGS } from '../types/project-brain-types';

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
  settings: DEFAULT_SETTINGS,
  currentView: 'projects',
  preAiBackup: null,

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
    set((state) => ({
      settings: { ...state.settings, ...updates },
    })),

  // Rollback
  setPreAiBackup: (project) => set({ preAiBackup: project }),

  // Project operations
  updateProject: (id, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === id ? { ...p, ...updates } : p
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
