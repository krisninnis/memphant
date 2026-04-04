/**
 * Stable hook for reading the active project.
 *
 * NEVER call s.activeProject() inside a useProjectStore selector —
 * Zustand v5 requires selector functions to return a cached/stable reference.
 * Calling any method that creates a new object/array every time causes the
 * "getSnapshot should be cached" infinite-loop error.
 *
 * This hook reads the two primitive values (activeProjectId + projects array)
 * using separate stable selectors, then derives the active project with useMemo
 * so the reference only changes when the project itself changes.
 */
import { useMemo } from 'react';
import { useProjectStore } from '../store/projectStore';
import type { ProjectMemory } from '../types/project-brain-types';

export function useActiveProject(): ProjectMemory | null {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const projects = useProjectStore((s) => s.projects);
  return useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );
}

/** Stable hook for the list of enabled platforms (avoids new-array-every-render). */
export function useEnabledPlatforms() {
  const enabled = useProjectStore((s) => s.settings.platforms.enabled);
  return useMemo(
    () => (Object.keys(enabled) as Array<keyof typeof enabled>).filter((p) => enabled[p]),
    [enabled]
  );
}
