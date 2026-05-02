import {
  MEMORY_BRIDGE_SCHEMA_VERSION,
  appendMemoryBridgeToExport,
  buildMemoryBridgeBlock,
} from '../utils/memoryBridge';
import type { ProjectMemory } from '../types/memphant-types';

function makeProject(overrides: Partial<ProjectMemory> = {}): ProjectMemory {
  return {
    schema_version: 1,
    id: 'test_memory_bridge',
    name: 'Memory Bridge Test',
    summary: 'A project for testing automatic AI memory handoff.',
    goals: ['Ship Memory Bridge'],
    rules: ['Preview before applying changes'],
    decisions: [{ decision: 'Use two memory files', rationale: 'Separate long-term and short-term memory' }],
    currentState: 'Testing automatic memory handoff.',
    nextSteps: ['Wire memory bridge into export buttons'],
    openQuestions: [],
    importantAssets: ['src/utils/memoryBridge.ts'],
    projectCharter: 'Preserve user control and avoid silent mutation.',
    aiInstructions: 'Be direct and verify claims.',
    changelog: [],
    checkpoints: [],
    platformState: {},
    ...overrides,
  };
}

describe('memoryBridge', () => {
  it('builds a Memory Bridge block with schema version', () => {
    const output = buildMemoryBridgeBlock(makeProject(), 'chatgpt');

    expect(output).toContain('# Memephant Memory Bridge');
    expect(output).toContain(`memory-bridge/${MEMORY_BRIDGE_SCHEMA_VERSION}`);
    expect(output).toContain('Target platform: chatgpt');
  });

  it('includes hippocampus.md content', () => {
    const output = buildMemoryBridgeBlock(makeProject());

    expect(output).toContain('## .memephant/hippocampus.md');
    expect(output).toContain('```markdown');
    expect(output).toContain('hippocampus.md — Memory Core File Protocol v1');
    expect(output).toContain('# Memory Bridge Test — Memory Core');
  });

  it('includes prefrontal.md content', () => {
    const output = buildMemoryBridgeBlock(makeProject());

    expect(output).toContain('## .memephant/prefrontal.md');
    expect(output).toContain('prefrontal.md — Working Memory File Protocol v1');
    expect(output).toContain('# Memory Bridge Test — Working Memory');
  });

  it('explains how AIs should treat the memory files', () => {
    const output = buildMemoryBridgeBlock(makeProject());

    expect(output).toContain('hippocampus.md` is long-term project memory');
    expect(output).toContain('prefrontal.md` is short-term working memory');
    expect(output).toContain('Do not invent missing facts');
    expect(output).toContain('memphant_update` block using the exact format shown below');
  });

  it('includes the full memphant_update format spec so AIs return the correct structure', () => {
    const output = buildMemoryBridgeBlock(makeProject());

    // Schema version present so AIs know the version
    expect(output).toContain('"schemaVersion"');
    // All critical fields present in the example JSON
    expect(output).toContain('"currentState"');
    expect(output).toContain('"lastSessionSummary"');
    expect(output).toContain('"inProgress"');
    expect(output).toContain('"nextSteps"');
    expect(output).toContain('"openQuestion"');
    // Rules section present
    expect(output).toContain('currentState and lastSessionSummary are ALWAYS required');
    // The JSON block is fenced
    expect(output).toContain('memphant_update\n```json');
  });

  it('appends Memory Bridge after an existing export', () => {
    const output = appendMemoryBridgeToExport('BASE EXPORT', makeProject(), 'claude');

    expect(output.startsWith('BASE EXPORT')).toBe(true);
    expect(output).toContain('# Memephant Memory Bridge');
    expect(output).toContain('Target platform: claude');
  });

  it('does not leak linkedFolder.path through generated memory files', () => {
    const project = makeProject({
      currentState: 'Working inside C:\\Users\\thoma\\private\\project',
      linkedFolder: {
        path: 'C:\\Users\\thoma\\private\\project',
        scanHash: 'abc',
        lastScannedAt: '',
      },
    });

    const output = buildMemoryBridgeBlock(project);

    expect(output).not.toContain('C:\\Users\\thoma\\private\\project');
    expect(output).not.toContain('C:/Users/thoma/private/project');
    expect(output).toContain('[REDACTED]');
  });

  it('redacts secrets through generated memory files', () => {
    const secret = `sk-${'a'.repeat(30)}`;
    const output = buildMemoryBridgeBlock(
      makeProject({
        currentState: `Never expose ${secret}`,
      }),
    );

    expect(output).not.toContain(secret);
    expect(output).toContain('[REDACTED]');
  });
});