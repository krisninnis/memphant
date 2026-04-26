import { formatForPlatform } from '../utils/exportFormatters';
import type { Platform, ProjectMemory } from '../types/memphant-types';
import { SCHEMA_VERSION } from '../types/memphant-types';

const sensitivePath = 'C:\\Users\\thoma\\sensitive-project';

const mockProject: ProjectMemory = {
  schema_version: SCHEMA_VERSION,
  id: 'test_project',
  name: 'Test Project',
  updatedAt: new Date().toISOString(),
  summary: 'Test summary',
  goals: [],
  decisions: [],
  rules: [],
  currentState: 'Testing export safety',
  nextSteps: [],
  openQuestions: [],
  importantAssets: [],
  aiInstructions: '',
  checkpoints: [],
  restorePoints: [],
  changelog: [],
  platformState: {},
  linkedFolder: {
    path: sensitivePath,
    scanHash: 'abc123',
    lastScannedAt: new Date().toISOString(),
  },
};

const platforms: Platform[] = ['chatgpt', 'claude', 'grok', 'perplexity', 'gemini'];

describe('export security — no folder path leak', () => {
  platforms.forEach((platform) => {
    it('does not leak linkedFolder.path in ' + platform + ' export', () => {
      const output = formatForPlatform(mockProject, platform);
      expect(output).not.toContain(sensitivePath);
    });
  });
});
