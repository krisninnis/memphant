import type { Platform } from '../types/project-brain-types';

export const PLATFORM_CONFIG: Record<Platform, { name: string; color: string; icon: string }> = {
  chatgpt: { name: 'ChatGPT', color: '#10a37f', icon: '🤖' },
  claude:  { name: 'Claude',  color: '#d97706', icon: '🧠' },
  grok:    { name: 'Grok',    color: '#1d9bf0', icon: '⚡' },
  perplexity: { name: 'Perplexity', color: '#20808d', icon: '🔍' },
  gemini:  { name: 'Gemini',  color: '#8b5cf6', icon: '✨' },
};
