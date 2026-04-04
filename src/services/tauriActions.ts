/**
 * Standalone Tauri action functions that operate on the Zustand store.
 * These are NOT hooks — they can be called from anywhere.
 *
 * Browser fallback: when running in a regular browser (phone preview / web mode)
 * all Tauri invoke() calls fall back to localStorage so the app remains usable.
 */
import { useProjectStore } from '../store/projectStore';
import type { ProjectMemory, Platform } from '../types/project-brain-types';
import { hashProjectState } from '../types/project-brain-types';

// ─── Tauri detection ─────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ─── Browser localStorage fallback storage ───────────────────────────────────

const LS_PREFIX = 'pb_project:';

const browserStore = {
  save(projectName: string, data: string): void {
    const key = LS_PREFIX + projectName.replace(/\s+/g, '_');
    localStorage.setItem(key, data);
  },
  list(): string[] {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX))
      .map((k) => k.slice(LS_PREFIX.length) + '.json');
  },
  load(fileName: string): string {
    const key = LS_PREFIX + fileName.replace(/\.json$/, '');
    const data = localStorage.getItem(key);
    if (!data) throw new Error(`Project not found: ${fileName}`);
    return data;
  },
  delete(fileName: string): void {
    const key = LS_PREFIX + fileName.replace(/\.json$/, '');
    localStorage.removeItem(key);
  },
};

// ─── Tauri lazy imports (only loaded in Tauri context) ────────────────────────

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

async function openFolderDialog(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === 'string' ? selected : null;
}

// ─── Old ↔ New format conversion ─────────────────────────────────────────────

export function normalizeOldProject(raw: Record<string, any>): ProjectMemory {
  return {
    schema_version: 1,
    id: raw.id || raw.projectName?.replace(/\s+/g, '_').toLowerCase() || crypto.randomUUID(),
    name: raw.projectName || raw.name || 'Untitled',
    summary: raw.summary || '',
    goals: Array.isArray(raw.goals) ? raw.goals : [],
    rules: Array.isArray(raw.rules) ? raw.rules : [],
    decisions: Array.isArray(raw.decisions)
      ? raw.decisions.map((d: any) =>
          typeof d === 'string' ? { decision: d } : d
        )
      : [],
    currentState: raw.currentState || '',
    nextSteps: Array.isArray(raw.nextSteps) ? raw.nextSteps : [],
    openQuestions: Array.isArray(raw.openQuestions) ? raw.openQuestions : [],
    importantAssets: Array.isArray(raw.importantAssets) ? raw.importantAssets : [],
    aiInstructions: typeof raw.aiInstructions === 'string'
      ? raw.aiInstructions
      : raw.aiInstructions?.focus || '',
    linkedFolder: raw.linkedFolder
      ? {
          path: raw.linkedFolder.path,
          scanHash: raw.linkedFolder.scanHash,
          lastScannedAt: raw.linkedFolder.lastScannedAt,
        }
      : undefined,
    changelog: Array.isArray(raw.changelog)
      ? raw.changelog.map((entry: any) => ({
          timestamp: entry.date || entry.timestamp || new Date().toISOString(),
          field: entry.field || 'general',
          action: entry.action || ('updated' as const),
          summary: entry.description || entry.summary || '',
          source: entry.source,
        }))
      : [],
    platformState: raw.platformState
      ? Object.fromEntries(
          Object.entries(raw.platformState).map(([platform, state]: [string, any]) => [
            platform,
            {
              lastExportHash: state?.lastExportHash || state?.lastSentSnapshotId,
              lastExportedAt: state?.lastExportedAt || state?.lastReplyAt,
              lastReplyAt: state?.lastReplyAt,
              lastSessionNote: state?.lastSessionNote,
              exportCount: state?.exportCount,
            },
          ])
        )
      : {},
  };
}

export function toOldFormat(project: ProjectMemory): Record<string, any> {
  return {
    schema_version: '0.2.0',
    id: project.id,
    projectName: project.name,
    created: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    summary: project.summary,
    goals: project.goals,
    rules: project.rules,
    decisions: project.decisions.map((d) =>
      typeof d === 'string' ? d : d.decision
    ),
    currentState: project.currentState,
    nextSteps: project.nextSteps,
    openQuestions: project.openQuestions,
    importantAssets: project.importantAssets,
    aiInstructions: {
      role: 'You are a project collaborator.',
      tone: 'Clear, direct, structured',
      focus: project.aiInstructions || 'Help move the project forward without losing continuity',
    },
    linkedFolder: project.linkedFolder,
    changelog: project.changelog.map((entry) => ({
      date: entry.timestamp,
      source: entry.source || 'app',
      description: entry.summary,
    })),
    platformState: project.platformState
      ? Object.fromEntries(
          Object.entries(project.platformState).map(([platform, state]) => [
            platform,
            {
              lastSentSnapshotId: state?.lastExportHash || '',
              lastExportedAt: state?.lastExportedAt,
              lastExportHash: state?.lastExportHash,
              lastReplyAt: state?.lastReplyAt,
              lastSessionNote: state?.lastSessionNote,
              exportCount: state?.exportCount,
            },
          ])
        )
      : {},
    snapshots: [],
    handoffs: [],
    autoFillState: {},
  };
}

