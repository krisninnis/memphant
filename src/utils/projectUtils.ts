import {
  DEFAULT_AI_INSTRUCTIONS,
  LinkedFolder,
  ProjectMemory,
  Snapshot,
} from "../types/project";

export function createSnapshot(project: ProjectMemory): Snapshot {
  const createdAt = new Date().toISOString();

  const snapshotCore = {
    summary: project.summary,
    currentState: project.currentState,
    goals: project.goals,
    rules: project.rules,
    decisions: project.decisions,
    nextSteps: project.nextSteps,
    openQuestions: project.openQuestions,
  };

  const raw = JSON.stringify(snapshotCore);
  const hash = simpleHash(raw);

  return {
    id: `${createdAt}-${hash}`,
    createdAt,
    hash,
    ...snapshotCore,
  };
}

function simpleHash(input: string): string {
  let hash = 0;

  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(16);
}

export function normalizeImportedProject(data: unknown): ProjectMemory {
  const now = new Date().toISOString();
  const safe = (data ?? {}) as Partial<ProjectMemory> & {
    changelog?: ProjectMemory["changelog"];
    aiInstructions?: ProjectMemory["aiInstructions"];
    snapshots?: ProjectMemory["snapshots"];
    handoffs?: ProjectMemory["handoffs"];
    platformState?: ProjectMemory["platformState"];
    scanInfo?: ProjectMemory["scanInfo"];
    scanInsights?: ProjectMemory["scanInsights"];
    autoFillState?: ProjectMemory["autoFillState"];
    projectNameSource?: ProjectMemory["projectNameSource"];
    linkedProjectPath?: unknown;
    linkedProjectName?: unknown;
    linkedFolder?: unknown;
  };

  const rawLinkedFolder = safe.linkedFolder as
    | Partial<LinkedFolder>
    | undefined;

  const linkedFolder: LinkedFolder | undefined =
    rawLinkedFolder && typeof rawLinkedFolder.path === "string"
      ? {
          path: rawLinkedFolder.path,
          lastScannedAt:
            typeof rawLinkedFolder.lastScannedAt === "string"
              ? rawLinkedFolder.lastScannedAt
              : now,
          scanHash:
            typeof rawLinkedFolder.scanHash === "string"
              ? rawLinkedFolder.scanHash
              : "unknown",
        }
      : undefined;

  const linkedProjectPath =
    typeof safe.linkedProjectPath === "string" && safe.linkedProjectPath.trim()
      ? safe.linkedProjectPath
      : undefined;

  const linkedProjectName =
    typeof safe.linkedProjectName === "string" && safe.linkedProjectName.trim()
      ? safe.linkedProjectName
      : undefined;

  const projectNameSource =
    safe.projectNameSource === "user" ||
    safe.projectNameSource === "scan_package" ||
    safe.projectNameSource === "scan_folder" ||
    safe.projectNameSource === "import"
      ? safe.projectNameSource
      : "import";

  const autoFillState =
    safe.autoFillState &&
    typeof safe.autoFillState === "object" &&
    !Array.isArray(safe.autoFillState)
      ? {
          summary:
            safe.autoFillState.summary === "scan" ||
            safe.autoFillState.summary === "user" ||
            safe.autoFillState.summary === "ai"
              ? safe.autoFillState.summary
              : undefined,
          currentState:
            safe.autoFillState.currentState === "scan" ||
            safe.autoFillState.currentState === "user" ||
            safe.autoFillState.currentState === "ai"
              ? safe.autoFillState.currentState
              : undefined,
        }
      : {};

  return {
    schema_version:
      typeof safe.schema_version === "string" ? safe.schema_version : "0.2.0",

    projectName:
      typeof safe.projectName === "string" && safe.projectName.trim()
        ? safe.projectName
        : "Imported Project",

    projectNameSource,

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

    // Legacy fields — compatibility-only.
    // New logic should read linkedFolder first and only fall back to these
    // when opening older saved projects.
    linkedProjectPath,
    linkedProjectName,

    // Primary linked-folder source of truth for all new logic.
    linkedFolder,

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
      ? safe.snapshots.filter(
          (
            snapshot,
          ): snapshot is NonNullable<ProjectMemory["snapshots"]>[number] =>
            !!snapshot &&
            typeof snapshot.id === "string" &&
            typeof snapshot.createdAt === "string" &&
            typeof snapshot.hash === "string" &&
            typeof snapshot.summary === "string" &&
            typeof snapshot.currentState === "string" &&
            Array.isArray(snapshot.goals) &&
            Array.isArray(snapshot.rules) &&
            Array.isArray(snapshot.decisions) &&
            Array.isArray(snapshot.nextSteps) &&
            Array.isArray(snapshot.openQuestions),
        )
      : [],

    handoffs: Array.isArray(safe.handoffs)
      ? safe.handoffs.filter(
          (
            handoff,
          ): handoff is NonNullable<ProjectMemory["handoffs"]>[number] =>
            !!handoff &&
            typeof handoff.id === "string" &&
            typeof handoff.fromPlatform === "string" &&
            typeof handoff.toPlatform === "string" &&
            typeof handoff.purpose === "string" &&
            typeof handoff.createdAt === "string" &&
            typeof handoff.basedOnSnapshotId === "string" &&
            typeof handoff.status === "string",
        )
      : [],

    platformState:
      safe.platformState && typeof safe.platformState === "object"
        ? Object.fromEntries(
            Object.entries(safe.platformState).filter(
              ([, value]) =>
                !!value &&
                typeof value === "object" &&
                typeof (value as { lastSentSnapshotId?: unknown })
                  .lastSentSnapshotId === "string" &&
                ((value as { lastReplyAt?: unknown }).lastReplyAt ===
                  undefined ||
                  typeof (value as { lastReplyAt?: unknown }).lastReplyAt ===
                    "string"),
            ),
          )
        : {},

    scanInfo:
      safe.scanInfo &&
      typeof safe.scanInfo === "object" &&
      typeof safe.scanInfo.detectedType === "string" &&
      Array.isArray(safe.scanInfo.detectedTags) &&
      typeof safe.scanInfo.scannedFileCount === "number" &&
      typeof safe.scanInfo.importantFileCount === "number" &&
      typeof safe.scanInfo.excludedFileCount === "number" &&
      typeof safe.scanInfo.lastScannedAt === "string"
        ? {
            detectedType: safe.scanInfo.detectedType,
            detectedTags: safe.scanInfo.detectedTags.filter(
              (tag): tag is string => typeof tag === "string",
            ),
            scannedFileCount: safe.scanInfo.scannedFileCount,
            importantFileCount: safe.scanInfo.importantFileCount,
            excludedFileCount: safe.scanInfo.excludedFileCount,
            lastScannedAt: safe.scanInfo.lastScannedAt,
          }
        : undefined,

    scanInsights:
      safe.scanInsights &&
      typeof safe.scanInsights === "object" &&
      typeof safe.scanInsights.architecture === "string" &&
      (safe.scanInsights.likelyEntryPoint === undefined ||
        typeof safe.scanInsights.likelyEntryPoint === "string") &&
      Array.isArray(safe.scanInsights.likelyAuthFiles) &&
      Array.isArray(safe.scanInsights.likelyModelFiles) &&
      Array.isArray(safe.scanInsights.likelyConfigFiles) &&
      Array.isArray(safe.scanInsights.likelyDocs) &&
      typeof safe.scanInsights.confidence === "string" &&
      Array.isArray(safe.scanInsights.notes)
        ? {
            architecture: safe.scanInsights.architecture,
            likelyEntryPoint: safe.scanInsights.likelyEntryPoint,
            likelyAuthFiles: safe.scanInsights.likelyAuthFiles.filter(
              (item): item is string => typeof item === "string",
            ),
            likelyModelFiles: safe.scanInsights.likelyModelFiles.filter(
              (item): item is string => typeof item === "string",
            ),
            likelyConfigFiles: safe.scanInsights.likelyConfigFiles.filter(
              (item): item is string => typeof item === "string",
            ),
            likelyDocs: safe.scanInsights.likelyDocs.filter(
              (item): item is string => typeof item === "string",
            ),
            confidence:
              safe.scanInsights.confidence === "low" ||
              safe.scanInsights.confidence === "medium" ||
              safe.scanInsights.confidence === "high"
                ? safe.scanInsights.confidence
                : "low",
            notes: safe.scanInsights.notes.filter(
              (item): item is string => typeof item === "string",
            ),
          }
        : undefined,

    // Tracks whether key text fields were auto-filled or explicitly changed,
    // so rescans can preserve user edits by default.
    autoFillState,
  };
}

