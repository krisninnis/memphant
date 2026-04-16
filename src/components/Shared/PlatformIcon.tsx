import type { Platform } from '../../types/memphant-types';
import { useProjectStore } from '../../store/projectStore';
import { getPlatformConfig } from '../../utils/platformRegistry';

interface PlatformIconProps {
  platform: Platform;
  size?: number;
}

export function PlatformIcon({ platform, size = 16 }: PlatformIconProps) {
  const settingsPlatforms = useProjectStore((s) => s.settings.platforms);
  const config = getPlatformConfig(platform, settingsPlatforms);
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
