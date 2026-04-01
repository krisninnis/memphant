import { ProjectMemory } from "../types/project";
import { createSnapshot } from "./projectUtils";

type ScanAnalysis = {
  detectedType: string;
  detectedTags: string[];
  likelyEntryPoint?: string;
  likelyAuthFiles: string[];
  likelyModelFiles: string[];
  likelyConfigFiles: string[];
  likelyDocs: string[];
  confidence: "low" | "medium" | "high";
  notes: string[];
};

type ScanMeta = {
  readme?: string;
  package_json?: {
    name?: string;
    description?: string;
  };
  cargo_toml?: {
    name?: string;
  };
};

export function analyseScannedFiles(files: string[]): ScanAnalysis {
  const lowerFiles = files.map((file) => file.toLowerCase());
  const detectedTags: string[] = [];

  if (lowerFiles.some((file) => file.includes("package.json"))) {
    detectedTags.push("node");
  }

  if (
    lowerFiles.some(
      (file) => file.includes("server.js") || file.includes("server.ts"),
    )
  ) {
    detectedTags.push("server");
  }

  if (
    lowerFiles.some(
      (file) =>
        file.includes("app.tsx") ||
        file.includes("app.jsx") ||
        file.includes("react"),
    )
  ) {
    detectedTags.push("react");
  }

  if (
    lowerFiles.some(
      (file) => file.includes("src-tauri") || file.includes("main.rs"),
    )
  ) {
    detectedTags.push("tauri");
  }

  if (
    lowerFiles.some(
      (file) =>
        file.includes("controller") ||
        file.includes("model") ||
        file.includes("route"),
    )
  ) {
    detectedTags.push("backend");
  }

  const detectedType = detectedTags.includes("tauri")
    ? "Tauri App"
    : detectedTags.includes("react")
      ? "React App"
      : detectedTags.includes("server")
        ? "Node Backend"
        : detectedTags.includes("node")
          ? "Node Project"
          : "Scanned Project";

  const likelyEntryPoint =
    files.find((file) =>
      /(^|[\\/])(server\.js|server\.ts|main\.js|main\.ts|main\.rs|app\.js|app\.ts|app\.tsx)$/i.test(
        file,
      ),
    ) || undefined;

  const likelyAuthFiles = files.filter((file) =>
    /(auth|middleware)/i.test(file),
  );

  const likelyModelFiles = files.filter((file) =>
    /(model|models[\\/])/i.test(file),
  );

  const likelyConfigFiles = files.filter((file) =>
    /(package\.json|package-lock\.json|tsconfig\.json|vite\.config|cargo\.toml|next\.config|dockerfile|vercel\.json|netlify\.toml)/i.test(
      file,
    ),
  );

  const likelyDocs = files.filter((file) =>
    /(readme\.md|readme\.txt|structure\.txt|files\.txt)/i.test(file),
  );

  const notes: string[] = [
    `Detected ${detectedType}.`,
    likelyEntryPoint
      ? `Likely entry point: ${likelyEntryPoint}.`
      : "No clear entry point detected.",
    likelyAuthFiles.length > 0
      ? `Found ${likelyAuthFiles.length} likely auth or middleware files.`
      : "No likely auth files detected.",
    likelyModelFiles.length > 0
      ? `Found ${likelyModelFiles.length} likely model files.`
      : "No likely model files detected.",
  ];

  const confidence =
    files.length >= 10 && detectedTags.length >= 2
      ? "high"
      : files.length >= 5
        ? "medium"
        : "low";

  return {
    detectedType,
    detectedTags,
    likelyEntryPoint,
    likelyAuthFiles,
    likelyModelFiles,
    likelyConfigFiles,
    likelyDocs,
    confidence,
    notes,
  };
}

function computeClientScanHash(files: string[]): string {
  const sorted = [...files].sort();
  const raw = sorted.join("|") + "|count:" + files.length;
  let hash = 5381;

  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 33) ^ raw.charCodeAt(i);
    hash = hash >>> 0;
  }

  return hash.toString(16).padStart(8, "0").slice(0, 12);
}

function getFolderNameFromPath(folderPath: string): string | undefined {
  const normalizedPath = folderPath.replace(/\\/g, "/");
  return normalizedPath.split("/").filter(Boolean).pop() || undefined;
}

function getFirstNonEmptyReadmeLine(readme?: string): string | undefined {
  if (!readme || typeof readme !== "string") return undefined;

  const firstLine = readme
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine || undefined;
}

