import type {
  AIPlatformConfig,
  AppSettings,
  BuiltInPlatformId,
  CustomPlatformConfig,
  Platform,
} from '../types/memphant-types';

const BUILT_IN_PLATFORMS: ReadonlyArray<Omit<AIPlatformConfig, 'enabled'>> = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    category: 'chat',
    exportStyle: 'structured',
    promptPrefix: 'Use this structured project context as the source of truth for your reply.',
    builtIn: true,
    icon: '🤖',
    color: '#10a37f',
    description: 'Balanced project handoff for general coding and planning.',
  },
  {
    id: 'claude',
    name: 'Claude',
    category: 'chat',
    exportStyle: 'structured',
    promptPrefix: 'Use this structured project context carefully and preserve project continuity.',
    builtIn: true,
    icon: '🎯',
    color: '#d97706',
    description: 'Structured handoff tuned for long-form collaboration.',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    category: 'chat',
    exportStyle: 'structured',
    promptPrefix: 'Use this project brief to answer clearly and stay aligned with the project state.',
    builtIn: true,
    icon: '✨',
    color: '#8b5cf6',
    description: 'Structured context for research, writing, and coding help.',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    category: 'chat',
    exportStyle: 'compact',
    promptPrefix: 'Use this project brief to research and answer with cited, practical guidance.',
    builtIn: true,
    icon: '🔍',
    color: '#20808d',
    description: 'Compact research-oriented handoff.',
  },
  {
    id: 'grok',
    name: 'Grok',
    category: 'chat',
    exportStyle: 'compact',
    promptPrefix: 'Use this concise project snapshot and focus on the active task.',
    builtIn: true,
    icon: '⚡',
    color: '#1d9bf0',
    description: 'Fast, concise handoff for short sessions.',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    category: 'dev',
    exportStyle: 'code-heavy',
    promptPrefix: 'Use this project state for code-focused implementation inside the IDE.',
    builtIn: true,
    icon: '⌨️',
    color: '#4f46e5',
    description: 'Code-heavy context for IDE copilots.',
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    category: 'dev',
    exportStyle: 'code-heavy',
    promptPrefix: 'Use this project state as a code-focused brief and keep suggestions aligned to the repo.',
    builtIn: true,
    icon: '🐙',
    color: '#6366f1',
    description: 'Code-heavy handoff for Copilot chat.',
  },
  {
    id: 'phind',
    name: 'Phind',
    category: 'dev',
    exportStyle: 'code-heavy',
    promptPrefix: 'Use this coding brief and prioritize implementation details and developer ergonomics.',
    builtIn: true,
    icon: '🧠',
    color: '#2563eb',
    description: 'Developer-focused brief for code help.',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    category: 'local',
    exportStyle: 'compact',
    promptPrefix: 'Use this local-model brief and keep the response efficient and grounded.',
    builtIn: true,
    icon: '🦙',
    color: '#059669',
    description: 'Compact export for local model sessions.',
  },
  {
    id: 'lm-studio',
    name: 'LM Studio',
    category: 'local',
    exportStyle: 'compact',
    promptPrefix: 'Use this local-model brief and respond efficiently while preserving key project context.',
    builtIn: true,
    icon: '🧪',
    color: '#0f766e',
    description: 'Compact export for local desktop model tools.',
  },
  {
    id: 'jan',
    name: 'Jan',
    category: 'local',
    exportStyle: 'compact',
    promptPrefix: 'Use this local-model brief and keep the answer concise, structured, and grounded.',
    builtIn: true,
    icon: '🪄',
    color: '#7c3aed',
    description: 'Compact export for local Jan chats.',
  },
  {
    id: 'localai',
    name: 'LocalAI',
    category: 'local',
    exportStyle: 'compact',
    promptPrefix: 'Use this local-model brief and keep the response focused on the active project state.',
    builtIn: true,
    icon: '🏠',
    color: '#0ea5e9',
    description: 'Compact export for self-hosted local AI tools.',
  },
  {
    id: 'anythingllm',
    name: 'AnythingLLM',
    category: 'local',
    exportStyle: 'compact',
    promptPrefix: 'Use this workspace brief and preserve the project structure in your reply.',
    builtIn: true,
    icon: '📚',
    color: '#9333ea',
    description: 'Compact export for workspace-style local AI tools.',
  },
];

