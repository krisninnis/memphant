/**
 * Known placeholder values from the memphant_update example contract.
 *
 * These are not user memory. They are instructional template strings that some
 * AIs may echo back verbatim inside JSON, so we filter exact/near-exact matches
 * before importing or exporting project memory.
 */

const PLACEHOLDER_PREFIXES = [
  'write 1 2 sentences describing what is true right now after this session',
  'write 2 4 sentences recapping exactly what happened in this session',
];

const PLACEHOLDER_EXACT_VALUES = new Set([
  'list only things actively being worked on right now not done not future',
  'list the immediate next actions that should happen after this session',
  'the single most important unresolved question or decision needed to move forward',
  'only include if a genuinely new goal emerged this session',
  'only include genuinely new decisions made this session',
  'why this decision was made',
]);

function normalizePlaceholderCandidate(value: string): string {
  return value
    .toLowerCase()
    .replace(/[—–-]/g, ' ')
    .replace(/[.,"'`:[\](){}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isMemphantPlaceholderValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;

  const normalized = normalizePlaceholderCandidate(value);
  if (!normalized) return false;

  return (
    PLACEHOLDER_EXACT_VALUES.has(normalized) ||
    PLACEHOLDER_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  );
}

export function removeMemphantPlaceholderStrings(items: string[]): string[] {
  return items.filter((item) => !isMemphantPlaceholderValue(item));
}

export function removeMemphantPlaceholderText(value: string | undefined | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  return isMemphantPlaceholderValue(value) ? undefined : value;
}
