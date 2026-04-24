import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isDesktopApp } from '../utils/runtime';

type RecentActivityState = {
  markdown: string;
  loading: boolean;
  error: string | null;
};

const POLL_INTERVAL_MS = 30_000;

export function useRecentActivity(
  projectId: string,
  folderPath: string,
): RecentActivityState {
  const [markdown, setMarkdown] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmedFolderPath = folderPath.trim();
    const trimmedProjectId = projectId.trim();

    if (!trimmedFolderPath) {
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

    const loadRecentActivity = async () => {
      const requestId = ++requestIdRef.current;
      setLoading(true);

      try {
        console.log('[useRecentActivity] calling get_recent_activity', {
          projectId: trimmedProjectId,
          folderPath: trimmedFolderPath,
        });
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

    void loadRecentActivity();
    const intervalId = window.setInterval(() => {
      void loadRecentActivity();
    }, POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [projectId, folderPath]);

  return { markdown, loading, error };
}

