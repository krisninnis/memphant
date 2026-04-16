import type { Platform } from '../types/memphant-types';
import { getBuiltInPlatforms } from './platformRegistry';

export const PLATFORM_CONFIG: Record<string, { name: string; color: string; icon: string }> =
  Object.fromEntries(
    getBuiltInPlatforms().map((platform) => [
      platform.id,
      {
        name: platform.name,
        color: platform.color ?? '#64748b',
        icon: platform.icon ?? '🧩',
      },
    ]),
  );

export function getPlatformVisual(platformId: Platform): { name: string; color: string; icon: string } {
  return (
    PLATFORM_CONFIG[platformId] ?? {
      name: platformId,
      color: '#64748b',
      icon: '🧩',
    }
  );
}
