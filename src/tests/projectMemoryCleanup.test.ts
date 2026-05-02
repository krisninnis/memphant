import {
  createCleanProjectMemoryDraft,
  getProjectMemoryCleanupPreview,
} from '../utils/projectMemoryCleanup';
import type { ProjectMemory } from '../types/memphant-types';

function makeProject(overrides: Partial<ProjectMemory> = {}): ProjectMemory {
  return {
    schema_version: 1,
    id: 'cleanup_test',
    name: 'Cleanup Test',
    summary: 'A local-first memory app.',
    goals: ['Ship safely'],
    rules: ['Preview before applying'],
    decisions: [{ decision: 'Use Tauri', rationale: 'Keeps the app local-first' }],
    currentState: 'Memory Core is available.',
    nextSteps: ['Add cleanup preview'],
    openQuestions: ['Should cleanup touch exports?'],
    importantAssets: ['src/App.tsx'],
    projectCharter: 'Prefer small safe changes.',
    changelog: [],
    checkpoints: [],
    platformState: {},
    ...overrides,
  };
}

describe('projectMemoryCleanup', () => {
  it('removes memphant_update placeholders from scalar fields', () => {
    const preview = getProjectMemoryCleanupPreview(
      makeProject({
        summary: 'Write 1-2 sentences describing what is true right now after this session...',
        currentState:
          'Write 1-2 sentences describing what is true right now after this session...',
        lastSessionSummary:
          'Write 2-4 sentences recapping exactly what happened in this session...',
        openQuestion:
          'The single most important unresolved question or decision needed to move forward',
        projectCharter:
          'Write 1-2 sentences describing what is true right now after this session...',
      }),
    );

    expect(preview.draft.summary).toBe('');
    expect(preview.draft.currentState).toBe('');
    expect(preview.draft.lastSessionSummary).toBeUndefined();
    expect(preview.draft.openQuestion).toBeUndefined();
    expect(preview.draft.projectCharter).toBe('');
    expect(preview.removedPlaceholderValues).toHaveLength(5);
    expect(preview.fieldsChanged).toEqual(
      expect.arrayContaining([
        'summary',
        'currentState',
        'lastSessionSummary',
        'openQuestion',
        'projectCharter',
      ]),
    );
  });

  it('removes placeholders from lists and decisions', () => {
    const preview = getProjectMemoryCleanupPreview(
      makeProject({
        goals: ['Only include if a genuinely new goal emerged this session', 'Launch MVP'],
        rules: ['Preview before applying', 'List only things actively being worked on right now - not done, not future'],
        nextSteps: ['List the immediate next actions that should happen after this session'],
        openQuestions: [
          'The single most important unresolved question or decision needed to move forward',
          'What should we ship next?',
        ],
        decisions: [
          {
            decision: 'Only include genuinely new decisions made this session',
            rationale: 'Why this decision was made',
          },
          {
            decision: 'Keep Memory Core visible',
            rationale: 'Why this decision was made',
          },
        ],
      }),
    );

    expect(preview.draft.goals).toEqual(['Launch MVP']);
    expect(preview.draft.rules).toEqual(['Preview before applying']);
    expect(preview.draft.nextSteps).toEqual([]);
    expect(preview.draft.openQuestions).toEqual(['What should we ship next?']);
    expect(preview.draft.decisions).toEqual([{ decision: 'Keep Memory Core visible' }]);
    expect(preview.removedPlaceholderValues.length).toBeGreaterThanOrEqual(6);
  });

  it('deduplicates list fields case-insensitively after trimming', () => {
    const draft = createCleanProjectMemoryDraft(
      makeProject({
        goals: ['Launch MVP', ' launch mvp ', 'Talk to users'],
        rules: ['Local-first', 'local-FIRST'],
        nextSteps: ['Test cleanup', 'test cleanup'],
        openQuestions: ['Pricing?', ' pricing? '],
        importantAssets: ['src\\App.tsx', 'src/App.tsx', 'src/store.ts'],
      }),
    );

    expect(draft.goals).toEqual(['Launch MVP', 'Talk to users']);
    expect(draft.rules).toEqual(['Local-first']);
    expect(draft.nextSteps).toEqual(['Test cleanup']);
    expect(draft.openQuestions).toEqual(['Pricing?']);
    expect(draft.importantAssets).toEqual(['src/App.tsx', 'src/store.ts']);
  });

  it('normalizes important asset paths and removes noisy or suspicious assets', () => {
    const preview = getProjectMemoryCleanupPreview(
      makeProject({
        importantAssets: [
          'src\\components\\Editor\\ProjectEditor.tsx',
          '.env',
          'config/passwords.txt',
          'keys/private-key.pem',
          'cache/token-store.json',
          'TASK NAME.txt',
          'Untitled.txt',
          'broken�file.ts',
        ],
      }),
    );

    expect(preview.draft.importantAssets).toEqual([
      'src/components/Editor/ProjectEditor.tsx',
    ]);
    expect(preview.removedNoisyAssets).toEqual(
      expect.arrayContaining([
        '.env',
        'config/passwords.txt',
        'keys/private-key.pem',
        'cache/token-store.json',
        'TASK NAME.txt',
        'Untitled.txt',
        'broken�file.ts',
      ]),
    );
  });

  it('returns a preview with changed fields and removed duplicate values', () => {
    const preview = getProjectMemoryCleanupPreview(
      makeProject({
        goals: ['Launch MVP', 'launch mvp'],
        importantAssets: ['src\\App.tsx', 'Untitled.txt'],
      }),
    );

    expect(preview.hasChanges).toBe(true);
    expect(preview.fieldsChanged).toEqual(expect.arrayContaining(['goals', 'importantAssets']));
    expect(preview.removedDuplicateValues).toEqual([
      { field: 'goals', value: 'launch mvp' },
    ]);
    expect(preview.removedNoisyAssets).toEqual(['Untitled.txt']);
  });

  it('reports no changes for clean project memory', () => {
    const project = makeProject();
    const preview = getProjectMemoryCleanupPreview(project);

    expect(preview.hasChanges).toBe(false);
    expect(preview.fieldsChanged).toEqual([]);
    expect(preview.draft).toEqual(project);
  });

  it('does not mutate the original project', () => {
    const project = makeProject({
      goals: ['Launch MVP', 'launch mvp'],
      importantAssets: ['src\\App.tsx'],
    });

    createCleanProjectMemoryDraft(project);

    expect(project.goals).toEqual(['Launch MVP', 'launch mvp']);
    expect(project.importantAssets).toEqual(['src\\App.tsx']);
  });
});