const BUILT_IN_PLATFORM_MAP = new Map(
  BUILT_IN_PLATFORMS.map((platform) => [platform.id, platform]),
);

function withEnabledFlag(
  platform: Omit<AIPlatformConfig, 'enabled'>,
  enabled: boolean,
): AIPlatformConfig {
  return {
    ...platform,
    enabled,
  };
}

export function getBuiltInPlatforms(): AIPlatformConfig[] {
  return BUILT_IN_PLATFORMS.map((platform) => withEnabledFlag(platform, true));
}

export function getBuiltInPlatformIds(): BuiltInPlatformId[] {
  return BUILT_IN_PLATFORMS.map((platform) => platform.id as BuiltInPlatformId);
}

export function getBuiltInPlatform(platformId: Platform): AIPlatformConfig | null {
  const platform = BUILT_IN_PLATFORM_MAP.get(platformId);
  return platform ? withEnabledFlag(platform, true) : null;
}

export function createFallbackPlatformConfig(platformId: Platform): AIPlatformConfig {
  return {
    id: platformId,
    name: platformId,
    category: 'custom',
    exportStyle: 'structured',
    promptPrefix: 'Use this project context as a structured handoff and preserve the existing state.',
    enabled: true,
    builtIn: false,
    icon: '🧩',
    color: '#64748b',
    description: 'Custom AI platform',
  };
}

export function resolvePlatformRegistry(
  settingsPlatforms: AppSettings['platforms'],
): AIPlatformConfig[] {
  const enabledMap = settingsPlatforms.enabled ?? {};
  const customPlatforms = Array.isArray(settingsPlatforms.custom) ? settingsPlatforms.custom : [];

  const builtIns = BUILT_IN_PLATFORMS.map((platform) =>
    withEnabledFlag(platform, enabledMap[platform.id] ?? true),
  );

  const customs = customPlatforms.map((platform) => ({
    ...platform,
    builtIn: false,
    enabled: enabledMap[platform.id] ?? true,
    color: platform.color || '#64748b',
    icon: platform.icon || '🧩',
  }));

  return [...builtIns, ...customs].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    if (a.builtIn !== b.builtIn) return a.builtIn ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function getPlatformConfig(
  platformId: Platform,
  settingsPlatforms?: AppSettings['platforms'],
): AIPlatformConfig {
  if (settingsPlatforms) {
    const match = resolvePlatformRegistry(settingsPlatforms).find((platform) => platform.id === platformId);
    if (match) return match;
  }

  return getBuiltInPlatform(platformId) ?? createFallbackPlatformConfig(platformId);
}

export function getEnabledPlatforms(settingsPlatforms: AppSettings['platforms']): AIPlatformConfig[] {
  const registry = resolvePlatformRegistry(settingsPlatforms);
  return registry.filter((platform) => platform.enabled);
}

export function ensureValidPlatformId(
  platformId: Platform | undefined,
  settingsPlatforms: AppSettings['platforms'],
  fallback: Platform = 'claude',
): Platform {
  const enabledPlatforms = getEnabledPlatforms(settingsPlatforms);
  const registry = resolvePlatformRegistry(settingsPlatforms);

  if (platformId && enabledPlatforms.some((platform) => platform.id === platformId)) {
    return platformId;
  }

  return enabledPlatforms[0]?.id ?? registry[0]?.id ?? fallback;
}

export function makeCustomPlatformId(name: string): Platform {
  return `custom-${name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'platform'}`;
}

export function normaliseCustomPlatform(input: CustomPlatformConfig): CustomPlatformConfig {
  return {
    ...input,
    id: input.id.trim(),
    name: input.name.trim(),
    promptPrefix: input.promptPrefix.trim(),
    icon: input.icon?.trim() || undefined,
    color: input.color?.trim() || undefined,
  };
}
