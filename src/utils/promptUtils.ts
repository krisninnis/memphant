/**
 * promptUtils.ts
 *
 * Pure utility functions for prompt compression and splitting.
 * No side effects — callers handle state updates and clipboard.
 */

// ─── Compress ──────────────────────────────────────────────────────────────

/**
 * Common filler phrases that can be stripped from the start or end
 * of a user prompt without changing its meaning.
 */
const LEADING_FILLERS: RegExp[] = [
  /^please\s+/i,
  /^can you\s+/i,
  /^could you\s+/i,
  /^would you\s+/i,
  /^i want you to\s+/i,
  /^i need you to\s+/i,
  /^i'd like you to\s+/i,
  /^i would like you to\s+/i,
  /^help me\s+/i,
  /^can you please\s+/i,
  /^could you please\s+/i,
];

const TRAILING_FILLERS: RegExp[] = [
  /[,\s]+please\.?$/i,
  /[,\s]+thanks\.?$/i,
  /[,\s]+thank you\.?$/i,
];

/**
 * Strip filler words from a prompt and return the condensed version.
 *
 * Returns the original text unchanged if compression yields an empty string
 * or only whitespace (safety net so the input is never wiped by mistake).
 */
export function compressPrompt(text: string): string {
  if (!text.trim()) return text;

  let out = text.trim();

  // Loop until no more leading fillers can be stripped
  // (handles stacked phrases like "could you please …")
  let prevOut: string;
  do {
    prevOut = out;
    for (const pattern of LEADING_FILLERS) {
      out = out.replace(pattern, '');
      out = out.trimStart();
    }
  } while (out !== prevOut);

  for (const pattern of TRAILING_FILLERS) {
    out = out.replace(pattern, '');
    out = out.trimEnd();
  }

  // Collapse internal runs of whitespace
  out = out.replace(/\s{2,}/g, ' ').trim();

  // Capitalise the first character only when something was stripped
  const changed = out !== text.trim();
  if (changed && out.length > 0) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }

  // Fall back to original if we accidentally emptied the string
  return out.length > 0 ? out : text.trim();
}

// ─── Split ─────────────────────────────────────────────────────────────────

/**
 * Split a prompt into two parts at a natural boundary near the midpoint.
 *
 * Priority of split points (highest to lowest):
 *   1. Sentence boundary (.  !  ?) nearest the midpoint
 *   2. Clause boundary (,  ;) nearest the midpoint
 *   3. Word boundary nearest the midpoint
 *
 * When `maxChars` is provided, Part 1 is capped at that character count.
 * Returns [part1, part2].  part2 is empty string if the text is too short.
 */
export function splitPrompt(text: string, maxChars?: number): [string, string] {
  if (!text.trim()) return [text, ''];

  const trimmed = text.trim();

  // Nothing useful to split
  if (trimmed.split(/\s+/).length < 4) return [trimmed, ''];

  const cap = maxChars !== undefined ? Math.min(maxChars, trimmed.length) : trimmed.length;
  const midpoint = Math.floor(Math.min(cap, trimmed.length) / 2);

  // 1. Sentence boundary
  {
    const re = /[.!?]\s+/g;
    let best = -1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(trimmed)) !== null) {
      const end = m.index + m[0].length;
      if (end - 1 <= midpoint + 20) best = end;
      else break;
    }
    if (best > 0 && best < trimmed.length) {
      return [trimmed.slice(0, best).trim(), trimmed.slice(best).trim()];
    }
  }

  // 2. Clause boundary
  {
    const re = /[,;]\s+/g;
    let best = -1;
    let m: RegExpExecArray | null;
    while ((m = re.exec(trimmed)) !== null) {
      const end = m.index + m[0].length;
      if (end - 1 <= midpoint + 20) best = end;
      else break;
    }
    if (best > 0 && best < trimmed.length) {
      return [trimmed.slice(0, best).trim(), trimmed.slice(best).trim()];
    }
  }

  // 3. Word boundary
  {
    const words = trimmed.split(' ');
    let chars = 0;
    let splitAt = Math.ceil(words.length / 2);
    for (let i = 0; i < words.length; i++) {
      chars += words[i].length + 1;
      if (chars > midpoint) {
        splitAt = i + 1;
        break;
      }
    }
    const part1 = words.slice(0, splitAt).join(' ').trim();
    const part2 = words.slice(splitAt).join(' ').trim();
    if (!part2) return [part1, ''];
    return [part1, part2];
  }
}
