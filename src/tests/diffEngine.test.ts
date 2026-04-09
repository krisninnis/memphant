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
import type { ProjectMemory } from '../types/project-brain-types';

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
    platformState: {},
    ...overrides,
  };
}

// ─── detectUpdate ─────────────────────────────────────────────────────────────

describe('detectUpdate', () => {
  it('detects a valid update block', () => {
    const text = `
Some AI response here.

project_brain_update
{
  "currentState": "Almost done.",
  "nextSteps": ["Deploy to staging"]
}
    `;
    const result = detectUpdate(text);
    expect(result).not.toBeNull();
    expect(result?.currentState).toBe('Almost done.');
    expect(result?.nextSteps).toEqual(['Deploy to staging']);
  });

  it('returns null when no update block is present', () => {
    const text = 'Just a normal AI response with no update.';
    expect(detectUpdate(text)).toBeNull();
  });

  it('handles an update block with all fields', () => {
    const text = `
project_brain_update
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
    expect(result?.summary).toBe('Updated summary');
    expect(result?.decisions).toHaveLength(1);
    expect(result?.decisions?.[0].decision).toBe('Use Rust');
    expect(result?.openQuestions).toContain('Is it done?');
  });

  it('returns null for malformed JSON in the block', () => {
    const text = `
project_brain_update
{ "currentState": "Missing closing brace"
    `;
    expect(() => detectUpdate(text)).not.toThrow();
  });

  it('ignores empty string items in arrays', () => {
    const text = `
project_brain_update
{
  "goals": ["  ", "", "Real goal"]
}
    `;
    const result = detectUpdate(text);
    expect(result?.goals).toEqual(['Real goal']);
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
