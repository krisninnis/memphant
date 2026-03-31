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
  "coverage",
  "out",
  "bin",
  "obj",
];

const SENSITIVE_FILE_PATTERNS = [
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  "id_rsa",
  "id_dsa",
  "credentials",
  "secret",
  "secrets",
  "token",
  "tokens",
  "auth",
  "private",
];

const IMPORTANT_FILE_PATTERNS = [
  "package.json",
  "package-lock.json",
  "readme.md",
  "readme.txt",
  "src/main",
  "src/index",
  "src/app",
  "src-tauri/src/main.rs",
  "src-tauri/src/lib.rs",
  "vite.config",
  "tsconfig.json",
  "cargo.toml",
  "tauri.conf",
  "next.config",
  "vercel.json",
  "netlify.toml",
  "dockerfile",
];

const SOURCE_FILE_PATTERNS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".rs",
  ".py",
  ".java",
  ".cs",
  ".go",
  ".php",
  ".rb",
  ".swift",
  ".kt",
  ".cpp",
  ".c",
  ".h",
  ".sql",
  ".html",
  ".css",
  ".scss",
  ".json",
  ".yml",
  ".yaml",
  ".md",
];

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

function shouldIgnorePath(path: string): boolean {
  const normalized = normalizePath(path);
  return IGNORED_PATH_PARTS.some(
    (part) =>
      normalized.includes(`/${part}/`) ||
      normalized.startsWith(`${part}/`) ||
      normalized === part,
  );
}

function isSensitiveFile(path: string): boolean {
  const normalized = normalizePath(path);
  return SENSITIVE_FILE_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}

function isImportantFile(path: string): boolean {
  const normalized = normalizePath(path);
  return IMPORTANT_FILE_PATTERNS.some((pattern) =>
    normalized.includes(pattern),
  );
}

function looksLikeSourceFile(path: string): boolean {
  const normalized = normalizePath(path);
  return SOURCE_FILE_PATTERNS.some((pattern) => normalized.endsWith(pattern));
}

function detectProjectType(
  packageJson: Record<string, unknown> | null,
  fileNames: string[],
): { detectedType: string; detectedTags: string[] } {
  const detectedTags: string[] = [];
  let detectedType = "Software Project";

  const normalizedFiles = fileNames.map(normalizePath);

  const hasFile = (match: string) =>
    normalizedFiles.some((file) => file.includes(match.toLowerCase()));

  if (packageJson) {
    const deps = {
      ...((packageJson.dependencies as Record<string, unknown>) || {}),
      ...((packageJson.devDependencies as Record<string, unknown>) || {}),
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
      detectedTags.push("express");
      if (detectedType === "Software Project") {
        detectedType = "Node API";
      }
    }

    if (deps["@tauri-apps/api"] || deps["@tauri-apps/cli"]) {
      detectedType = "Tauri App";
      detectedTags.push("tauri");
    }

    if (deps.typescript) {
      detectedTags.push("typescript");
    }

    if (
      typeof packageJson.type === "string" &&
      packageJson.type.toLowerCase() === "module"
    ) {
      detectedTags.push("esm");
    }

    detectedTags.push("node");
  }

  if (hasFile("cargo.toml")) {
    detectedTags.push("rust");
    if (detectedType === "Software Project") {
      detectedType = "Rust Project";
    }
  }

  if (hasFile("src-tauri/")) {
    detectedTags.push("tauri");
    detectedType = "Tauri App";
  }

  if (hasFile("vite.config")) {
    detectedTags.push("vite");
  }

  if (hasFile("dockerfile")) {
    detectedTags.push("docker");
  }

  if (hasFile("readme.md")) {
    detectedTags.push("documentation");
  }

  return {
    detectedType,
    detectedTags: [...new Set(detectedTags)],
  };
}

function buildAutoSummary(params: {
  detectedType: string;
  packageName: string | null;
  packageDescription: string | null;
  fileCount: number;
  importantFileCount: number;
  detectedTags: string[];
}): string {
  const {
    detectedType,
    packageName,
    packageDescription,
    fileCount,
    importantFileCount,
    detectedTags,
  } = params;

  const lines = [
    `Auto-detected project type: ${detectedType}.`,
    packageName ? `Project/package name: ${packageName}.` : null,
    packageDescription ? `Description: ${packageDescription}.` : null,
    `Scanned ${fileCount} files and identified ${importantFileCount} important files for AI handoff.`,
    detectedTags.length > 0
      ? `Detected stack/context tags: ${detectedTags.join(", ")}.`
      : null,
  ].filter(Boolean);

  return lines.join(" ");
}

