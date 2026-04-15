/**
 * Tests for exportFormatters.ts
 * Covers: secret sanitisation, platform formatting, smart export.
 */

import { formatForPlatform, setScannerLevel } from '../utils/exportFormatters';
import type { ProjectMemory } from '../types/memphant-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<ProjectMemory> = {}): ProjectMemory {
  return {
    schema_version: 1,
    id: 'test_project',
    name: 'My SaaS App',
    summary: 'A SaaS product for project context management.',
    goals: ['Launch MVP', 'Get first 10 customers'],
    rules: ['Ship fast', 'Talk to users weekly'],
    decisions: [
      { decision: 'Use Tauri for desktop', rationale: 'Small bundle, native performance' },
    ],
    currentState: 'Pre-launch. MVP is 80% done.',
    nextSteps: ['Set up Stripe', 'Write landing page copy'],
    openQuestions: ['What pricing model?'],
    importantAssets: ['src/main.ts', 'src/store.ts'],
    aiInstructions: 'Help me think like a product founder.',
    changelog: [
      {
        timestamp: new Date().toISOString(),
        field: 'general',
        action: 'added',
        summary: 'Project created',
        source: 'app',
      },
    ],
    checkpoints: [],
    platformState: {},
    ...overrides,
  };
}

// ─── Secret sanitisation ──────────────────────────────────────────────────────

describe('secret sanitisation', () => {
  beforeEach(() => setScannerLevel('standard'));

  it('redacts OpenAI API keys in summary', () => {
    const project = makeProject({ summary: 'Key: sk-AbCdEfGhIjKlMnOpQrStUv1234567890' });
    const output = formatForPlatform(project, 'claude');
    expect(output).not.toMatch(/sk-AbCdEfGhIjKlMnOpQrStUv/);
    expect(output).toContain('[REDACTED]');
  });

  it('redacts AWS access keys', () => {
    const project = makeProject({ currentState: 'Using AKIAIOSFODNN7EXAMPLE in prod' });
    const output = formatForPlatform(project, 'chatgpt');
    expect(output).not.toMatch(/AKIAIOSFODNN7EXAMPLE/);
    expect(output).toContain('[REDACTED]');
  });

  it('redacts GitHub tokens', () => {
    const project = makeProject({
      nextSteps: ['ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij is the token'],
    });
    const output = formatForPlatform(project, 'gemini');
    expect(output).not.toMatch(/ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ/);
  });

  it('redacts JWT tokens', () => {
    const project = makeProject({
      aiInstructions: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
    });
    const output = formatForPlatform(project, 'claude');
    expect(output).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/);
  });

  it('does not redact normal content', () => {
    const project = makeProject();
    const output = formatForPlatform(project, 'claude');
    expect(output).toContain('My SaaS App');
    expect(output).toContain('Launch MVP');
    expect(output).not.toContain('[REDACTED]');
  });

  it('strict mode redacts database connection strings', () => {
    setScannerLevel('strict');
    const project = makeProject({
      currentState: 'DB: postgres://user:pass@host:5432/mydb',
    });
    const output = formatForPlatform(project, 'claude');
    expect(output).not.toMatch(/postgres:\/\/user:pass/);
    expect(output).toContain('[REDACTED]');
    setScannerLevel('standard');
  });
});

// ─── Never includes linkedFolder path ─────────────────────────────────────────

describe('linkedFolder path exclusion', () => {
  it('never includes the linked folder path in any platform export', () => {
    const project = makeProject({
      linkedFolder: { path: '/Users/kris/secret/project-path', scanHash: 'abc', lastScannedAt: '' },
    });
    const platforms = ['claude', 'chatgpt', 'grok', 'perplexity', 'gemini'] as const;
    for (const platform of platforms) {
      const output = formatForPlatform(project, platform);
      expect(output).not.toContain('/Users/kris/secret/project-path');
    }
  });
});

// ─── Platform-specific formatting ─────────────────────────────────────────────

describe('claude format', () => {
  it('wraps content in XML tags', () => {
    const output = formatForPlatform(makeProject(), 'claude');
    expect(output).toContain('<project_context>');
    expect(output).toContain('</project_context>');
    expect(output).toContain('<name>');
    expect(output).toContain('<goals>');
  });

  it('includes the task when provided', () => {
    const output = formatForPlatform(makeProject(), 'claude', 'Write the onboarding copy');
    expect(output).toContain('Write the onboarding copy');
    expect(output).toContain('<task>');
  });

  it('includes AI instructions', () => {
    const output = formatForPlatform(makeProject(), 'claude');
    expect(output).toContain('Help me think like a product founder.');
  });

  it('includes the response format prompt', () => {
    const output = formatForPlatform(makeProject(), 'claude');
    expect(output).toContain('memphant_update');
  });
});

