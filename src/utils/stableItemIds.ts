import type {
  Decision,
  ProjectMemory,
  ProjectNextIds,
  StableItemPrefix,
} from '../types/memphant-types';

function createEmptyNextIds(): ProjectNextIds {
  return {
    D: 1,
    R: 1,
    G: 1,
    Q: 1,
  };
}

function cloneNextIds(nextIds?: ProjectNextIds): ProjectNextIds {
  return nextIds
    ? { D: nextIds.D, R: nextIds.R, G: nextIds.G, Q: nextIds.Q }
    : createEmptyNextIds();
}

function padId(value: number): string {
  return String(value).padStart(3, '0');
}

export function formatStableItemId(prefix: StableItemPrefix, value: number): string {
  return `${prefix}-${padId(value)}`;
}

function parseStableItemId(
  id: string | undefined,
  prefix: StableItemPrefix,
): number | null {
  if (!id) return null;

  const match = id.match(/^([DRGQ])-(\d{3,})$/);
  if (!match) return null;
  if (match[1] !== prefix) return null;

  const parsed = Number(match[2]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function reserveExistingIds(
  nextIds: ProjectNextIds,
  prefix: StableItemPrefix,
  ids: Array<string | undefined>,
): ProjectNextIds {
  const highest = ids.reduce((max, id) => {
    const parsed = parseStableItemId(id, prefix);
    return parsed && parsed > max ? parsed : max;
  }, 0);

  if (highest <= 0) return nextIds;

  return {
    ...nextIds,
    [prefix]: Math.max(nextIds[prefix], highest + 1),
  };
}

export function allocateStableItemId(
  nextIds: ProjectNextIds,
  prefix: StableItemPrefix,
): { id: string; nextIds: ProjectNextIds } {
  const current = Math.max(1, nextIds[prefix]);
  return {
    id: formatStableItemId(prefix, current),
    nextIds: {
      ...nextIds,
      [prefix]: current + 1,
    },
  };
}

type SynchronizeStableIdsOptions<T> = {
  prefix: StableItemPrefix;
  items: T[];
  nextIds?: ProjectNextIds;
  baselineItems?: T[];
  baselineIds?: Array<string | undefined>;
  currentIds?: Array<string | undefined>;
  getSignature: (item: T) => string;
};

type SynchronizeStableIdsResult = {
  ids: string[];
  nextIds: ProjectNextIds;
  changed: boolean;
};

export function synchronizeStableIds<T>({
  prefix,
  items,
  nextIds,
  baselineItems = [],
  baselineIds = [],
  currentIds = [],
  getSignature,
}: SynchronizeStableIdsOptions<T>): SynchronizeStableIdsResult {
  let next = reserveExistingIds(cloneNextIds(nextIds), prefix, [
    ...baselineIds,
    ...currentIds,
  ]);

  const baselineQueues = new Map<string, string[]>();
  baselineItems.forEach((item, index) => {
    const baselineId = baselineIds[index];
    if (!baselineId) return;
    if (parseStableItemId(baselineId, prefix) === null) return;

    const signature = getSignature(item);
    const existing = baselineQueues.get(signature) ?? [];
    existing.push(baselineId);
    baselineQueues.set(signature, existing);
  });

  const ids: string[] = [];
  let changed = false;

  items.forEach((item, index) => {
    const signature = getSignature(item);
    const queue = baselineQueues.get(signature);
    let id = queue && queue.length > 0 ? queue.shift() : undefined;

    if (!id) {
      const allocated = allocateStableItemId(next, prefix);
      id = allocated.id;
      next = allocated.nextIds;
    }

    ids.push(id);

    if (currentIds[index] !== id) {
      changed = true;
    }
  });

  if (items.length !== currentIds.length) {
    changed = true;
  }

  if (
    next.D !== (nextIds?.D ?? 1) ||
    next.R !== (nextIds?.R ?? 1) ||
    next.G !== (nextIds?.G ?? 1) ||
    next.Q !== (nextIds?.Q ?? 1)
  ) {
    changed = true;
  }

  return { ids, nextIds: next, changed };
}

function decisionSignature(decision: Decision): string {
  const alternatives = decision.alternativesConsidered?.join('|') ?? '';
  return [
    decision.decision.trim(),
    decision.rationale?.trim() ?? '',
    alternatives,
  ].join('::');
}

function decisionIds(decisions: Decision[]): Array<string | undefined> {
  return decisions.map((decision) => decision.id);
}

function withDecisionIds(decisions: Decision[], ids: string[]): Decision[] {
  return decisions.map((decision, index) => ({ ...decision, id: ids[index] }));
}

export function ensureProjectStableIds(
  project: ProjectMemory,
  previousProject?: ProjectMemory,
): { project: ProjectMemory; changed: boolean } {
  let changed = false;
  let nextIds = cloneNextIds(project.nextIds);

  const decisionSync = synchronizeStableIds({
    prefix: 'D',
    items: project.decisions,
    nextIds,
    baselineItems: previousProject?.decisions ?? project.decisions,
    baselineIds: decisionIds(previousProject?.decisions ?? project.decisions),
    currentIds: decisionIds(project.decisions),
    getSignature: decisionSignature,
  });
  nextIds = decisionSync.nextIds;
  const decisions = withDecisionIds(project.decisions, decisionSync.ids);
  changed ||= decisionSync.changed;

  // TODO(vcp-typed-items): replace parallel IDs with typed goal items.
  const goalsSync = synchronizeStableIds({
    prefix: 'G',
    items: project.goals,
    nextIds,
    baselineItems: previousProject?.goals ?? project.goals,
    baselineIds: previousProject?.goalIds ?? project.goalIds ?? [],
    currentIds: project.goalIds ?? [],
    getSignature: (goal) => goal.trim(),
  });
  nextIds = goalsSync.nextIds;
  changed ||= goalsSync.changed;

  // TODO(vcp-typed-items): replace parallel IDs with typed rule items.
  const rulesSync = synchronizeStableIds({
    prefix: 'R',
    items: project.rules,
    nextIds,
    baselineItems: previousProject?.rules ?? project.rules,
    baselineIds: previousProject?.ruleIds ?? project.ruleIds ?? [],
    currentIds: project.ruleIds ?? [],
    getSignature: (rule) => rule.trim(),
  });
  nextIds = rulesSync.nextIds;
  changed ||= rulesSync.changed;

  // TODO(vcp-typed-items): replace parallel IDs with typed open-question items.
  const questionsSync = synchronizeStableIds({
    prefix: 'Q',
    items: project.openQuestions,
    nextIds,
    baselineItems: previousProject?.openQuestions ?? project.openQuestions,
    baselineIds: previousProject?.openQuestionIds ?? project.openQuestionIds ?? [],
    currentIds: project.openQuestionIds ?? [],
    getSignature: (question) => question.trim(),
  });
  nextIds = questionsSync.nextIds;
  changed ||= questionsSync.changed;

  const nextIdsChanged =
    project.nextIds?.D !== nextIds.D ||
    project.nextIds?.R !== nextIds.R ||
    project.nextIds?.G !== nextIds.G ||
    project.nextIds?.Q !== nextIds.Q;

  changed ||= nextIdsChanged || !project.nextIds;

  return {
    project: {
      ...project,
      decisions,
      goalIds: goalsSync.ids,
      ruleIds: rulesSync.ids,
      openQuestionIds: questionsSync.ids,
      nextIds,
    },
    changed,
  };
}