export function sanitizeForAiExport(project: ProjectMemory): ProjectMemory {
  const secretValuePattern =
    /(api[_-]?key|client[_-]?secret|private[_-]?key|bearer\s+[a-z0-9._-]+|password\s*[:=]|passwd\s*[:=]|token\s*[:=])/i;

  const envFilePattern =
    /(^|[\\/])(\.env|\.env\..+|secrets?\.|credentials?|id_rsa|id_dsa|.*\.pem|.*\.p12|.*\.key|.*\.pfx)$/i;

  const redactString = (value: string): string => {
    if (envFilePattern.test(value) || secretValuePattern.test(value)) {
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

    // Legacy field — redact value, keep undefined if not set
    linkedProjectPath: project.linkedProjectPath
      ? "[LOCAL PATH HIDDEN]"
      : undefined,

    linkedProjectName: project.linkedProjectName,

    // Strip the absolute path entirely — only expose hash + timestamp
    // so AIs can detect change without knowing the local folder path.
    linkedFolder: project.linkedFolder
      ? {
          path: "[LOCAL PATH HIDDEN]",
          lastScannedAt: project.linkedFolder.lastScannedAt,
          scanHash: project.linkedFolder.scanHash,
        }
      : undefined,

    importantAssets: project.importantAssets.map((asset) =>
      envFilePattern.test(asset) ? "[REDACTED]" : asset,
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

    scanInsights: project.scanInsights
      ? {
          ...project.scanInsights,
          architecture: redactString(project.scanInsights.architecture),
          likelyEntryPoint: project.scanInsights.likelyEntryPoint
            ? redactString(project.scanInsights.likelyEntryPoint)
            : undefined,
          likelyAuthFiles:
            project.scanInsights.likelyAuthFiles.map(redactString),
          likelyModelFiles:
            project.scanInsights.likelyModelFiles.map(redactString),
          likelyConfigFiles:
            project.scanInsights.likelyConfigFiles.map(redactString),
          likelyDocs: project.scanInsights.likelyDocs.map(redactString),
          notes: project.scanInsights.notes.map(redactString),
        }
      : undefined,
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
