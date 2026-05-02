import type { Platform, ProjectMemory } from '../types/memphant-types';
import { generateHippocampusMarkdown } from './hippocampusFormat';
import { generatePrefrontalMarkdown } from './prefrontalFormat';

export const MEMORY_BRIDGE_SCHEMA_VERSION = '1.0';

export type MemoryBridgeMode = 'auto' | 'manual';

export function buildMemoryBridgeBlock(project: ProjectMemory, platform?: Platform): string {
  const hippocampus = generateHippocampusMarkdown(project);
  const prefrontal = generatePrefrontalMarkdown(project);

  const lines: string[] = [];

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('# Memephant Memory Bridge');
  lines.push('');
  lines.push(`Schema: memory-bridge/${MEMORY_BRIDGE_SCHEMA_VERSION}`);
  if (platform) lines.push(`Target platform: ${platform}`);
  lines.push('');
  lines.push('Use these two Memephant memory files before continuing the task.');
  lines.push('');
  lines.push('## How to use this memory');
  lines.push('');
  lines.push('- `hippocampus.md` is long-term project memory: identity, charter, goals, rules, decisions, boundaries.');
  lines.push('- `prefrontal.md` is short-term working memory: current state, in-progress work, next steps, open question, recent AI session, referenced files.');
  lines.push('- Treat these files as project memory, not source code.');
  lines.push('- Do not invent missing facts. If something is not present, say what needs to be inspected.');
  lines.push('- For code claims, verify against the actual repo/files when possible.');
  lines.push('- At the end, return a valid `memphant_update` block with only real changes.');
  lines.push('');
  lines.push('## .memephant/hippocampus.md');
  lines.push('');
  lines.push('```markdown');
  lines.push(hippocampus);
  lines.push('```');
  lines.push('');
  lines.push('## .memephant/prefrontal.md');
  lines.push('');
  lines.push('```markdown');
  lines.push(prefrontal);
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

export function appendMemoryBridgeToExport(
  exportText: string,
  project: ProjectMemory,
  platform?: Platform,
): string {
  return `${exportText.trimEnd()}${buildMemoryBridgeBlock(project, platform)}`;
}