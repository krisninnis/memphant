import { SCHEMA_VERSION, type ProjectMemory } from '../types/memphant-types';
import { ensureProjectStableIds } from '../utils/stableItemIds';

function makeProject(overrides: Partial<ProjectMemory> = {}): ProjectMemory {
  return {
    schema_version: SCHEMA_VERSION,
    id: 'project_1',
    name: 'Project One',
    summary: 'Summary',
    goals: ['Goal A'],
    rules: ['Rule A'],
    decisions: [{ decision: 'Decision A', rationale: 'Because' }],
    currentState: 'Active',
    nextSteps: ['Step A'],
    openQuestions: ['Question A'],
    importantAssets: [],
    checkpoints: [],
    restorePoints: [],
    changelog: [],
    platformState: {},
    ...overrides,
  };
}

describe('ensureProjectStableIds', () => {
  it('migrates a project with no IDs', () => {
    const legacy = makeProject({
      goals: ['Goal A', 'Goal B'],
      rules: ['Rule A'],
      decisions: [{ decision: 'Decision A', rationale: 'Because' }],
      openQuestions: ['Question A'],
      goalIds: undefined,
      ruleIds: undefined,
      openQuestionIds: undefined,
      nextIds: undefined,
    });

    const { project, changed } = ensureProjectStableIds(legacy);

    expect(changed).toBe(true);
    expect(project.decisions[0].id).toBe('D-001');
    expect(project.goalIds).toEqual(['G-001', 'G-002']);
    expect(project.ruleIds).toEqual(['R-001']);
    expect(project.openQuestionIds).toEqual(['Q-001']);
    expect(project.nextIds).toEqual({ D: 2, R: 2, G: 3, Q: 2 });
  });

  it('appends with the next sequential ID', () => {
    const existing = ensureProjectStableIds(
      makeProject({
        goals: ['Goal A'],
      }),
    ).project;

    const { project } = ensureProjectStableIds(
      {
        ...existing,
        goals: ['Goal A', 'Goal B'],
      },
      existing,
    );

    expect(project.goalIds).toEqual(['G-001', 'G-002']);
    expect(project.nextIds?.G).toBe(3);
  });

  it('does not reuse deleted IDs', () => {
    const existing = ensureProjectStableIds(
      makeProject({
        goals: ['Goal A', 'Goal B'],
      }),
    ).project;

    const afterDelete = ensureProjectStableIds(
      {
        ...existing,
        goals: ['Goal B'],
      },
      existing,
    ).project;

    const afterAdd = ensureProjectStableIds(
      {
        ...afterDelete,
        goals: ['Goal B', 'Goal C'],
      },
      afterDelete,
    ).project;

    expect(afterDelete.goalIds).toEqual(['G-002']);
    expect(afterAdd.goalIds).toEqual(['G-002', 'G-003']);
    expect(afterAdd.nextIds?.G).toBe(4);
  });

  it('treats edited content as a new ID', () => {
    const existing = ensureProjectStableIds(
      makeProject({
        rules: ['Rule A'],
      }),
    ).project;

    const { project } = ensureProjectStableIds(
      {
        ...existing,
        rules: ['Rule A updated'],
      },
      existing,
    );

    expect(project.ruleIds).toEqual(['R-002']);
    expect(project.nextIds?.R).toBe(3);
  });

  it('is idempotent on reload', () => {
    const first = ensureProjectStableIds(
      makeProject({
        goals: ['Goal A', 'Goal B'],
        rules: ['Rule A'],
        openQuestions: ['Question A'],
      }),
    ).project;

    const secondPass = ensureProjectStableIds(first);

    expect(secondPass.changed).toBe(false);
    expect(secondPass.project).toEqual(first);
  });
});