describe('chatgpt format', () => {
  it('uses markdown heading style', () => {
    const output = formatForPlatform(makeProject(), 'chatgpt');
    expect(output).toContain('# Project:');
    expect(output).toContain('## Goals');
    expect(output).toContain('## Current Status');
  });

  it('includes numbered goal list', () => {
    const output = formatForPlatform(makeProject(), 'chatgpt');
    expect(output).toContain('1. Launch MVP');
  });
});

describe('grok format', () => {
  it('produces non-empty output with project name', () => {
    const output = formatForPlatform(makeProject(), 'grok');
    expect(output.length).toBeGreaterThan(100);
    expect(output).toContain('My SaaS App');
  });
});

describe('perplexity format', () => {
  it('produces non-empty output with project name', () => {
    const output = formatForPlatform(makeProject(), 'perplexity');
    expect(output.length).toBeGreaterThan(100);
    expect(output).toContain('My SaaS App');
  });
});

describe('gemini format', () => {
  it('produces non-empty output with project name', () => {
    const output = formatForPlatform(makeProject(), 'gemini');
    expect(output.length).toBeGreaterThan(100);
    expect(output).toContain('My SaaS App');
  });
});

// ─── Export modes ─────────────────────────────────────────────────────────────

describe('delta mode', () => {
  it('is shorter than full mode', () => {
    const project = makeProject();
    const full = formatForPlatform(project, 'claude', undefined, 'full');
    const delta = formatForPlatform(project, 'claude', undefined, 'delta');
    expect(delta.length).toBeLessThan(full.length);
  });

  it('includes current state and next steps', () => {
    const output = formatForPlatform(makeProject(), 'claude', undefined, 'delta');
    expect(output).toContain('Pre-launch. MVP is 80% done.');
    expect(output).toContain('Set up Stripe');
  });
});

describe('specialist mode', () => {
  it('includes rules and decisions', () => {
    const output = formatForPlatform(makeProject(), 'claude', 'Design pricing page', 'specialist');
    expect(output).toContain('Ship fast');
    expect(output).toContain('Use Tauri for desktop');
    expect(output).toContain('Design pricing page');
  });
});

describe('smart mode', () => {
  it('produces output for a fresh project (nothing dropped)', () => {
    const project = makeProject();
    const output = formatForPlatform(project, 'claude', undefined, 'smart');
    expect(output).toContain('My SaaS App');
    expect(output).toContain('Launch MVP');
  });

  it('condenses a project with many old decisions', () => {
    const manyDecisions = Array.from({ length: 10 }, (_, i) => ({
      decision: `Old decision ${i + 1}`,
      rationale: 'Outdated',
    }));
    const project = makeProject({ decisions: manyDecisions });
    const smart = formatForPlatform(project, 'claude', undefined, 'smart');
    const full = formatForPlatform(project, 'claude', undefined, 'full');
    // Smart should include a condensed notice and be shorter
    expect(smart).toContain('[Smart Export');
    expect(smart.length).toBeLessThan(full.length);
  });

  it('does not include condensed notice for a small project', () => {
    const project = makeProject();
    const output = formatForPlatform(project, 'claude', undefined, 'smart');
    // Small project: nothing to condense, no header shown
    expect(output).not.toContain('[Smart Export');
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles a project with all empty fields gracefully', () => {
    const project = makeProject({
      summary: '',
      currentState: '',
      goals: [],
      rules: [],
      decisions: [],
      nextSteps: [],
      openQuestions: [],
      importantAssets: [],
      aiInstructions: '',
    });
    const platforms = ['claude', 'chatgpt', 'grok', 'perplexity', 'gemini'] as const;
    for (const platform of platforms) {
      expect(() => formatForPlatform(project, platform)).not.toThrow();
    }
  });

  it('handles a project name with special characters', () => {
    const project = makeProject({ name: '<script>alert("xss")</script>' });
    const output = formatForPlatform(project, 'claude');
    // Output should not break (will sanitize inline)
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('handles a very long summary without crashing', () => {
    const project = makeProject({ summary: 'A'.repeat(5000) });
    expect(() => formatForPlatform(project, 'claude')).not.toThrow();
  });
});