function stripMarkdownHeadingPrefix(value: string): string {
  return value.replace(/^#+\s*/, "").trim();
}

export function buildProjectFromScan(params: {
  selectedProject: ProjectMemory;
  folderPath: string;
  files: string[];
  scanHash?: string;
  meta?: ScanMeta;
}): ProjectMemory {
  const { selectedProject, folderPath, files, scanHash, meta } = params;

  const limitedFiles = files.slice(0, 200);
  const now = new Date().toISOString();

  const folderName =
    getFolderNameFromPath(folderPath) || selectedProject.projectName;

  const packageName =
    typeof meta?.package_json?.name === "string" &&
    meta.package_json.name.trim().length > 0
      ? meta.package_json.name.trim()
      : undefined;

  const cargoName =
    typeof meta?.cargo_toml?.name === "string" &&
    meta.cargo_toml.name.trim().length > 0
      ? meta.cargo_toml.name.trim()
      : undefined;

  const derivedProjectName =
    packageName || cargoName || folderName || "Imported Project";

  const derivedProjectNameSource = packageName
    ? "scan_package"
    : cargoName
      ? "scan_package"
      : "scan_folder";

  const analysis = analyseScannedFiles(limitedFiles);

  const computedHash = scanHash ?? computeClientScanHash(limitedFiles);

  const linkedFolder = {
    path: folderPath,
    lastScannedAt: now,
    scanHash: computedHash,
  };

  const readmeSummaryLine = getFirstNonEmptyReadmeLine(meta?.readme);
  const cleanedReadmeSummary = readmeSummaryLine
    ? stripMarkdownHeadingPrefix(readmeSummaryLine)
    : undefined;

  const packageDescription =
    typeof meta?.package_json?.description === "string" &&
    meta.package_json.description.trim().length > 0
      ? meta.package_json.description.trim()
      : undefined;

  const existingSummary = selectedProject.summary.trim();
  const existingCurrentState = selectedProject.currentState.trim();

  const shouldAutoFillSummary =
    existingSummary.length === 0 ||
    selectedProject.autoFillState?.summary === "scan";

  const shouldAutoFillCurrentState =
    existingCurrentState.length === 0 ||
    existingCurrentState === "Project created" ||
    selectedProject.autoFillState?.currentState === "scan";

  const autoSummaryFallback = `Auto-detected ${analysis.detectedType} with ${limitedFiles.length} useful files prepared for AI handoff.`;

  const autoSummary =
    packageDescription || cleanedReadmeSummary || autoSummaryFallback;

  const autoCurrentState = `Project folder scanned successfully. ${limitedFiles.length} useful files were identified and prepared for handoff.`;

  const nextSummary = shouldAutoFillSummary
    ? autoSummary
    : selectedProject.summary;
  const nextCurrentState = shouldAutoFillCurrentState
    ? autoCurrentState
    : selectedProject.currentState;

  const nextProjectName =
    selectedProject.projectNameSource === "user" &&
    selectedProject.projectName.trim().length > 0
      ? selectedProject.projectName
      : derivedProjectName;

  const nextProjectNameSource =
    selectedProject.projectNameSource === "user"
      ? "user"
      : derivedProjectNameSource;

  const scanInfoBlock = {
    detectedType: analysis.detectedType,
    detectedTags: analysis.detectedTags,
    scannedFileCount: files.length,
    importantFileCount: limitedFiles.length,
    excludedFileCount: Math.max(files.length - limitedFiles.length, 0),
    lastScannedAt: now,
  };

  const scanInsightsBlock = {
    architecture: analysis.detectedType,
    likelyEntryPoint: analysis.likelyEntryPoint,
    likelyAuthFiles: analysis.likelyAuthFiles,
    likelyModelFiles: analysis.likelyModelFiles,
    likelyConfigFiles: analysis.likelyConfigFiles,
    likelyDocs: analysis.likelyDocs,
    confidence: analysis.confidence,
    notes: analysis.notes,
  };

  const nextAutoFillState = {
    ...selectedProject.autoFillState,
    summary: shouldAutoFillSummary
      ? ("scan" as const)
      : (selectedProject.autoFillState?.summary ?? "user"),
    currentState: shouldAutoFillCurrentState
      ? ("scan" as const)
      : (selectedProject.autoFillState?.currentState ?? "user"),
  };

  const newSnapshot = createSnapshot({
    ...selectedProject,
    projectName: nextProjectName,
    projectNameSource: nextProjectNameSource,
    summary: nextSummary,
    currentState: nextCurrentState,
    importantAssets: limitedFiles,
    linkedProjectPath: folderPath,
    linkedProjectName: folderName,
    linkedFolder,
    scanInfo: scanInfoBlock,
    scanInsights: scanInsightsBlock,
    autoFillState: nextAutoFillState,
  });

  const existingSnapshots = selectedProject.snapshots ?? [];
  const lastSnapshot = existingSnapshots[existingSnapshots.length - 1];
  const shouldAddSnapshot =
    !lastSnapshot || lastSnapshot.hash !== newSnapshot.hash;

  return {
    ...selectedProject,
    projectName: nextProjectName,
    projectNameSource: nextProjectNameSource,
    lastModified: now,
    summary: nextSummary,
    currentState: nextCurrentState,
    importantAssets: limitedFiles,

    // Legacy compatibility fields — still written for now.
    linkedProjectPath: folderPath,
    linkedProjectName: folderName,

    // New primary source of truth.
    linkedFolder,

    scanInfo: scanInfoBlock,
    scanInsights: scanInsightsBlock,
    autoFillState: nextAutoFillState,

    snapshots: shouldAddSnapshot
      ? [...existingSnapshots, newSnapshot]
      : existingSnapshots,

    changelog: [
      ...selectedProject.changelog,
      {
        date: now,
        source: "system",
        description: `Project folder scanned and linked to ${folderName}`,
      },
    ],
  };
}
