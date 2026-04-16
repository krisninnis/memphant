/**
 * Tests for diffEngine.ts
 * Covers: detection, parsing, diff computation, and apply/merge.
 */

import {
  detectUpdate,
  computeDiff,
  applyUpdate,
  countDiffs,
} from '../utils/diffEngine';
import { normalizeOldProject } from '../utils/normalizeOldProject';
import type { ProjectMemory } from '../types/memphant-types';
import { SCHEMA_VERSION } from '../types/memphant-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProject(overrides: Partial<ProjectMemory> = {}): ProjectMemory {
  return {
    schema_version: 1,
    id: 'test_project',
    name: 'Test Project',
    summary: 'A test project for unit tests.',
    goals: ['Write tests', 'Ship on time'],
    rules: ['No shortcuts'],
    decisions: [{ decision: 'Use TypeScript', rationale: 'Type safety' }],
    currentState: 'In progress.',
    nextSteps: ['Add more tests'],
    openQuestions: ['What about edge cases?'],
    importantAssets: ['src/index.ts'],
    aiInstructions: 'Be precise.',
    changelog: [],
    checkpoints: [],
    platformState: {},
    ...overrides,
  };
}

// ─── detectUpdate ─────────────────────────────────────────────────────────────

describe('detectUpdate', () => {
  it('detects a valid update block', () => {
    const text = `
Some AI response here.

memphant_update
{
  "currentState": "Almost done.",
  "nextSteps": ["Deploy to staging"]
}
    `;
    const result = detectUpdate(text);

    expect(result.update).not.toBeNull();
    expect(result.update?.currentState).toBe('Almost done.');
    expect(result.update?.nextSteps).toEqual(['Deploy to staging']);
    expect(result.source).toBe('strict_json');
  });

  it('returns no update when no update block is present', () => {
    const text = 'Just a normal AI response with no update.';
    const result = detectUpdate(text);

    expect(result.update).toBeNull();
    expect(result.source).toBe('none');
    expect(result.confidence).toBe(0);
  });

  it('handles an update block with all fields', () => {
    const text = `
memphant_update
{
  "summary": "Updated summary",
  "currentState": "New state",
  "goals": ["New goal"],
  "decisions": [{"decision": "Use Rust", "rationale": "Performance"}],
  "nextSteps": ["Step A", "Step B"],
  "openQuestions": ["Is it done?"]
}
    `;
    const result = detectUpdate(text);

    expect(result.update).not.toBeNull();
    expect(result.update?.summary).toBe('Updated summary');
    expect(result.update?.decisions).toHaveLength(1);
    expect(result.update?.decisions?.[0].decision).toBe('Use Rust');
    expect(result.update?.openQuestions).toContain('Is it done?');
  });

  it('returns no update for malformed JSON in the block', () => {
    const text = `
memphant_update
{ "currentState": "Missing closing brace"
    `;

    expect(() => detectUpdate(text)).not.toThrow();

    const result = detectUpdate(text);
    expect(result.update).toBeNull();
  });

  it('ignores empty string items in arrays', () => {
    const text = `
memphant_update
{
  "goals": ["  ", "", "Real goal"]
}
    `;
    const result = detectUpdate(text);

    expect(result.update).not.toBeNull();
    expect(result.update?.goals).toEqual(['Real goal']);
  });
});

// ─── computeDiff ──────────────────────────────────────────────────────────────

