/**
 * passportGenerator.test.ts
 *
 * Focused safety tests for generateContextPassport:
 *   1. All four formats are produced
 *   2. Secrets are redacted in every format
 *   3. linkedFolder.path never appears in any format
 *   4. No memphant_update / RESPONSE_FORMAT instructions appended
 *   5. Project data is never mutated
 *   6. Required sections are present in every format
 */

import { generateContextPassport } from '../utils/passportGenerator';
import type { ProjectMemory } from '../types/memphant-types';

// ─── Test Secret Builders ─────────────────────────────────────────────────────
// Build fake secret-looking values at runtime so GitHub push protection does not
// see literal tokens in the committed source. These are not real credentials.

const FAKE_OPENAI_KEY = ['sk', 'abcdefghijklmnopqrstuvwxyz123456'].join('-');
const FAKE_AWS_KEY = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');
const FAKE_GITHUB_TOKEN = ['ghp', 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij'].join('_');
const FAKE_SLACK_TOKEN = ['xoxb', '1234567890', 'abcdefghijklmnop'].join('-');
const FAKE_STRIPE_KEY = ['sk', 'live', 'ABCDEFGHIJKLMNOPQRSTUVWX'].join('_');
const FAKE_JWT = [
  ['eyJ', 'hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'].join(''),
  ['eyJ', 'zdWIiOiJ1c2VyMTIzIn0'].join(''),
  'sig',
].join('.');

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A realistic project containing secrets and a local path. */
const SECRET_PROJECT: ProjectMemory = {
  id: 'test-passport-001',
  name: 'Secret Test Project',
  summary: `OpenAI key ${FAKE_OPENAI_KEY} should be redacted.`,
  currentState: 'Stored locally at C:\\Users\\kris\\repos\\memphant',
  goals: [
    'Ship v2',
    `AWS key ${FAKE_AWS_KEY} must not leak`,
    `GitHub token ${FAKE_GITHUB_TOKEN} must not leak`,
  ],
  rules: ['Never commit secrets', `Slack ${FAKE_SLACK_TOKEN} to git`],
  decisions: [
    {
      decision: 'Use Supabase',
      rationale: `JWT ${FAKE_JWT} cheaper`,
    },
  ],
  importantAssets: ['C:\\Users\\kris\\repos\\memphant\\src\\App.tsx'],
  openQuestions: ['Which CI should we use?'],
  nextSteps: ['Deploy to prod'],
  changelog: [
    {
      field: 'goals',
      action: 'added',
      summary: 'Added shipping goal',
      timestamp: '2026-05-01T10:00:00Z',
    },
  ],
  linkedFolder: { path: 'C:\\Users\\kris\\repos\\memphant' },
  lastSessionSummary: `Reviewed ${FAKE_STRIPE_KEY} stripe key issues`,
  inProgress: ['Fixing the auth bug'],
  schema_version: '1.1.0',
  checkpoints: [],
  platformState: {},
};

/** A minimal project with no secrets and no linked folder. */
const CLEAN_PROJECT: ProjectMemory = {
  id: 'test-passport-002',
  name: 'Clean Project',
  summary: 'A project with no secrets.',
  currentState: 'Working on features',
  goals: ['Launch MVP'],
  rules: ['Keep it simple'],
  decisions: [{ decision: 'React frontend', rationale: 'Team knows it' }],
  importantAssets: [],
  openQuestions: [],
  nextSteps: ['Write docs'],
  changelog: [],
  inProgress: [],
  schema_version: '1.1.0',
  checkpoints: [],
  platformState: {},
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function allFormats(passport: ReturnType<typeof generateContextPassport>) {
  return Object.values(passport.formats) as string[];
}

function everyFormat(
  passport: ReturnType<typeof generateContextPassport>,
  predicate: (text: string) => boolean,
): boolean {
  return allFormats(passport).every(predicate);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('generateContextPassport — structure', () => {
  it('produces all four formats', () => {
    const passport = generateContextPassport(CLEAN_PROJECT);
    expect(passport.formats.markdown).toBeTruthy();
    expect(passport.formats.chatgpt).toBeTruthy();
    expect(passport.formats.claude).toBeTruthy();
    expect(passport.formats.codex).toBeTruthy();
  });

  it('includes the project name in every format', () => {
    const passport = generateContextPassport(CLEAN_PROJECT);
    expect(everyFormat(passport, (t) => t.includes('Clean Project'))).toBe(true);
  });

  it('includes projectId and projectName at the top level', () => {
    const passport = generateContextPassport(CLEAN_PROJECT);
    expect(passport.projectId).toBe('test-passport-002');
    expect(passport.projectName).toBe('Clean Project');
  });

  it('includes generatedAt timestamp', () => {
    const passport = generateContextPassport(CLEAN_PROJECT);
    expect(passport.generatedAt).toBeTruthy();
    expect(typeof passport.generatedAt).toBe('string');
  });

  it('includes required sections in Markdown format', () => {
    const passport = generateContextPassport(CLEAN_PROJECT);
    const md = passport.formats.markdown;
    expect(md).toContain('## Purpose');
    expect(md).toContain('## Current State');
    expect(md).toContain('## Goals');
    expect(md).toContain('## Rules to Follow');
  });

  it('includes required sections in Claude XML format', () => {
    const passport = generateContextPassport(CLEAN_PROJECT);
    const claude = passport.formats.claude;
    expect(claude).toContain('<context_passport>');
    expect(claude).toContain('</context_passport>');
    expect(claude).toContain('<purpose>');
    expect(claude).toContain('<goals>');
    expect(claude).toContain('<rules>');
  });

  it('includes required sections in Codex format', () => {
    const passport = generateContextPassport(CLEAN_PROJECT);
    const codex = passport.formats.codex;
    expect(codex).toContain('STATUS:');
    expect(codex).toContain('GOALS:');
    expect(codex).toContain('RULES:');
  });

  it('includes changelog entries when present', () => {
    const passport = generateContextPassport(SECRET_PROJECT);
    expect(everyFormat(passport, (t) => t.includes('2026-05-01'))).toBe(true);
  });

  it('includes inProgress items when present', () => {
    const passport = generateContextPassport(SECRET_PROJECT);
    expect(everyFormat(passport, (t) => t.includes('Fixing the auth bug'))).toBe(true);
  });
});

describe('generateContextPassport — secret redaction', () => {
  let passport: ReturnType<typeof generateContextPassport>;

  beforeEach(() => {
    passport = generateContextPassport(SECRET_PROJECT);
  });

  it('redacts OpenAI sk- keys in all formats', () => {
    expect(everyFormat(passport, (t) => !t.includes(FAKE_OPENAI_KEY))).toBe(true);
  });

  it('redacts AWS AKIA keys in all formats', () => {
    expect(everyFormat(passport, (t) => !t.includes(FAKE_AWS_KEY))).toBe(true);
  });

  it('redacts GitHub ghp_ tokens in all formats', () => {
    expect(everyFormat(passport, (t) => !t.includes(FAKE_GITHUB_TOKEN))).toBe(true);
  });

  it('redacts Slack xoxb tokens in all formats', () => {
    expect(everyFormat(passport, (t) => !t.includes(FAKE_SLACK_TOKEN))).toBe(true);
  });

  it('redacts Stripe sk_live_ keys in all formats', () => {
    expect(everyFormat(passport, (t) => !t.includes(FAKE_STRIPE_KEY))).toBe(true);
  });

  it('redacts JWT-like values in all formats', () => {
    expect(everyFormat(passport, (t) => !t.includes(FAKE_JWT))).toBe(true);
  });

  it('replaces secrets with [REDACTED] placeholder in all formats', () => {
    expect(everyFormat(passport, (t) => t.includes('[REDACTED]'))).toBe(true);
  });
});

describe('generateContextPassport — local path exclusion', () => {
  it('never includes linkedFolder.path in any format', () => {
    const passport = generateContextPassport(SECRET_PROJECT);
    const folderPath = 'C:\\Users\\kris\\repos\\memphant';
    expect(everyFormat(passport, (t) => !t.includes(folderPath))).toBe(true);
  });

  it('never includes forward-slash variant of folder path', () => {
    const passport = generateContextPassport(SECRET_PROJECT);
    expect(everyFormat(passport, (t) => !t.includes('C:/Users/kris/repos/memphant'))).toBe(true);
  });

  it('does not fail when linkedFolder is undefined', () => {
    const passport = generateContextPassport(CLEAN_PROJECT);
    expect(() => allFormats(passport)).not.toThrow();
  });
});

describe('generateContextPassport — AI instruction safety', () => {
  it('does not append memphant_update instructions in any format', () => {
    const passport = generateContextPassport(SECRET_PROJECT);
    expect(everyFormat(passport, (t) => !t.includes('memphant_update'))).toBe(true);
  });

  it('does not append RESPONSE_FORMAT instructions in any format', () => {
    const passport = generateContextPassport(SECRET_PROJECT);
    expect(everyFormat(passport, (t) => !t.includes('RESPONSE_FORMAT'))).toBe(true);
  });

  it('does not include schemaVersion instructions in any format', () => {
    const passport = generateContextPassport(SECRET_PROJECT);
    expect(everyFormat(passport, (t) => !t.includes('schemaVersion'))).toBe(true);
  });
});

describe('generateContextPassport — immutability', () => {
  it('does not mutate the project object', () => {
    const original = JSON.stringify(SECRET_PROJECT);
    generateContextPassport(SECRET_PROJECT);
    expect(JSON.stringify(SECRET_PROJECT)).toBe(original);
  });

  it('returns a new passport object on each call', () => {
    const p1 = generateContextPassport(CLEAN_PROJECT);
    const p2 = generateContextPassport(CLEAN_PROJECT);
    expect(p1).not.toBe(p2);
    expect(p1.formats).not.toBe(p2.formats);
  });

  it('does not throw on a project with all empty arrays', () => {
    const empty: ProjectMemory = {
      id: 'empty',
      name: 'Empty',
      summary: '',
      currentState: '',
      goals: [],
      rules: [],
      decisions: [],
      importantAssets: [],
      openQuestions: [],
      nextSteps: [],
      changelog: [],
      inProgress: [],
      schema_version: '1.1.0',
      checkpoints: [],
      platformState: {},
    };

    expect(() => generateContextPassport(empty)).not.toThrow();
  });
});