import {
  DEFAULT_AI_INSTRUCTIONS,
  PlatformCursor,
  ProjectMemory,
  Snapshot,
  Handoff,
} from "../types/project";

export function normalizeImportedProject(data: unknown): ProjectMemory {
  const now = new Date().toISOString();
  const safe = (data ?? {}) as Partial<ProjectMemory> & {
    changelog?: ProjectMemory["changelog"];
    aiInstructions?: ProjectMemory["aiInstructions"];
    snapshots?: Snapshot[];
    handoffs?: Handoff[];
    platformState?: Record<string, PlatformCursor>;
  };

  return {
    schema_version:
      typeof safe.schema_version === "string" ? safe.schema_version : "0.2.0",
    projectName:
      typeof safe.projectName === "string" && safe.projectName.trim()
        ? safe.projectName
        : "Imported Project",
    created: typeof safe.created === "string" ? safe.created : now,
    lastModified:
      typeof safe.lastModified === "string" ? safe.lastModified : now,
    summary: typeof safe.summary === "string" ? safe.summary : "",
    goals: Array.isArray(safe.goals)
      ? safe.goals.filter((x): x is string => typeof x === "string")
      : [],
    rules: Array.isArray(safe.rules)
      ? safe.rules.filter((x): x is string => typeof x === "string")
      : [],
    decisions: Array.isArray(safe.decisions)
      ? safe.decisions.filter((x): x is string => typeof x === "string")
      : [],
    currentState:
      typeof safe.currentState === "string"
        ? safe.currentState
        : "Imported project",
    nextSteps: Array.isArray(safe.nextSteps)
      ? safe.nextSteps.filter((x): x is string => typeof x === "string")
      : [],
    openQuestions: Array.isArray(safe.openQuestions)
      ? safe.openQuestions.filter((x): x is string => typeof x === "string")
      : [],
    importantAssets: Array.isArray(safe.importantAssets)
      ? safe.importantAssets.filter((x): x is string => typeof x === "string")
      : [],
    changelog: Array.isArray(safe.changelog)
      ? safe.changelog.filter(
          (entry): entry is ProjectMemory["changelog"][number] =>
            !!entry &&
            typeof entry.date === "string" &&
            typeof entry.source === "string" &&
            typeof entry.description === "string",
        )
      : [],
    aiInstructions:
      safe.aiInstructions &&
      typeof safe.aiInstructions.role === "string" &&
      typeof safe.aiInstructions.tone === "string" &&
      typeof safe.aiInstructions.focus === "string"
        ? safe.aiInstructions
        : DEFAULT_AI_INSTRUCTIONS,

    snapshots: Array.isArray(safe.snapshots)
      ? safe.snapshots.filter(isValidSnapshot)
      : [],
    handoffs: Array.isArray(safe.handoffs)
      ? safe.handoffs.filter(isValidHandoff)
      : [],
    platformState: isValidPlatformState(safe.platformState)
      ? safe.platformState
      : {},
  };
}

function isValidSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;

  const snapshot = value as Snapshot;

  return (
    typeof snapshot.id === "string" &&
    typeof snapshot.createdAt === "string" &&
    typeof snapshot.hash === "string" &&
    typeof snapshot.summary === "string" &&
    typeof snapshot.currentState === "string" &&
    Array.isArray(snapshot.goals) &&
    snapshot.goals.every((x) => typeof x === "string") &&
    Array.isArray(snapshot.rules) &&
    snapshot.rules.every((x) => typeof x === "string") &&
    Array.isArray(snapshot.decisions) &&
    snapshot.decisions.every((x) => typeof x === "string") &&
    Array.isArray(snapshot.nextSteps) &&
    snapshot.nextSteps.every((x) => typeof x === "string") &&
    Array.isArray(snapshot.openQuestions) &&
    snapshot.openQuestions.every((x) => typeof x === "string")
  );
}

function isValidHandoff(value: unknown): value is Handoff {
  if (!value || typeof value !== "object") return false;

  const handoff = value as Handoff;

  return (
    typeof handoff.id === "string" &&
    typeof handoff.fromPlatform === "string" &&
    typeof handoff.toPlatform === "string" &&
    typeof handoff.purpose === "string" &&
    typeof handoff.createdAt === "string" &&
    typeof handoff.basedOnSnapshotId === "string" &&
    typeof handoff.status === "string"
  );
}

function isValidPlatformState(
  value: unknown,
): value is Record<string, PlatformCursor> {
  if (!value || typeof value !== "object") return false;

  return Object.values(value).every((cursor) => {
    if (!cursor || typeof cursor !== "object") return false;

    const typedCursor = cursor as PlatformCursor;

    return (
      typeof typedCursor.lastSentSnapshotId === "string" &&
      (typedCursor.lastReplyAt === undefined ||
        typeof typedCursor.lastReplyAt === "string")
    );
  });
}