describe('computeDiff', () => {
  it('detects a changed currentState', () => {
    const project = makeProject();
    const update = { currentState: 'Newly updated state.' };
    const diffs = computeDiff(project, update);
    const stateChange = diffs.find((d) => d.field === 'currentState');

    expect(stateChange).toBeDefined();
    expect(stateChange?.action).toBe('updated');
  });

  it('detects new goals being added', () => {
    const project = makeProject({ goals: ['Existing goal'] });
    const update = { goals: ['Brand new goal'] };
    const diffs = computeDiff(project, update);
    const goalChange = diffs.find((d) => d.field === 'goals');

    expect(goalChange).toBeDefined();
    expect(goalChange?.action).toBe('added');
  });

  it('detects new decisions', () => {
    const project = makeProject({ decisions: [] });
    const update = {
      decisions: [{ decision: 'Use React', rationale: 'Component model' }],
    };
    const diffs = computeDiff(project, update);
    const decisionChange = diffs.find((d) => d.field === 'decisions');

    expect(decisionChange).toBeDefined();
  });

  it('returns no changes when update is empty', () => {
    const project = makeProject();
    const diffs = computeDiff(project, {});

    expect(diffs).toHaveLength(0);
  });

  it('does not flag a change when currentState is identical', () => {
    const project = makeProject({ currentState: 'Same.' });
    const update = { currentState: 'Same.' };
    const diffs = computeDiff(project, update);
    const stateChanges = diffs.filter((d) => d.field === 'currentState');

    expect(stateChanges).toHaveLength(0);
  });

  it('deduplicates items already in the list', () => {
    const project = makeProject({ goals: ['Existing goal'] });
    const update = { goals: ['Existing goal'] };
    const diffs = computeDiff(project, update);
    const goalChanges = diffs.filter((d) => d.field === 'goals');

    expect(goalChanges).toHaveLength(0);
  });
});

// ─── countDiffs ───────────────────────────────────────────────────────────────

describe('countDiffs', () => {
  it('counts diffs correctly', () => {
    const project = makeProject({ goals: ['A'] });
    const update = { currentState: 'Changed.', goals: ['B'] };
    const diffs = computeDiff(project, update);

    expect(countDiffs(diffs)).toBe(diffs.length);
  });

  it('returns 0 for empty diff list', () => {
    expect(countDiffs([])).toBe(0);
  });
});

// ─── applyUpdate ──────────────────────────────────────────────────────────────

describe('applyUpdate', () => {
  it('applies a currentState change', () => {
    const project = makeProject();
    const update = { currentState: 'Final state.' };
    const result = applyUpdate(project, update);

    expect(result.currentState).toBe('Final state.');
  });

  it('merges new goals without duplicating existing ones', () => {
    const project = makeProject({ goals: ['Goal A'] });
    const update = { goals: ['Goal B'] };
    const result = applyUpdate(project, update);

    expect(result.goals).toContain('Goal A');
    expect(result.goals).toContain('Goal B');
    expect(result.goals.filter((g: string) => g === 'Goal A')).toHaveLength(1);
  });

  it('appends new next steps', () => {
    const project = makeProject({ nextSteps: ['Step 1'] });
    const update = { nextSteps: ['Step 2'] };
    const result = applyUpdate(project, update);

    expect(result.nextSteps).toContain('Step 1');
    expect(result.nextSteps).toContain('Step 2');
  });

  it('does not mutate the original project', () => {
    const project = makeProject();
    const originalState = project.currentState;
    const update = { currentState: 'Changed.' };

    applyUpdate(project, update);

    expect(project.currentState).toBe(originalState);
  });

  it('adds a changelog entry when applying changes', () => {
    const project = makeProject({ changelog: [] });
    const update = { currentState: 'Updated.' };
    const result = applyUpdate(project, update);

    expect(result.changelog.length).toBeGreaterThan(0);
  });

  it('preserves unchanged fields', () => {
    const project = makeProject();
    const update = { currentState: 'New state.' };
    const result = applyUpdate(project, update);

    expect(result.name).toBe(project.name);
    expect(result.summary).toBe(project.summary);
  });
});

// ─── inProgress (REPLACE-ALL semantics) ──────────────────────────────────────

