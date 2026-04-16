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

function joinParts(...parts: string[]): string {
  return parts.join('');
}

// Build secret-like strings at runtime so GitHub push protection
// does not flag the repository contents themselves.
function makeOpenAiKey(): string {
  return joinParts('sk-', 'AbCdEfGhIjKlMnOpQrStUv1234567890');
}

function makeAnthropicKey(): string {
  return joinParts(
    'sk-ant-api03-',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz012345',
  );
}

function makeGitHubToken(): string {
  return joinParts('ghp_', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
}

function makeJwtToken(): string {
  return joinParts('eyJ', 'hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig');
}

function makeStripeLiveKey(): string {
  return joinParts('sk', '_live_', '1234567890abcdefghijklmnop');
}

function makeGoogleApiKey(): string {
  return joinParts('AIza', 'SyABCDEFGHIJKLMNOPQRSTUVWXYZ12345678');
}

function makeHuggingFaceToken(): string {
  return joinParts('hf_', '1234567890abcdefghijklmnopqrstuv');
}

function makeSlackUserToken(): string {
  return joinParts('xoxp-', '123456789012-123456789012-abcdefghijklmnop');
}

function makeSendGridKey(): string {
  return joinParts(
    'SG.',
    'ABCDEFGHIJKLMNOPQRSTU',
    '.',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopq',
  );
}

// ─── Secret sanitisation ──────────────────────────────────────────────────────

describe('secret sanitisation', () => {
  beforeEach(() => setScannerLevel('standard'));

  it('redacts OpenAI API keys in summary', () => {
    const secret = makeOpenAiKey();
    const project = makeProject({ summary: `Key: ${secret}` });
    const output = formatForPlatform(project, 'claude');
    expect(output).not.toContain(secret);
    expect(output).toContain('[REDACTED]');
  });

  it('redacts AWS access keys', () => {
    const secret = 'AKIAIOSFODNN7EXAMPLE';
    const project = makeProject({ currentState: `Using ${secret} in prod` });
    const output = formatForPlatform(project, 'chatgpt');
    expect(output).not.toContain(secret);
    expect(output).toContain('[REDACTED]');
  });

  it('redacts GitHub tokens', () => {
    const secret = makeGitHubToken();
    const project = makeProject({
      nextSteps: [`${secret} is the token`],
    });
    const output = formatForPlatform(project, 'gemini');
    expect(output).not.toContain(secret);
    expect(output).toContain('[REDACTED]');
  });

  it('redacts JWT tokens', () => {
    const secret = makeJwtToken();
    const project = makeProject({
      aiInstructions: `Bearer ${secret}`,
    });
    const output = formatForPlatform(project, 'claude');
    expect(output).not.toContain(secret);
    expect(output).toContain('[REDACTED]');
  });

  it('does not redact normal content', () => {
    const project = makeProject();
    const output = formatForPlatform(project, 'claude');
    expect(output).toContain('My SaaS App');
    expect(output).toContain('Launch MVP');
    expect(output).not.toContain('[REDACTED]');
  });

  it('redacts Anthropic API keys', () => {
    const secret = makeAnthropicKey();
    const project = makeProject({
      summary: `Key is ${secret}`,
    });
    const output = formatForPlatform(project, 'claude');
    expect(output).not.toContain(secret);
    expect(output).toContain('[REDACTED]');
  });

  it('redacts Stripe live secret keys', () => {
    const secret = makeStripeLiveKey();
    const project = makeProject({
      currentState: `Stripe key: ${secret}`,
    });
    const output = formatForPlatform(project, 'chatgpt');
    expect(output).not.toContain(secret);
    expect(output).toContain('[REDACTED]');
  });

  it('redacts Google API keys', () => {
    const secret = makeGoogleApiKey();
    const project = makeProject({
      aiInstructions: `Use ${secret} for Maps`,
    });
    const output = formatForPlatform(project, 'gemini');
    expect(output).not.toContain(secret);
    expect(output).toContain('[REDACTED]');
  });

  it('redacts HuggingFace tokens', () => {
    const secret = makeHuggingFaceToken();
    const project = makeProject({
      currentState: `HF token: ${secret}`,
    });
    const output = formatForPlatform(project, 'claude');
    expect(output).not.toContain(secret);
    expect(output).toContain('[REDACTED]');
  });

  it('redacts Slack user tokens', () => {
    const secret = makeSlackUserToken();
    const project = makeProject({
      currentState: `Slack user token: ${secret}`,
    });
    const output = formatForPlatform(project, 'claude');
    expect(output).not.toContain(secret);
    expect(output).toContain('[REDACTED]');
  });

  it('strict mode redacts database connection strings', () => {
    setScannerLevel('strict');
    const secret = 'postgres://user:pass@host:5432/mydb';
    const project = makeProject({
      currentState: `DB: ${secret}`,
    });
    const output = formatForPlatform(project, 'claude');
    expect(output).not.toContain(secret);
    expect(output).toContain('[REDACTED]');
    setScannerLevel('standard');
  });

  it('strict mode redacts SendGrid API keys', () => {
    setScannerLevel('strict');
    const secret = makeSendGridKey();
    const project = makeProject({
      currentState: secret,
    });
    const output = formatForPlatform(project, 'claude');
    expect(output).not.toContain(secret);
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

describe('custom platform format', () => {
  it('uses the selected platform config for custom platforms', () => {
    const output = formatForPlatform(
      makeProject(),
      'custom-team-ai',
      'Review the onboarding flow',
      'full',
      {
        id: 'custom-team-ai',
        name: 'Team AI',
        category: 'custom',
        exportStyle: 'code-heavy',
        promptPrefix: 'Use this team handoff and stay grounded in the project state.',
        enabled: true,
        builtIn: false,
        icon: '🧩',
        color: '#64748b',
      },
    );

    expect(output).toContain('Team AI project handoff');
    expect(output).toContain('Use this team handoff');
    expect(output).toContain('Review the onboarding flow');
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
    expect(smart).toContain('[Smart Export');
    expect(smart.length).toBeLessThan(full.length);
  });

  it('does not include condensed notice for a small project', () => {
    const project = makeProject();
    const output = formatForPlatform(project, 'claude', undefined, 'smart');
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
    expect(output).toBeDefined();
    expect(output.length).toBeGreaterThan(0);
  });

  it('handles a very long summary without crashing', () => {
    const project = makeProject({ summary: 'A'.repeat(5000) });
    expect(() => formatForPlatform(project, 'claude')).not.toThrow();
  });
});