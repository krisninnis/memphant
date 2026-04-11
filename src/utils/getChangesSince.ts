import type { ProjectMemory } from '../types/memphant-types';

export function getChangesSince(
  project: ProjectMemory,
  since?: string
) {
  if (!since) return [];

  return project.changelog.filter(
    (entry) => new Date(entry.timestamp) > new Date(since)
  );
}