describe('inProgress — computeDiff', () => {
  it('detects a replacement when inProgress changes', () => {
    const project = makeProject({ inProgress: ['Old task'] });
    const update = { inProgress: ['New task'] };
    const diffs = computeDiff(project, update);
    const diff = diffs.find((d) => d.field === 'inProgress');

    expect(diff).toBeDefined();
    expect(diff?.action).toBe('updated');
  });

  it('detects removal when inProgress is cleared with []', () => {
    const project = makeProject({ inProgress: ['Running task'] });
    const update = { inProgress: [] };
    const diffs = computeDiff(project, update);
    const diff = diffs.find((d) => d.field === 'inProgress');

    expect(diff).toBeDefined();
    expect(diff?.action).toBe('removed');
  });

  it('produces no diff when inProgress is absent from update', () => {
    const project = makeProject({ inProgress: ['Existing task'] });
    const update = { currentState: 'Something else changed.' };
    const diffs = computeDiff(project, update);
    const diff = diffs.find((d) => d.field === 'inProgress');

    expect(diff).toBeUndefined();
  });

  it('produces no diff when inProgress is identical', () => {
    const project = makeProject({ inProgress: ['Same task'] });
    const update = { inProgress: ['Same task'] };
    const diffs = computeDiff(project, update);
    const diff = diffs.find((d) => d.field === 'inProgress');

    expect(diff).toBeUndefined();
  });
});

describe('inProgress — applyUpdate', () => {
  it('replaces existing inProgress array entirely', () => {
    const project = makeProject({ inProgress: ['Old task A', 'Old task B'] });
    const update = { inProgress: ['New task'] };
    const result = applyUpdate(project, update);

    expect(result.inProgress).toEqual(['New task']);
  });

  it('leaves existing inProgress untouched when absent from update', () => {
    const project = makeProject({ inProgress: ['Keep this'] });
    const update = { currentState: 'Changed.' };
    const result = applyUpdate(project, update);

    expect(result.inProgress).toEqual(['Keep this']);
  });

  it('clears inProgress when update sends empty array', () => {
    const project = makeProject({ inProgress: ['Task to clear'] });
    const update = { inProgress: [] };
    const result = applyUpdate(project, update);

    // [] = clear: inProgress should be empty or undefined after apply
    expect(!result.inProgress || result.inProgress.length === 0).toBe(true);
  });

  it('sets inProgress on a project that had none', () => {
    const project = makeProject({ inProgress: undefined });
    const update = { inProgress: ['Brand new task'] };
    const result = applyUpdate(project, update);

    expect(result.inProgress).toEqual(['Brand new task']);
  });

  it('does not mutate the original inProgress array', () => {
    const original = ['Original task'];
    const project = makeProject({ inProgress: original });
    const update = { inProgress: ['Replacement task'] };
    applyUpdate(project, update);

    expect(project.inProgress).toEqual(['Original task']);
  });
});

// ─── lastSessionSummary (REPLACE semantics) ───────────────────────────────────

describe('lastSessionSummary — computeDiff', () => {
  it('detects a change when lastSessionSummary is updated', () => {
    const project = makeProject({ lastSessionSummary: 'Old summary.' });
    const update = { lastSessionSummary: 'New summary.' };
    const diffs = computeDiff(project, update);
    const diff = diffs.find((d) => d.field === 'lastSessionSummary');

    expect(diff).toBeDefined();
    expect(diff?.action).toBe('updated');
  });

  it('produces no diff when lastSessionSummary is absent from update', () => {
    const project = makeProject({ lastSessionSummary: 'Existing summary.' });
    const update = { currentState: 'Something changed.' };
    const diffs = computeDiff(project, update);
    const diff = diffs.find((d) => d.field === 'lastSessionSummary');

    expect(diff).toBeUndefined();
  });

  it('produces no diff when lastSessionSummary is identical', () => {
    const project = makeProject({ lastSessionSummary: 'Same text.' });
    const update = { lastSessionSummary: 'Same text.' };
    const diffs = computeDiff(project, update);
    const diff = diffs.find((d) => d.field === 'lastSessionSummary');

    expect(diff).toBeUndefined();
  });
});