// ─── Scan result types ────────────────────────────────────────────────────────

type ScanResult = {
  files: string[];
  scan_hash: string;
  meta: {
    readme?: string;
    package_json?: { name?: string; description?: string; version?: string };
    cargo_toml?: { name?: string; description?: string; version?: string };
  };
};

type RescanResult = {
  files: string[];
  scan_hash: string;
  folder_exists: boolean;
  meta?: ScanResult['meta'];
};

// ─── Core storage operations (with browser fallback) ─────────────────────────

export async function saveToDisk(project: ProjectMemory): Promise<void> {
  const data = JSON.stringify(toOldFormat(project), null, 2);
  if (isTauri()) {
    // Rotate backup of the current file before overwriting it
    const stem = project.name.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 100);
    const fileName = `${stem}.json`;
    try {
      await tauriInvoke('backup_project_file', { fileName });
    } catch (err) {
      // Backup failure is non-fatal — log and continue saving
      console.warn('[Project Brain] Backup failed:', err);
    }
    await tauriInvoke('save_project_file', {
      projectName: project.name,
      projectData: data,
    });
  } else {
    browserStore.save(project.name, data);
  }
}

export async function loadAllFromDisk(): Promise<ProjectMemory[]> {
  const fileNames = isTauri()
    ? await tauriInvoke<string[]>('load_projects')
    : browserStore.list();

  const loaded: ProjectMemory[] = [];
  for (const fileName of fileNames) {
    try {
      const content = isTauri()
        ? await tauriInvoke<string>('load_project_file', { fileName })
        : browserStore.load(fileName);
      loaded.push(normalizeOldProject(JSON.parse(content)));
    } catch (err) {
      console.warn(`Failed to load ${fileName}:`, err);
    }
  }
  return loaded;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

const store = () => useProjectStore.getState();

export async function createProject(name: string): Promise<void> {
  if (!name.trim()) {
    store().showToast('Please enter a project name.');
    return;
  }

  const now = new Date().toISOString();
  const id = name.trim().replace(/\s+/g, '_').toLowerCase() + '_' + Date.now();

  const project: ProjectMemory = {
    schema_version: 1,
    id,
    name: name.trim(),
    summary: '',
    goals: [],
    rules: [],
    decisions: [],
    currentState: 'Project created',
    nextSteps: [],
    openQuestions: [],
    importantAssets: [],
    changelog: [
      { timestamp: now, field: 'general', action: 'added', summary: 'Project created', source: 'app' },
    ],
    platformState: {},
  };

  try {
    await saveToDisk(project);
    store().addProject(project);
    store().setActiveProject(project.id);
    store().showToast(`"${project.name}" created.`);
  } catch (err) {
    console.error('Create failed:', err);
    store().showToast('Could not create that project.', 'error');
  }
}

export async function createProjectFromFolder(): Promise<void> {
  if (!isTauri()) {
    store().showToast('Folder scanning requires the desktop app.', 'info');
    return;
  }

  const selected = await openFolderDialog();
  if (!selected) return;

  try {
    const normalizedPath = selected.replace(/\\/g, '/');
    const folderName = normalizedPath.split('/').filter(Boolean).pop() || 'Imported Project';

    const result = await tauriInvoke<ScanResult>('scan_project_folder', { folderPath: selected });

    const derivedName = result.meta?.package_json?.name || result.meta?.cargo_toml?.name || folderName;
    const derivedSummary = result.meta?.package_json?.description || '';
    const now = new Date().toISOString();
    const id = derivedName.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now();

    const project: ProjectMemory = {
      schema_version: 1,
      id,
      name: derivedName,
      summary: derivedSummary,
      goals: [],
      rules: [],
      decisions: [],
      currentState: `Project folder scanned. ${result.files.length} useful files identified.`,
      nextSteps: [],
      openQuestions: [],
      importantAssets: result.files.slice(0, 200),
      linkedFolder: { path: selected, scanHash: result.scan_hash, lastScannedAt: now },
      changelog: [
        { timestamp: now, field: 'general', action: 'added', summary: `Project created from folder: ${folderName}`, source: 'app' },
      ],
      platformState: {},
    };

    await saveToDisk(project);
    store().addProject(project);
    store().setActiveProject(project.id);
    store().showToast(`"${project.name}" created from folder.`);
  } catch (err) {
    console.error('Folder scan failed:', err);
    store().showToast('Could not create a project from that folder.', 'error');
  }
}

export async function rescanLinkedFolder(): Promise<void> {
  const activeProject = store().activeProject();
  if (!activeProject?.linkedFolder?.path) {
    store().showToast('This project is not linked to a folder.');
    return;
  }

  if (!isTauri()) {
    store().showToast('Folder scanning requires the desktop app.', 'info');
    return;
  }

  try {
    const result = await tauriInvoke<RescanResult>('rescan_linked_folder', {
      folderPath: activeProject.linkedFolder.path,
    });

    if (!result.folder_exists) {
      store().showToast('Linked folder not found — it may have been moved.', 'error');
      return;
    }

    const now = new Date().toISOString();
    store().updateProject(activeProject.id, {
      importantAssets: result.files.slice(0, 200),
      linkedFolder: {
        path: activeProject.linkedFolder.path,
        scanHash: result.scan_hash,
        lastScannedAt: now,
      },
      changelog: [
        ...activeProject.changelog,
        { timestamp: now, field: 'general', action: 'updated', summary: 'Linked project rescanned', source: 'system' },
      ],
    });

    store().showToast('Rescan complete — project updated.');
  } catch (err) {
    console.error('Rescan failed:', err);
    store().showToast('Could not rescan the linked folder.', 'error');
  }
}

export async function linkFolder(): Promise<void> {
  const activeProject = store().activeProject();
  if (!activeProject) {
    store().showToast('Open a project first.');
    return;
  }

  if (!isTauri()) {
    store().showToast('Folder linking requires the desktop app.', 'info');
    return;
  }

  const selected = await openFolderDialog();
  if (!selected) return;

  try {
    const result = await tauriInvoke<ScanResult>('scan_project_folder', { folderPath: selected });
    const now = new Date().toISOString();

    store().updateProject(activeProject.id, {
      importantAssets: result.files.slice(0, 200),
      linkedFolder: { path: selected, scanHash: result.scan_hash, lastScannedAt: now },
      changelog: [
        ...activeProject.changelog,
        { timestamp: now, field: 'general', action: 'added', summary: 'Project folder linked and scanned', source: 'app' },
      ],
    });

    store().showToast('Folder linked and scanned.');
  } catch (err) {
    console.error('Link folder failed:', err);
    store().showToast('Could not scan that folder.', 'error');
  }
}

export async function importProjectFromFile(file: File): Promise<void> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const project = normalizeOldProject(parsed);

    project.id = project.name.replace(/\s+/g, '_').toLowerCase() + '_' + Date.now();

    const now = new Date().toISOString();
    project.changelog = [
      ...project.changelog,
      { timestamp: now, field: 'general', action: 'added', summary: `Imported from file: ${file.name}`, source: 'app' },
    ];

    await saveToDisk(project);
    store().addProject(project);
    store().setActiveProject(project.id);
    store().showToast(`"${project.name}" imported.`);
  } catch (err) {
    console.error('Import failed:', err);
    store().showToast('Could not import that file. Make sure it is a valid Project Brain file.', 'error');
  }
}

