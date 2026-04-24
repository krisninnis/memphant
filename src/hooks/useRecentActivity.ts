import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useProjectStore } from '../store/projectStore';
import { isDesktopApp } from '../utils/runtime';

type RecentActivityState = {
  markdown: string;
  loading: boolean;
  error: string | null;
};

export function useRecentActivity(
  projectId: string,
  folderPath: string,
): RecentActivityState {
  const autoMemoryUpdateInterval = useProjectStore(
    (s) => s.settings.projects.autoMemoryUpdateInterval
  );
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const pollIntervalMs = {
    off: 0,
    '15min': 900_000,
    '30min': 1_800_000,
    '1hour': 3_600_000,
  }[autoMemoryUpdateInterval] ?? 1_800_000;

  useEffect(() => {
    const trimmedFolderPath = folderPath.trim();
    const trimmedProjectId = projectId.trim();

    if (!trimmedFolderPath || autoMemoryUpdateInterval === 'off') {
      requestIdRef.current += 1;
      setMarkdown('');
      setLoading(false);
      setError(null);
      return;
    }

    if (!isDesktopApp()) {
      requestIdRef.current += 1;
      setMarkdown('');
      setLoading(false);
      setError(null);
      return;
    }

    let disposed = false;
    let initialLoadTimeoutId: number | null = null;

    const loadRecentActivity = async () => {
      const requestId = ++requestIdRef.current;
      setLoading(true);

      try {
        const nextMarkdown = await invoke<string>('get_recent_activity', {
          projectId: trimmedProjectId,
          folderPath: trimmedFolderPath,
        });

        if (disposed || requestId !== requestIdRef.current) {
          return;
        }

        setMarkdown(nextMarkdown);
        setError(null);
      } catch (err) {
        if (disposed || requestId !== requestIdRef.current) {
          return;
        }

        console.error('[useRecentActivity] invoke failed:', err);
        const message = err instanceof Error ? err.message : String(err);
        setMarkdown('');
        setError(message);
      } finally {
        if (!disposed && requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    };

    initialLoadTimeoutId = window.setTimeout(() => {
      void loadRecentActivity();
    }, 5000);
    const intervalId = window.setInterval(() => {
      void loadRecentActivity();
    }, pollIntervalMs);

    return () => {
      disposed = true;
      if (initialLoadTimeoutId !== null) {
        window.clearTimeout(initialLoadTimeoutId);
      }
      window.clearInterval(intervalId);
    };
  }, [projectId, folderPath, autoMemoryUpdateInterval, pollIntervalMs]);

  return { markdown, loading, error };
}

