/**
 * Auto-updater service — wraps tauri-plugin-updater.
 * Only runs inside the Tauri desktop app; no-ops in browser.
 *
 * Flow (mirrors iOS/Android):
 *  1. checkForUpdate()  → returns UpdateInfo if a newer version is on GitHub, else null
 *  2. downloadAndInstall(onProgress)  → downloads, shows 0–100%, installs silently
 *  3. After install: caller sets 'ready' state and shows "Restart to finish" prompt
 *  4. relaunch()  → closes and reopens the app with the new binary
 */

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UpdateInfo {
  version: string;
  body: string | null;  // release notes from GitHub
  date: string | null;  // ISO publish date
}

export type UpdateStatus =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'available'; info: UpdateInfo }
  | { type: 'up-to-date' }
  | { type: 'downloading'; percent: number }
  | { type: 'ready' }            // downloaded + installed, waiting for restart
  | { type: 'error'; message: string };

// ─── Version helpers ──────────────────────────────────────────────────────────

/**
 * Returns the version string from tauri.conf.json (e.g. "0.2.0").
 * Falls back to "—" if running in browser.
 */
export async function getInstalledVersion(): Promise<string> {
  if (!isTauri()) return '—';
  try {
    // @tauri-apps/api/app is part of @tauri-apps/api core — always available
    const { getVersion } = await import(/* @vite-ignore */ '@tauri-apps/api/app' as any);
    return (await getVersion()) as string;
  } catch {
    return '—';
  }
}

// ─── Update check ─────────────────────────────────────────────────────────────

/**
 * Check GitHub releases for a newer version.
 * Returns UpdateInfo if one is available, null if already up to date.
 * Throws on network / config errors.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri()) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updaterModule = await import(/* @vite-ignore */ '@tauri-apps/plugin-updater' as any);
  const update = await updaterModule.check();

  if (!update?.available) return null;

  return {
    version: (update.version as string) ?? 'unknown',
    body: (update.body as string | null | undefined) ?? null,
    date: (update.date as string | null | undefined) ?? null,
  };
}

// ─── Download + install ───────────────────────────────────────────────────────

/**
 * Download and silently install the available update.
 * Calls onProgress with 0–100 so the UI can show a progress bar.
 * Does NOT restart automatically — caller should show a "Restart" prompt
 * and call relaunch() when the user is ready.
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
    switch (event.event) {
      case 'Started':
        total = event.data.contentLength ?? 0;
        onProgress?.(0);
        break;
      case 'Progress':
        downloaded += event.data.chunkLength ?? 0;
        if (total > 0 && onProgress) {
          onProgress(Math.min(99, Math.round((downloaded / total) * 100)));
        }
        break;
      case 'Finished':
        onProgress?.(100);
        break;
    }
  });
}

// ─── Relaunch ─────────────────────────────────────────────────────────────────

/**
 * Close and reopen the app so the newly installed version takes effect.
 * Equivalent to pressing "Restart Now" on an iOS or Android update prompt.
 */
export async function relaunch(): Promise<void> {
  if (!isTauri()) return;
  try {
    // @tauri-apps/plugin-process provides relaunch()
    const processModule = await import(/* @vite-ignore */ '@tauri-apps/plugin-process' as any);
    await processModule.relaunch();
  } catch {
    // Plugin might not be registered — fall back to a hard reload
    window.location.reload();
  }
}