export async function deleteProject(id: string): Promise<void> {
  const projects = store().projects;
  const project = projects.find((p) => p.id === id);
  if (!project) return;

  const fileName = `${project.name.replace(/ /g, '_')}.json`;

  try {
    if (isTauri()) {
      await tauriInvoke('delete_project_file', { fileName });
    } else {
      browserStore.delete(fileName);
    }
    store().removeProject(id);
    store().showToast(`"${project.name}" was removed.`);
  } catch (err) {
    console.error('Delete failed:', err);
    store().showToast('Could not remove that project.', 'error');
  }
}

export async function getProjectsPath(): Promise<string> {
  if (!isTauri()) {
    return 'Browser storage (localStorage)';
  }
  try {
    return await tauriInvoke<string>('get_projects_path');
  } catch {
    return 'Unknown';
  }
}

export async function copyExportToClipboard(exportText: string, platform: Platform): Promise<void> {
  try {
    await navigator.clipboard.writeText(exportText);

    const LABELS: Record<Platform, string> = {
      chatgpt: 'ChatGPT', claude: 'Claude', grok: 'Grok', perplexity: 'Perplexity', gemini: 'Gemini',
    };

    const activeProject = store().activeProject();
    if (activeProject) {
      const now = new Date().toISOString();
      const stateHash = hashProjectState(activeProject);
      const existing = activeProject.platformState[platform] || {};
      const exportCount = (existing.exportCount || 0) + 1;

      store().updateProject(activeProject.id, {
        platformState: {
          ...activeProject.platformState,
          [platform]: {
            ...existing,
            lastExportedAt: now,
            lastExportHash: stateHash,
            exportCount,
          },
        },
      });
    }

    store().showToast(`Copied! Paste into ${LABELS[platform]} to continue.`);
  } catch {
    store().showToast('Could not copy to clipboard.', 'error');
  }
}