describe('lastSessionSummary — applyUpdate', () => {
  it('replaces existing lastSessionSummary', () => {
    const project = makeProject({ lastSessionSummary: 'Previous session recap.' });
    const update = { lastSessionSummary: 'New session recap.' };
    const result = applyUpdate(project, update);

    expect(result.lastSessionSummary).toBe('New session recap.');
  });

  it('leaves existing lastSessionSummary untouched when absent from update', () => {
    const project = makeProject({ lastSessionSummary: 'Keep this recap.' });
    const update = { currentState: 'Changed.' };
    const result = applyUpdate(project, update);

    expect(result.lastSessionSummary).toBe('Keep this recap.');
  });

  it('sets lastSessionSummary on a project that had none', () => {
    const project = makeProject({ lastSessionSummary: undefined });
    const update = { lastSessionSummary: 'First ever recap.' };
    const result = applyUpdate(project, update);

    expect(result.lastSessionSummary).toBe('First ever recap.');
  });
});

// ─── openQuestion (REPLACE semantics) ────────────────────────────────────────

describe('openQuestion — computeDiff', () => {
  it('detects a change when openQuestion is updated', () => {
    const project = makeProject({ openQuestion: 'Old question?' });
    const update = { openQuestion: 'New question?' };
    const diffs = computeDiff(project, update);
    const diff = diffs.find((d) => d.field === 'openQuestion');

    expect(diff).toBeDefined();
    expect(diff?.action).toBe('updated');
  });

  it('produces no diff when openQuestion is absent from update', () => {
    const project = makeProject({ openQuestion: 'Existing question?' });
    const update = { currentState: 'Something changed.' };
    const diffs = computeDiff(project, update);
    const diff = diffs.find((d) => d.field === 'openQuestion');

    expect(diff).toBeUndefined();
  });

  it('produces no diff when openQuestion is identical', () => {
    const project = makeProject({ openQuestion: 'Same question?' });
    const update = { openQuestion: 'Same question?' };
    const diffs = computeDiff(project, update);
    const diff = diffs.find((d) => d.field === 'openQuestion');

    expect(diff).toBeUndefined();
  });
});

describe('openQuestion — applyUpdate', () => {
  it('replaces existing openQuestion', () => {
    const project = makeProject({ openQuestion: 'Old question?' });
    const update = { openQuestion: 'New question?' };
    const result = applyUpdate(project, update);

    expect(result.openQuestion).toBe('New question?');
  });

  it('leaves existing openQuestion untouched when absent from update', () => {
    const project = makeProject({ openQuestion: 'Keep this question?' });
    const update = { currentState: 'Changed.' };
    const result = applyUpdate(project, update);

    expect(result.openQuestion).toBe('Keep this question?');
  });

  it('sets openQuestion on a project that had none', () => {
    const project = makeProject({ openQuestion: undefined });
    const update = { openQuestion: 'First ever question?' };
    const result = applyUpdate(project, update);

    expect(result.openQuestion).toBe('First ever question?');
  });
});

// ─── detectUpdate — new fields parsed correctly ───────────────────────────────

describe('detectUpdate — new schema 1.1.0 fields', () => {
  it('parses inProgress array from update block', () => {
    const text = `
memphant_update
{
  "inProgress": ["Implementing feature X", "Writing tests"]
}
    `;
    const result = detectUpdate(text);

    expect(result.update).not.toBeNull();
    expect(result.update?.inProgress).toEqual(['Implementing feature X', 'Writing tests']);
  });

  it('parses inProgress as empty array (clear signal)', () => {
    const text = `
memphant_update
{
  "inProgress": []
}
    `;
    const result = detectUpdate(text);

    expect(result.update).not.toBeNull();
    // inProgress present and empty — valid "clear" signal
    expect(Array.isArray(result.update?.inProgress)).toBe(true);
    expect(result.update?.inProgress).toHaveLength(0);
  });

  it('parses lastSessionSummary from update block', () => {
    const text = `
memphant_update
{
  "lastSessionSummary": "We completed the auth flow and started on billing."
}
    `;
    const result = detectUpdate(text);

    expect(result.update).not.toBeNull();
    expect(result.update?.lastSessionSummary).toBe(
      'We completed the auth flow and started on billing.',
    );
  });

  it('parses openQuestion from update block', () => {
    const text = `
memphant_update
{
  "openQuestion": "Should we use Stripe or Paddle for billing?"
}
    `;
    const result = detectUpdate(text);

    expect(result.update).not.toBeNull();
    expect(result.update?.openQuestion).toBe('Should we use Stripe or Paddle for billing?');
  });

  it('leaves inProgress undefined when not present in block', () => {
    const text = `
memphant_update
{
  "currentState": "Shipping soon."
}
    `;
    const result = detectUpdate(text);

    expect(result.update).not.toBeNull();
    expect(result.update?.inProgress).toBeUndefined();
  });
});

