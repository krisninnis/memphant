import { ProjectMemory } from "../../types/project";
import { saveProjectData } from "../../services/projectService";
import {
  mergeAiUpdateIntoProject,
  validateAiUpdate,
} from "../../services/aiUpdateService";
import { createSnapshot } from "../../utils/projectUtils";
import { ProjectBrainStateSetters } from "./types";
import { AIPlatform } from "../../config/aiPlatforms";

type ImportAiUpdateParams = Pick<
  ProjectBrainStateSetters,
  | "setSelectedProject"
  | "setAiImportText"
  | "setPreAiBackupProject"
  | "setMessage"
> & {
  selectedProject: ProjectMemory | null;
  aiImportText: string;
  targetPlatform: AIPlatform;
};

export async function importAiUpdateOperation({
  selectedProject,
  aiImportText,
  targetPlatform,
  setSelectedProject,
  setAiImportText,
  setPreAiBackupProject,
  setMessage,
}: ImportAiUpdateParams) {
  if (!selectedProject || !aiImportText.trim()) {
    setMessage("Paste an AI update first.");
    return;
  }

  try {
    const parsed = JSON.parse(aiImportText);

    if (!validateAiUpdate(parsed)) {
      throw new Error("Invalid AI update format");
    }

    setPreAiBackupProject(selectedProject);
    const updated = mergeAiUpdateIntoProject(selectedProject, aiImportText);

    const addedGoals = Array.isArray(parsed.add_goals)
      ? parsed.add_goals.length
      : 0;
    const addedRules = Array.isArray(parsed.add_rules)
      ? parsed.add_rules.length
      : 0;
    const addedDecisions = Array.isArray(parsed.add_decisions)
      ? parsed.add_decisions.length
      : 0;
    const addedNextSteps = Array.isArray(parsed.add_nextSteps)
      ? parsed.add_nextSteps.length
      : 0;
    const addedOpenQuestions = Array.isArray(parsed.add_openQuestions)
      ? parsed.add_openQuestions.length
      : 0;

    const newSnapshot = createSnapshot(updated);
    const existingSnapshots = updated.snapshots ?? [];
    const lastSnapshot = existingSnapshots[existingSnapshots.length - 1];

    const snapshotUpdatedProject =
      !lastSnapshot || lastSnapshot.hash !== newSnapshot.hash
        ? {
            ...updated,
            snapshots: [...existingSnapshots, newSnapshot],
          }
        : updated;

    const finalUpdatedProject: ProjectMemory = {
      ...snapshotUpdatedProject,
      platformState: {
        ...(snapshotUpdatedProject.platformState ?? {}),
        [targetPlatform]: {
          lastSentSnapshotId:
            snapshotUpdatedProject.platformState?.[targetPlatform]
              ?.lastSentSnapshotId ?? "",
          lastReplyAt: new Date().toISOString(),
        },
      },
    };

    await saveProjectData(finalUpdatedProject);
    setSelectedProject(finalUpdatedProject);
    setAiImportText("");
    setMessage(
      `Project updated from AI! Goals: ${addedGoals}, Rules: ${addedRules}, Decisions: ${addedDecisions}, Next Steps: ${addedNextSteps}, Open Questions: ${addedOpenQuestions}.`,
    );

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    setMessage(
      "That update doesn't look right. Please paste a valid Project Brain AI update.",
    );
  }
}

type RollbackAiUpdateParams = Pick<
  ProjectBrainStateSetters,
  "setSelectedProject" | "setPreAiBackupProject" | "setMessage"
> & {
  preAiBackupProject: ProjectMemory | null;
};

export function rollbackLastAiImportOperation({
  preAiBackupProject,
  setSelectedProject,
  setPreAiBackupProject,
  setMessage,
}: RollbackAiUpdateParams) {
  if (!preAiBackupProject) {
    setMessage("There isn't an AI update to undo.");
    return;
  }

  setSelectedProject(preAiBackupProject);
  setPreAiBackupProject(null);
  setMessage("Undone. The last AI update was rolled back.");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
