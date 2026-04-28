import type { Platform, HandoffMode, LastAiSession } from '../types/memphant-types';
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

// -- Agent Handoff -------------------------------------------------------------

/**
 * Converts an ISO-8601 timestamp to a human-readable relative string.
 * e.g. "just now", "3 hours ago", "2 days ago", "1 week ago"
 */
export function humaniseTimeAgo(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime();
  const mins  = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days  = Math.floor(diffMs / 86_400_000);
  const weeks = Math.floor(days / 7);

  if (mins  <  1) return 'just now';
  if (mins  < 60) return `${mins} minute${mins   === 1 ? '' : 's'} ago`;
  if (hours < 24) return `${hours} hour${hours   === 1 ? '' : 's'} ago`;
  if (days  <  7) return `${days} day${days      === 1 ? '' : 's'} ago`;
                  return `${weeks} week${weeks    === 1 ? '' : 's'} ago`;
}

/**
 * Returns the output-contract instruction the next AI must satisfy.
 * Tied 1-to-1 to HandoffMode so contracts never drift from modes.
 */
export function getModeOutputContract(mode: HandoffMode): string {
  switch (mode) {
    case 'continue':
      return 'Pick up where the last session left off. End your reply with a memphant_update JSON block summarising any new decisions, next steps, or open questions that emerged.';
    case 'debug':
      return 'Focus on diagnosing the specific problem described. Return: 1. Suspected cause (one sentence) 2. Files inspected 3. Smallest safe fix 4. How to verify the fix 5. memphant_update JSON block.';
    case 'review':
      return 'Review the current project state critically. Return: 1. What looks solid 2. What looks risky 3. Missing context the previous AI lacked 4. Recommended next 2-3 steps 5. memphant_update JSON block.';
  }
}

/**
 * Builds a continuity preamble to prepend to an AI export.
 *
 * Tells the next AI: where the last session happened, how long ago,
 * what was being worked on, why the user is switching, which role to play,
 * and what output contract its reply must satisfy.
 *
 * Returns '' when session is undefined (first-ever export -- no preamble needed).
 */
export function buildContinuityPreamble(
  session: LastAiSession | undefined,
  targetPlatform: Platform,
): string {
  if (!session) return '';

  const sourceName = getPlatformVisual(session.platform).name;
  const targetName = getPlatformVisual(targetPlatform).name;
  const ago        = humaniseTimeAgo(session.sessionAt);

  const lines: string[] = [
    `--- Handoff from ${sourceName} (${ago}) ---`,
  ];

  if (session.userTaskSummary) {
    lines.push(`Last task: ${session.userTaskSummary}`);
  }

  if (session.userSwitchReason) {
    lines.push(`Switching to ${targetName} because: ${session.userSwitchReason}`);
  }

  if (session.filesChangedSince && session.filesChangedSince.length > 0) {
    lines.push(`Files changed since last session: ${session.filesChangedSince.join(', ')}`);
  }

  lines.push('');
  lines.push(`Your role: ${session.mode}. ${getModeOutputContract(session.mode)}`);
  lines.push('--- End handoff ---');
  lines.push('');

  return lines.join('\n');
}