// ─── Schema migration (normalizeOldProject) ───────────────────────────────────

describe('normalizeOldProject — schema migration', () => {
  /** Minimal raw object that matches a pre-1.1.0 project on disk. */
  function makeLegacyRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'legacy_project',
      name: 'Legacy Project',
      summary: 'An old project with no schema version.',
      goals: ['Ship it'],
      rules: [],
      decisions: [],
      currentState: 'Running.',
      nextSteps: [],
      openQuestions: [],
      importantAssets: [],
      aiInstructions: '',
      changelog: [],
      checkpoints: [],
      platformState: {},
      ...overrides,
    };
  }

  it('stamps SCHEMA_VERSION on a project with no schema_version field', () => {
    const raw = makeLegacyRaw(); // no schema_version key
    const result = normalizeOldProject(raw);

    expect(result.schema_version).toBe(SCHEMA_VERSION);
  });

  it('stamps SCHEMA_VERSION on a project with legacy numeric schema_version 1', () => {
    const raw = makeLegacyRaw({ schema_version: 1 });
    const result = normalizeOldProject(raw);

    expect(result.schema_version).toBe(SCHEMA_VERSION);
  });

  it('does not modify existing field values during migration', () => {
    const raw = makeLegacyRaw({
      summary: 'My specific summary',
      goals: ['Goal A', 'Goal B'],
      currentState: 'Specific state',
    });
    const result = normalizeOldProject(raw);

    expect(result.summary).toBe('My specific summary');
    expect(result.goals).toEqual(['Goal A', 'Goal B']);
    expect(result.currentState).toBe('Specific state');
  });

  it('leaves inProgress, lastSessionSummary, openQuestion undefined when absent in legacy data', () => {
    const raw = makeLegacyRaw(); // none of the 1.1.0 fields present
    const result = normalizeOldProject(raw);

    expect(result.inProgress).toBeUndefined();
    expect(result.lastSessionSummary).toBeUndefined();
    expect(result.openQuestion).toBeUndefined();
  });

  it('migrates inProgress from legacy data when present', () => {
    const raw = makeLegacyRaw({ inProgress: ['Porting auth module'] });
    const result = normalizeOldProject(raw);

    expect(result.inProgress).toEqual(['Porting auth module']);
  });

  it('migrates lastSessionSummary from legacy data when present', () => {
    const raw = makeLegacyRaw({ lastSessionSummary: 'We finished the auth flow.' });
    const result = normalizeOldProject(raw);

    expect(result.lastSessionSummary).toBe('We finished the auth flow.');
  });

  it('migrates openQuestion from legacy data when present', () => {
    const raw = makeLegacyRaw({ openQuestion: 'Should we use Stripe?' });
    const result = normalizeOldProject(raw);

    expect(result.openQuestion).toBe('Should we use Stripe?');
  });

  it('filters out non-string entries in legacy inProgress array', () => {
    const raw = makeLegacyRaw({ inProgress: ['Valid task', 42, null, '  ', 'Another task'] });
    const result = normalizeOldProject(raw);

    expect(result.inProgress).toEqual(['Valid task', 'Another task']);
  });
});
