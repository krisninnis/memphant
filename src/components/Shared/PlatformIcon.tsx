import type { Platform } from '../../types/project-brain-types';
import { PLATFORM_CONFIG } from '../../utils/platformConfig';

interface PlatformIconProps {
  platform: Platform;
  size?: number;
}

export function PlatformIcon({ platform, size = 16 }: PlatformIconProps) {
  const config = PLATFORM_CONFIG[platform];
  return (
    <span
      style={{ fontSize: size, lineHeight: 1 }}
      role="img"
      aria-label={config.name}
    >
      {config.icon}
    </span>
  );
}

export default PlatformIcon;