export function buildSnapshotHash(project: ProjectMemory): string {
  const stableState = {
    summary: project.summary,
    currentState: project.currentState,
    goals: project.goals,
    rules: project.rules,
    decisions: project.decisions,
    nextSteps: project.nextSteps,
    openQuestions: project.openQuestions,
  };

  const json = JSON.stringify(stableState);

  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = (hash << 5) - hash + json.charCodeAt(i);
    hash |= 0;
  }

  return `snap_${Math.abs(hash)}`;
}

export function createSnapshot(project: ProjectMemory): Snapshot {
  const createdAt = new Date().toISOString();

  return {
    id: `snapshot_${createdAt}`,
    createdAt,
    hash: buildSnapshotHash(project),
    summary: project.summary,
    currentState: project.currentState,
    goals: [...project.goals],
    rules: [...project.rules],
    decisions: [...project.decisions],
    nextSteps: [...project.nextSteps],
    openQuestions: [...project.openQuestions],
  };
}

export function sanitizeForAiExport(project: ProjectMemory): ProjectMemory {
  const secretKeyPattern =
    /(secret|token|api[_-]?key|password|passwd|private[_-]?key|client[_-]?secret|bearer|auth)/i;

  const envFilePattern =
    /(^|[\\/])(\.env|\.env\..+|secrets?\.|credentials?|id_rsa|\.pem|\.p12|\.key)$/i;

  const redactString = (value: string): string => {
    if (secretKeyPattern.test(value) || envFilePattern.test(value)) {
      return "[REDACTED]";
    }
    return value;
  };

  return {
    ...project,
    summary: redactString(project.summary),
    currentState: redactString(project.currentState),
    goals: project.goals.map(redactString),
    rules: project.rules.map(redactString),
    decisions: project.decisions.map(redactString),
    nextSteps: project.nextSteps.map(redactString),
    openQuestions: project.openQuestions.map(redactString),
    importantAssets: project.importantAssets.map((asset) =>
      envFilePattern.test(asset) || secretKeyPattern.test(asset)
        ? "[REDACTED]"
        : asset,
    ),
    changelog: project.changelog.map((entry) => ({
      ...entry,
      description: redactString(entry.description),
    })),
    aiInstructions: {
      ...project.aiInstructions,
      focus: redactString(project.aiInstructions.focus),
      role: redactString(project.aiInstructions.role),
      tone: redactString(project.aiInstructions.tone),
    },
  };
}
export function getLatestSnapshot(
  project: ProjectMemory,
): Snapshot | undefined {
  const snapshots = project.snapshots ?? [];
  return snapshots[snapshots.length - 1];
}

export function getPlatformLastSeenSnapshot(
  project: ProjectMemory,
  platform: string,
): Snapshot | undefined {
  const lastSentSnapshotId =
    project.platformState?.[platform]?.lastSentSnapshotId;

  if (!lastSentSnapshotId) return undefined;

  return (project.snapshots ?? []).find(
    (snapshot) => snapshot.id === lastSentSnapshotId,
  );
}
export function buildDeltaSummary(
  previousSnapshot: Snapshot | undefined,
  latestSnapshot: Snapshot | undefined,
): string[] {
  if (!latestSnapshot) return [];

  if (!previousSnapshot) {
    return [
      "This AI has not seen the project before.",
      "Send the full project context.",
    ];
  }

  const changes: string[] = [];

  if (previousSnapshot.summary !== latestSnapshot.summary) {
    changes.push("Project summary changed.");
  }

  if (previousSnapshot.currentState !== latestSnapshot.currentState) {
    changes.push("Current state was updated.");
  }

  const compareList = (
    label: string,
    previousItems: string[],
    latestItems: string[],
  ) => {
    const added = latestItems.filter((item) => !previousItems.includes(item));
    const removed = previousItems.filter((item) => !latestItems.includes(item));

    if (added.length > 0) {
      changes.push(`${label}: ${added.length} added.`);
    }

    if (removed.length > 0) {
      changes.push(`${label}: ${removed.length} removed.`);
    }
  };

  compareList("Goals", previousSnapshot.goals, latestSnapshot.goals);
  compareList("Rules", previousSnapshot.rules, latestSnapshot.rules);
  compareList(
    "Decisions",
    previousSnapshot.decisions,
    latestSnapshot.decisions,
  );
  compareList(
    "Next steps",
    previousSnapshot.nextSteps,
    latestSnapshot.nextSteps,
  );
  compareList(
    "Open questions",
    previousSnapshot.openQuestions,
    latestSnapshot.openQuestions,
  );

  if (changes.length === 0) {
    changes.push(
      "No major structured changes since this AI last saw the project.",
    );
  }

  return changes;
}
