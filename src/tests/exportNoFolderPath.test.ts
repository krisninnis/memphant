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

// -- Constants ----------------------------------------------------------------

const SENSITIVE_PATH = 'C:\\Users\\thoma\\sensitive\\path';

/** Matches any absolute path fragment that should never appear in AI exports. */
const ABS_PATH_RE = /[A-Za-z]:\\|\/Users\/|\/home\//;

// -- Helpers ------------------------------------------------------------------

function buildProject(): ProjectMemory {
  return {
    schema_version: SCHEMA_VERSION,
    id: 'leak-test-001',
    name: 'Leak Test Project',
    updatedAt: new Date().toISOString(),
    summary: 'A project used to verify that folder paths never escape into exports.',
    goals: ['Ship safely', 'Keep secrets secret'],
    decisions: [
      { decision: 'Use TypeScript', rationale: 'Type safety across the board' },
    ],
    rules: ['Never expose local paths'],
    currentState: 'Running export leak tests',
    nextSteps: ['Confirm all formatters are clean'],
    openQuestions: ['Any other fields we should sanitise?'],
    importantAssets: ['src/index.ts', 'README.md'],
    aiInstructions: 'Be concise and stay on-task.',
    checkpoints: [],
    restorePoints: [],
    changelog: [],
    platformState: {},
    linkedFolder: {
      path: SENSITIVE_PATH,
      scanHash: 'deadbeef',
      lastScannedAt: new Date().toISOString(),
    },
  };
}

function assertNoLeak(output: string, label: string): void {
  // 1. The exact sensitive path must not appear anywhere.
  expect(output).not.toContain(SENSITIVE_PATH);

  // 2. No absolute path pattern of any kind may appear.
  //    This catches partial leaks (e.g. just the drive letter + backslash).
  if (ABS_PATH_RE.test(output)) {
    // Surface the offending snippet to make failures easy to diagnose.
    const match = ABS_PATH_RE.exec(output);
    const idx = match ? match.index : 0;
    const snippet = output.slice(Math.max(0, idx - 30), idx + 60);
    throw new Error(
      `[${label}] Absolute path pattern found near: ...${snippet}...`,
    );
  }
}

// -- Named platform x all modes -----------------------------------------------

const NAMED_PLATFORMS: Platform[] = [
  'chatgpt',
  'claude',
  'grok',
  'perplexity',
  'gemini',
];

const ALL_MODES = ['full', 'delta', 'specialist', 'smart'] as const;

describe('exportFormatters - linkedFolder.path must never appear in output', () => {
  // Every named platform, full mode
  describe('formatForPlatform / named platforms / full mode', () => {
    NAMED_PLATFORMS.forEach((platform) => {
      it(`${platform} / full`, () => {
        const out = formatForPlatform(buildProject(), platform, undefined, 'full');
        assertNoLeak(out, `${platform}/full`);
      });
    });
  });

  // Claude x every mode (delta, specialist, smart all go through common paths)
  describe('formatForPlatform / claude / all modes', () => {
    ALL_MODES.forEach((mode) => {
      it(`claude / ${mode}`, () => {
        const out = formatForPlatform(buildProject(), 'claude', undefined, mode);
        assertNoLeak(out, `claude/${mode}`);
      });
    });
  });

  // ChatGPT x every mode
  describe('formatForPlatform / chatgpt / all modes', () => {
    ALL_MODES.forEach((mode) => {
      it(`chatgpt / ${mode}`, () => {
        const out = formatForPlatform(buildProject(), 'chatgpt', undefined, mode);
        assertNoLeak(out, `chatgpt/${mode}`);
      });
    });
  });

  // Generic / custom platforms (routed through formatGenericForPlatform)
  describe('formatForPlatform / generic platforms', () => {
    const GENERIC_PLATFORMS: Platform[] = ['cursor', 'github-copilot', 'ollama', 'lm-studio'];
    GENERIC_PLATFORMS.forEach((platform) => {
      it(`${platform} / full`, () => {
        const out = formatForPlatform(buildProject(), platform, undefined, 'full');
        assertNoLeak(out, `${platform}/full`);
      });
    });
  });

  // formatForClaudeWithManifest is a separate exported formatter
  describe('formatForClaudeWithManifest', () => {
    it('does not leak path in standard manifest export', () => {
      const out = formatForClaudeWithManifest(
        buildProject(),
        'state manifest content here',
        'digest-abc123',
      );
      assertNoLeak(out, 'claude/manifest');
    });

    it('does not leak path when a task and recentActivity are provided', () => {
      const out = formatForClaudeWithManifest(
        buildProject(),
        'manifest text',
        'digest-xyz',
        'Fix the authentication bug',
        'Recent activity log: nothing suspicious',
      );
      assertNoLeak(out, 'claude/manifest+task');
    });
  });

  // Regression: path must not leak even when other project fields look path-like
  describe('regression - path-like values in project fields do not smuggle the sensitive path', () => {
    it('relative asset paths do not trigger abs-path assertion', () => {
      // Relative paths are fine - only absolute paths are banned
      const project = buildProject();
      project.importantAssets = ['src/utils/exportFormatters.ts', 'public/index.html'];
      const out = formatForPlatform(project, 'claude', undefined, 'full');
      // Literal sensitive path must not appear
      expect(out).not.toContain(SENSITIVE_PATH);
    });

    it('does not leak for grok / all modes', () => {
      ALL_MODES.forEach((mode) => {
        const out = formatForPlatform(buildProject(), 'grok', undefined, mode);
        assertNoLeak(out, `grok/${mode}`);
      });
    });

    it('does not leak for perplexity / all modes', () => {
      ALL_MODES.forEach((mode) => {
        const out = formatForPlatform(buildProject(), 'perplexity', undefined, mode);
        assertNoLeak(out, `perplexity/${mode}`);
      });
    });

    it('does not leak for gemini / all modes', () => {
      ALL_MODES.forEach((mode) => {
        const out = formatForPlatform(buildProject(), 'gemini', undefined, mode);
        assertNoLeak(out, `gemini/${mode}`);
      });
    });
  });
});
