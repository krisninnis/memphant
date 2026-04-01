import { ProjectMemory } from "../../types/project";
import { saveProjectData } from "../../services/projectService";
import { AIPlatform } from "../../config/aiPlatforms";
import { ProjectBrainStateSetters } from "./types";

type HandleCopyToClipboardParams = Pick<
  ProjectBrainStateSetters,
  "setSelectedProject" | "setMessage"
> & {
  selectedProject: ProjectMemory | null;
  exportPrompt: string;
  targetPlatform: AIPlatform;
  targetPlatformLabel: string;
};

export async function handleCopyToClipboardOperation({
  selectedProject,
  exportPrompt,
  targetPlatform,
  targetPlatformLabel,
  setSelectedProject,
  setMessage,
}: HandleCopyToClipboardParams) {
  if (!selectedProject) return;

  try {
    await navigator.clipboard.writeText(exportPrompt);

    const snapshots = selectedProject.snapshots ?? [];
    const lastSnapshot = snapshots[snapshots.length - 1];

    if (lastSnapshot) {
      const updatedProject: ProjectMemory = {
        ...selectedProject,
        platformState: {
          ...(selectedProject.platformState ?? {}),
          [targetPlatform]: {
            lastSentSnapshotId: lastSnapshot.id,
            lastReplyAt:
              selectedProject.platformState?.[targetPlatform]?.lastReplyAt,
          },
        },
      };

      await saveProjectData(updatedProject);
      setSelectedProject(updatedProject);
    }

    setMessage(
      `Copied! Open ${targetPlatformLabel} and paste this in to continue your project.`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch {
    setMessage("We couldn't copy that text. Please try again.");
  }
}
