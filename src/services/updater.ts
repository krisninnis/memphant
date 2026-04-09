/**
 * Auto-updater service — wraps tauri-plugin-updater.
 * Only runs inside the Tauri desktop app; no-ops in browser.
 */

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export interface UpdateInfo {
  version: string;
  body: string | null;
}

export type UpdateStatus =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'available'; info: UpdateInfo }
  | { type: 'up-to-date' }
  | { type: 'downloading'; percent: number }
  | { type: 'ready' }
  | { type: 'error'; message: string };

/**
 * Check for an available update.
 * Returns update info if one exists, or null if already up to date.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri()) return null;

  try {
    // /* @vite-ignore */ stops Vite's static import analysis on this path.
    // The package must be installed: npm install @tauri-apps/plugin-updater
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updaterModule = await import(/* @vite-ignore */ '@tauri-apps/plugin-updater' as any);
    const update = await updaterModule.check();
    if (!update?.available) return null;

    return {
      version: update.version as string,
      body: (update.body as string | undefined) ?? null,
    };
  } catch (err) {
    console.warn('[Updater] Check failed:', err);
    return null;
  }
}

/**
 * Download and install an available update.
 * Calls onProgress with 0–100 during download.
 * App will restart automatically after install.
 */
export async function downloadAndInstall(
  onProgress?: (percent: number) => void,
): Promise<void> {
  if (!isTauri()) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updaterModule = await import(/* @vite-ignore */ '@tauri-apps/plugin-updater' as any);
  const update = await updaterModule.check();
  if (!update?.available) return;

  let downloaded = 0;
  let total = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await update.downloadAndInstall((event: any) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? 0;
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      if (total > 0 && onProgress) {
        onProgress(Math.round((downloaded / total) * 100));
      }
    }
  });
}