function buildAutoCurrentState(params: {
  detectedType: string;
  importantFileCount: number;
  selectedImportantFiles: string[];
}): string {
  const { detectedType, importantFileCount, selectedImportantFiles } = params;

  const topFiles =
    selectedImportantFiles.length > 0
      ? selectedImportantFiles.slice(0, 5).join(", ")
      : "No key files identified yet";

  return [
    `Project folder scanned and analysed as a ${detectedType}.`,
    `${importantFileCount} important files were identified for handoff context.`,
    `Key files include: ${topFiles}.`,
    `Project Brain is ready to prepare context for another AI platform based on this scan.`,
  ].join(" ");
}

export async function scanUploadedProjectFiles(
  selectedProject: ProjectMemory,
  files: FileList,
): Promise<{ updatedProject: ProjectMemory; detectedType: string }> {
  const allFileNames: string[] = [];
  const importantFileNames: string[] = [];
  const sourceFileNames: string[] = [];
  let packageJson: Record<string, unknown> | null = null;
  let excludedFileCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = file.webkitRelativePath || file.name;

    if (isSensitiveFile(path)) {
      excludedFileCount++;
      continue;
    }

    if (shouldIgnorePath(path)) {
      excludedFileCount++;
      continue;
    }

    allFileNames.push(path);

    if (isImportantFile(path)) {
      importantFileNames.push(path);
    }

    if (looksLikeSourceFile(path)) {
      sourceFileNames.push(path);
    }

    if (file.name.toLowerCase() === "package.json") {
      try {
        const text = await file.text();
        packageJson = JSON.parse(text) as Record<string, unknown>;
      } catch {
        console.warn("Failed to parse package.json");
      }
    }
  }

  const { detectedType, detectedTags } = detectProjectType(
    packageJson,
    allFileNames,
  );

  const selectedImportantFiles =
    importantFileNames.length > 0
      ? importantFileNames.slice(0, 25)
      : sourceFileNames.slice(0, 25);

  const packageName =
    packageJson && typeof packageJson.name === "string"
      ? packageJson.name
      : null;

  const packageDescription =
    packageJson && typeof packageJson.description === "string"
      ? packageJson.description
      : null;

  const autoSummary = buildAutoSummary({
    detectedType,
    packageName,
    packageDescription,
    fileCount: allFileNames.length,
    importantFileCount: selectedImportantFiles.length,
    detectedTags,
  });

  const autoCurrentState = buildAutoCurrentState({
    detectedType,
    importantFileCount: selectedImportantFiles.length,
    selectedImportantFiles,
  });

  const updatedProject: ProjectMemory = {
    ...selectedProject,
    importantAssets: [
      ...new Set([
        ...selectedProject.importantAssets,
        ...selectedImportantFiles,
      ]),
    ],
    summary: selectedProject.summary.trim()
      ? selectedProject.summary
      : autoSummary,
    currentState: selectedProject.currentState.trim()
      ? selectedProject.currentState
      : autoCurrentState,
    goals:
      selectedProject.goals.length > 0
        ? selectedProject.goals
        : [
            "Understand the project structure and continue work safely across AI platforms",
            "Prepare a clear handoff so another AI can continue from the correct project state",
          ],
    rules: [
      ...new Set([
        ...selectedProject.rules,
        "Do not expose secrets, tokens, passwords, or .env values in AI handoffs",
        ...detectedTags.map((tag) => `Detected tech tag: ${tag}`),
      ]),
    ],
    scanInfo: {
      detectedType,
      detectedTags,
      scannedFileCount: allFileNames.length,
      importantFileCount: selectedImportantFiles.length,
      excludedFileCount,
      lastScannedAt: new Date().toISOString(),
    },
    changelog: [
      ...selectedProject.changelog,
      {
        date: new Date().toISOString(),
        source: "system",
        description: `Project scanned (${detectedType}) and handoff context rebuilt from ${selectedImportantFiles.length} important files`,
      },
    ],
  };

  return { updatedProject, detectedType };
}
