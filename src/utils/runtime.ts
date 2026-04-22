import { isTauri } from '@tauri-apps/api/core';

export function isDesktopApp(): boolean {
  // Prefer Tauri's supported runtime detector, but keep the legacy internal
  // global as a fallback so older desktop builds still identify correctly.
  return isTauri() || (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);
}

export function isBrowserApp(): boolean {
  return !isDesktopApp();
}
