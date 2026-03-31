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

export function buildProjectFromScan(params: {
  selectedProject: ProjectMemory;
  folderPath: string;
  files: string[];
}): ProjectMemory {
  const { selectedProject, folderPath, files } = params;

  const limitedFiles = files.slice(0, 200);
  const now = new Date().toISOString();

  const normalizedPath = folderPath.replace(/\\/g, "/");
  const linkedProjectName =
    normalizedPath.split("/").filter(Boolean).pop() ||
    selectedProject.projectName;

  const analysis = analyseScannedFiles(limitedFiles);

  const autoSummary =
    selectedProject.summary.trim().length > 0
      ? selectedProject.summary
      : `Auto-detected ${analysis.detectedType} with ${limitedFiles.length} useful files prepared for AI handoff.`;

  const autoCurrentState =
    selectedProject.currentState.trim().length > 0 &&
    selectedProject.currentState !== "Project created"
      ? selectedProject.currentState
      : `Project folder scanned successfully. ${limitedFiles.length} useful files were identified and prepared for handoff.`;

  const newSnapshot = createSnapshot({
    ...selectedProject,
    summary: autoSummary,
    currentState: autoCurrentState,
    importantAssets: limitedFiles,
    linkedProjectPath: folderPath,
    linkedProjectName,
    scanInfo: {
      detectedType: analysis.detectedType,
      detectedTags: analysis.detectedTags,
      scannedFileCount: files.length,
      importantFileCount: limitedFiles.length,
      excludedFileCount: Math.max(files.length - limitedFiles.length, 0),
      lastScannedAt: now,
    },
    scanInsights: {
      architecture: analysis.detectedType,
      likelyEntryPoint: analysis.likelyEntryPoint,
      likelyAuthFiles: analysis.likelyAuthFiles,
      likelyModelFiles: analysis.likelyModelFiles,
      likelyConfigFiles: analysis.likelyConfigFiles,
      likelyDocs: analysis.likelyDocs,
      confidence: analysis.confidence,
      notes: analysis.notes,
    },
  });

  const existingSnapshots = selectedProject.snapshots ?? [];
  const lastSnapshot = existingSnapshots[existingSnapshots.length - 1];
  const shouldAddSnapshot =
    !lastSnapshot || lastSnapshot.hash !== newSnapshot.hash;

  return {
    ...selectedProject,
    lastModified: now,
    summary: autoSummary,
    currentState: autoCurrentState,
    importantAssets: limitedFiles,
    linkedProjectPath: folderPath,
    linkedProjectName,
    scanInfo: {
      detectedType: analysis.detectedType,
      detectedTags: analysis.detectedTags,
      scannedFileCount: files.length,
      importantFileCount: limitedFiles.length,
      excludedFileCount: Math.max(files.length - limitedFiles.length, 0),
      lastScannedAt: now,
    },
    scanInsights: {
      architecture: analysis.detectedType,
      likelyEntryPoint: analysis.likelyEntryPoint,
      likelyAuthFiles: analysis.likelyAuthFiles,
      likelyModelFiles: analysis.likelyModelFiles,
      likelyConfigFiles: analysis.likelyConfigFiles,
      likelyDocs: analysis.likelyDocs,
      confidence: analysis.confidence,
      notes: analysis.notes,
    },
    snapshots: shouldAddSnapshot
      ? [...existingSnapshots, newSnapshot]
      : existingSnapshots,
    changelog: [
      ...selectedProject.changelog,
      {
        date: now,
        source: "system",
        description: `Project folder scanned and linked to ${linkedProjectName}`,
      },
    ],
  };
}
