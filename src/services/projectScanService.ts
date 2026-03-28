import { ProjectMemory } from "../types/project";

const IGNORED_PATH_PARTS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "target",
  ".idea",
  ".vscode",
];

const IMPORTANT_FILE_PATTERNS = [
  "package.json",
  "readme.md",
  "src/main",
  "src/index",
  "src/app",
  "src-tauri/src/main.rs",
  "src-tauri/src/lib.rs",
  "vite.config",
  "tsconfig.json",
  "cargo.toml",
];

function shouldIgnorePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return IGNORED_PATH_PARTS.some((part) => normalized.includes(`/${part}/`));
}

function isImportantFile(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  return IMPORTANT_FILE_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}

export async function scanUploadedProjectFiles(
  selectedProject: ProjectMemory,
  files: FileList,
): Promise<{ updatedProject: ProjectMemory; detectedType: string }> {
  const allFileNames: string[] = [];
  const importantFileNames: string[] = [];
  let packageJson: Record<string, any> | null = null;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (file.name.includes(".env")) continue;

    const path = file.webkitRelativePath || file.name;

    if (shouldIgnorePath(`/${path}`)) continue;

    allFileNames.push(path);

    if (isImportantFile(path)) {
      importantFileNames.push(path);
    }

    if (file.name.toLowerCase() === "package.json") {
      try {
        const text = await file.text();
        packageJson = JSON.parse(text);
      } catch {
        console.warn("Failed to parse package.json");
      }
    }
  }

  let detectedType = "Unknown project";
  const detectedTags: string[] = [];

  if (packageJson) {
    const deps = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {}),
    };

    if (deps.react) {
      detectedType = "React App";
      detectedTags.push("react");
    }

    if (deps.phaser) {
      detectedType = "Phaser Game";
      detectedTags.push("phaser");
    }

    if (deps.next) {
      detectedType = "Next.js App";
      detectedTags.push("nextjs");
    }

    if (deps.express) {
      detectedType = "Node API";
      detectedTags.push("express");
    }

    if (deps.typescript || packageJson.type === "module") {
      detectedTags.push("typescript");
    }

    if (deps["@tauri-apps/api"] || deps["@tauri-apps/cli"]) {
      detectedType = "Tauri App";
      detectedTags.push("tauri");
    }

    detectedTags.push("node");
  }

  const importantAssetsToStore =
    importantFileNames.length > 0
      ? importantFileNames
      : allFileNames.slice(0, 25);

  const packageName =
    packageJson && typeof packageJson.name === "string"
      ? packageJson.name
      : null;

  const packageDescription =
    packageJson && typeof packageJson.description === "string"
      ? packageJson.description
      : null;

  const autoSummaryParts = [
    `Auto-detected project: ${detectedType}`,
    packageName ? `Package name: ${packageName}` : null,
    packageDescription ? `Description: ${packageDescription}` : null,
  ].filter(Boolean);

  const autoSummary = autoSummaryParts.join(". ");

  const updatedProject: ProjectMemory = {
    ...selectedProject,
    importantAssets: [
      ...new Set([
        ...selectedProject.importantAssets,
        ...importantAssetsToStore,
      ]),
    ],
    summary: selectedProject.summary || autoSummary,
    currentState:
      selectedProject.currentState || "Project structure uploaded and analysed",
    goals:
      selectedProject.goals.length === 0
        ? ["Understand and continue development of this project"]
        : selectedProject.goals,
    rules: [
      ...new Set([
        ...selectedProject.rules,
        ...detectedTags.map((tag) => `Detected tech tag: ${tag}`),
      ]),
    ],
    changelog: [
      ...selectedProject.changelog,
      {
        date: new Date().toISOString(),
        source: "system",
        description: `Project scanned (${detectedType}) with ${importantAssetsToStore.length} important files identified`,
      },
    ],
  };

  return { updatedProject, detectedType };
}
