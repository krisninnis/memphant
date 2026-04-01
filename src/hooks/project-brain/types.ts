import { Dispatch, RefObject, SetStateAction } from "react";
import { AIPlatform } from "../../config/aiPlatforms";
import { ProjectMemory } from "../../types/project";

export type ScanProjectFolderResult = {
  files: string[];
  scan_hash: string;
  meta?: {
    readme?: string;
    package_json?: {
      name?: string;
      description?: string;
    };
    cargo_toml?: {
      name?: string;
    };
  };
};

export type RescanLinkedFolderResult = {
  files: string[];
  scan_hash: string;
  folder_exists: boolean;
  meta?: {
    readme?: string;
    package_json?: {
      name?: string;
      description?: string;
    };
    cargo_toml?: {
      name?: string;
    };
  };
};

export type ProjectBrainStateSetters = {
  setProjects: Dispatch<SetStateAction<string[]>>;
  setProjectName: Dispatch<SetStateAction<string>>;
  setMessage: Dispatch<SetStateAction<string>>;
  setSelectedProject: Dispatch<SetStateAction<ProjectMemory | null>>;
  setPage: Dispatch<SetStateAction<"home" | "projects" | "editor">>;
  setAiImportText: Dispatch<SetStateAction<string>>;
  setPreAiBackupProject: Dispatch<SetStateAction<ProjectMemory | null>>;
};

export type ProjectBrainSharedRefs = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  projectNameInputRef: RefObject<HTMLInputElement | null>;
};

export type SharedProjectContext = ProjectBrainStateSetters & {
  selectedProject: ProjectMemory | null;
  targetPlatform: AIPlatform;
};
