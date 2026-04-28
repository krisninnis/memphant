/**
 * Pre-flight security test: verify that linkedFolder.path never leaks
 * into any export formatter output.
 *
 * Requirements:
 *   - Every exported formatter is exercised.
 *   - A minimal project with a known sensitive linkedFolder.path is used.
 *   - The literal path must not appear in any output.
 *   - No absolute path pattern (/[A-Za-z]:\\|\/Users\/|\/home\//) may appear.
 *
 * Run: pnpm exec jest exportNoFolderPath
 */
import {
  formatForPlatform,
  formatForClaudeWithManifest,
} from '../utils/exportFormatters';
import type { Platform, ProjectMemory } from '../types/memphant-types';
import { SCHEMA_VERSION } from '../types/memphant-types';

// ── Constants ────────────────────────────────────────────────────────────────

const SENSITIVE_PATH = 'C:\\Users\\thoma\\sensitive\\path';

/** Matches any absolute path fragment that should never appear in AI exports. */
const ABS_PATH_RE = /[A-Za-z]:\\|\/Users\/|\/home\//;

// ── Helpers ───────────────────────────────────