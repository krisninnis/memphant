/**
 * GitHub Repository Scanner
 *
 * Fetches key files from a public GitHub repo using the GitHub raw content CDN
 * and the GitHub REST API (no auth required for public repos).
 *
 * Philosophy:
 *   - Extract SIGNALS, not raw code
 *   - Never read .env, secrets, build artifacts, or binaries
 *   - Mark inferences clearly so users know what was assumed vs confirmed
 *   - Be additive: the result feeds INTO the project, not over it
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GitHubScanResult {
  repoUrl: string;
  repoName: string;
  repoDescription: string | null;
  primaryLanguage: string | null;
  detectedStack: string[];
  extractedSummary: string;
  extractedCurrentState: string;
  keyFiles: string[];
  suggestedGoals: string[];
  suggestedNextSteps: string[];
  suggestedOpenQuestions: string[];
  inferredDecisions: Array<{ decision: string; rationale: string }>;
  scannedAt: string;
  warnings: string[];
}

interface RepoMeta {
  name: string;
  description: string | null;
  language: string | null;
  topics: string[];
  default_branch: string;
  stargazers_count: number;
  has_issues: boolean;
  private: boolean;
}

// ─── URL Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse a GitHub URL into owner + repo.
 * Handles: https://github.com/owner/repo, github.com/owner/repo, git@github.com:owner/repo.git
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const clean = url.trim().replace(/\.git$/, '').replace(/\/$/, '');
    const match = clean.match(/github\.com[/:@]([^/:\s]+)[/:]([^/\s?#]+)/i);
    if (!match) return null;
    const owner = match[1];
    const repo = match[2];
    if (!owner || !repo) return null;
    return { owner, repo };
  } catch {
    return null;
  }
}

// ─── File Fetching ────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000;

/** Fetch a raw file from GitHub. Returns null on any error or if file is missing. */
async function fetchRaw(owner: string, repo: string, path: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`,
      { signal: controller.signal },
    );
    clearTimeout(timer);

    if (!res.ok) return null;
    const text = await res.text();

    // Skip binary content (null bytes are a good signal)
    if (text.includes('\x00')) return null;

    // Truncate very large files — we only need signals, not full content
    return text.length > 60_000 ? text.slice(0, 60_000) : text;
  } catch {
    return null;
  }
}

/** Fetch repo metadata from the GitHub REST API. */
async function fetchRepoMeta(owner: string, repo: string): Promise<RepoMeta | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: controller.signal,
      },
    );
    clearTimeout(timer);

    if (!res.ok) return null;
    return (await res.json()) as RepoMeta;
  } catch {
    return null;
  }
}

// ─── Files to scan ───────────────────────────────────────────────────────────
// Ordered by signal value. We never read .env, node_modules, dist, or binaries.

const CANDIDATE_FILES = [
  // Documentation
  'README.md', 'readme.md', 'README.mdx', 'README.rst',
  'CHANGELOG.md', 'CHANGES.md', 'HISTORY.md',
  'TODO.md', 'ROADMAP.md', 'CONTRIBUTING.md',
  // JavaScript / TypeScript ecosystem
  'package.json',
  'tsconfig.json',
  'vite.config.ts', 'vite.config.js',
  'next.config.ts', 'next.config.js', 'next.config.mjs',
  'tailwind.config.ts', 'tailwind.config.js',
  // Rust
  'Cargo.toml',
  'src-tauri/tauri.conf.json',
  // Python
  'requirements.txt', 'pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile',
  // Go
  'go.mod',
  // PHP
  'composer.json',
  // Ruby
  'Gemfile',
  // Java / Kotlin / Android
  'build.gradle', 'build.gradle.kts', 'pom.xml',
  // .NET
  'global.json',
  // Containerisation / infra
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
  '.github/workflows/ci.yml', '.github/workflows/main.yml',
  'vercel.json', 'netlify.toml', 'fly.toml',
  // Config
  '.eslintrc.json', '.prettierrc', 'biome.json',
];

// ─── Stack Detection ──────────────────────────────────────────────────────────

function detectStack(files: Record<string, string | null>): string[] {
  const stack = new Set<string>();

  // ── Rust ──
  if (files['Cargo.toml']) {
    stack.add('Rust');
    const c = files['Cargo.toml'] ?? '';
    if (c.includes('tauri')) stack.add('Tauri');
    if (c.match(/axum|actix|rocket|warp|poem/)) stack.add('Rust Web Server');
    if (c.includes('tokio')) stack.add('Tokio (async Rust)');
    if (c.includes('sqlx') || c.includes('diesel')) stack.add('Rust ORM/SQL');
  }

  // ── Python ──
  const pyManifest = files['requirements.txt'] ?? files['pyproject.toml'] ?? files['setup.py'] ?? files['Pipfile'] ?? '';
  if (pyManifest) {
    stack.add('Python');
    if (pyManifest.match(/django/i)) stack.add('Django');
    if (pyManifest.match(/fastapi/i)) stack.add('FastAPI');
    if (pyManifest.match(/flask/i)) stack.add('Flask');
    if (pyManifest.match(/aiohttp/i)) stack.add('aiohttp');
    if (pyManifest.match(/pandas/i)) stack.add('pandas');
    if (pyManifest.match(/numpy/i)) stack.add('NumPy');
    if (pyManifest.match(/torch|pytorch/i)) stack.add('PyTorch');
    if (pyManifest.match(/tensorflow/i)) stack.add('TensorFlow');
    if (pyManifest.match(/scikit[-_]learn|sklearn/i)) stack.add('scikit-learn');
    if (pyManifest.match(/sqlalchemy/i)) stack.add('SQLAlchemy');
    if (pyManifest.match(/celery/i)) stack.add('Celery');
    if (pyManifest.match(/pydantic/i)) stack.add('Pydantic');
    if (pyManifest.match(/langchain/i)) stack.add('LangChain');
    if (pyManifest.match(/openai/i)) stack.add('OpenAI SDK');
    if (pyManifest.match(/anthropic/i)) stack.add('Anthropic SDK');
  }

  // ── Go ──
  if (files['go.mod']) {
    stack.add('Go');
    const g = files['go.mod'] ?? '';
    if (g.match(/gin-gonic|\/gin/)) stack.add('Gin');
    if (g.match(/labstack\/echo/)) stack.add('Echo');
    if (g.match(/gofiber\/fiber/)) stack.add('Fiber');
    if (g.match(/chi\b/)) stack.add('chi');
  }

  if (files['composer.json']) stack.add('PHP');
  if (files['Gemfile']) stack.add('Ruby');
  if (files['build.gradle'] || files['build.gradle.kts'] || files['pom.xml']) stack.add('JVM (Java/Kotlin)');

  // ── Infra ──
  if (files['Dockerfile']) stack.add('Docker');
  if (files['docker-compose.yml'] || files['docker-compose.yaml']) stack.add('Docker Compose');
  if (files['.github/workflows/ci.yml'] || files['.github/workflows/main.yml']) stack.add('GitHub Actions CI');
  if (files['vercel.json']) stack.add('Vercel');
  if (files['netlify.toml']) stack.add('Netlify');
  if (files['fly.toml']) stack.add('Fly.io');

  // ── JavaScript / TypeScript ecosystem ──
  const pkg = files['package.json'];
  if (pkg) {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(pkg); } catch { /* ignore */ }

    const allDeps: Record<string, string> = {
      ...(parsed.dependencies as Record<string, string> ?? {}),
      ...(parsed.devDependencies as Record<string, string> ?? {}),
      ...(parsed.peerDependencies as Record<string, string> ?? {}),
    };
    const keys = new Set(Object.keys(allDeps));

    // Language
    if (keys.has('typescript') || files['tsconfig.json']) stack.add('TypeScript');

    // UI frameworks
    if (keys.has('react') || keys.has('react-dom')) stack.add('React');
    if (keys.has('vue')) stack.add('Vue');
    if (keys.has('svelte')) stack.add('@sveltejs/kit' in allDeps ? 'SvelteKit' : 'Svelte');
    if (keys.has('solid-js')) stack.add('SolidJS');
    if (keys.has('@angular/core')) stack.add('Angular');

    // Meta-frameworks
    if (keys.has('next')) stack.add('Next.js');
    if (keys.has('nuxt') || keys.has('nuxt3') || keys.has('@nuxt/core')) stack.add('Nuxt');
    if (keys.has('@remix-run/react') || keys.has('remix')) stack.add('Remix');
    if (keys.has('gatsby')) stack.add('Gatsby');
    if (keys.has('astro')) stack.add('Astro');
    if (keys.has('@builder.io/qwik')) stack.add('Qwik');

    // Backend / fullstack
    if (keys.has('express')) stack.add('Express.js');
    if (keys.has('fastify')) stack.add('Fastify');
    if (keys.has('hono')) stack.add('Hono');
    if (keys.has('koa')) stack.add('Koa');
    if (keys.has('@nestjs/core')) stack.add('NestJS');
    if (keys.has('elysia')) stack.add('Elysia (Bun)');

    // Desktop
    if (keys.has('@tauri-apps/api') || keys.has('@tauri-apps/cli')) stack.add('Tauri');
    if (keys.has('electron')) stack.add('Electron');

    // Build tools
    if (keys.has('vite')) stack.add('Vite');
    if (keys.has('webpack')) stack.add('Webpack');
    if (keys.has('turbo') || keys.has('turborepo')) stack.add('Turborepo');
    if (keys.has('@biomejs/biome')) stack.add('Biome');

    // Testing
    if (keys.has('vitest')) stack.add('Vitest');
    if (keys.has('jest') || keys.has('@jest/core')) stack.add('Jest');
    if (keys.has('@playwright/test')) stack.add('Playwright');
    if (keys.has('cypress')) stack.add('Cypress');

    // State management
    if (keys.has('zustand')) stack.add('Zustand');
    if (keys.has('@reduxjs/toolkit')) stack.add('Redux Toolkit');
    if (keys.has('@tanstack/query') || keys.has('react-query')) stack.add('TanStack Query');
    if (keys.has('jotai')) stack.add('Jotai');
    if (keys.has('recoil')) stack.add('Recoil');
    if (keys.has('nanostores')) stack.add('Nano Stores');

    // Database / ORM
    if (keys.has('@prisma/client')) stack.add('Prisma');
    if (keys.has('drizzle-orm')) stack.add('Drizzle ORM');
    if (keys.has('mongoose')) stack.add('MongoDB/Mongoose');
    if (keys.has('pg') || keys.has('postgres')) stack.add('PostgreSQL');
    if (keys.has('better-sqlite3') || keys.has('sqlite3')) stack.add('SQLite');

    // Auth / BaaS
    if (keys.has('@supabase/supabase-js')) stack.add('Supabase');
    if (keys.has('firebase') || keys.has('@firebase/app')) stack.add('Firebase');
    if (keys.has('next-auth') || keys.has('@auth/core')) stack.add('Auth.js');
    if (keys.has('@clerk/nextjs') || keys.has('@clerk/clerk-react')) stack.add('Clerk');
    if (keys.has('@convex-dev/react') || keys.has('convex')) stack.add('Convex');

    // Styling
    if (keys.has('tailwindcss')) stack.add('Tailwind CSS');
    if (keys.has('@emotion/react')) stack.add('Emotion');
    if (keys.has('styled-components')) stack.add('styled-components');
    if (keys.has('shadcn-ui') || keys.has('@radix-ui/react-dialog')) stack.add('shadcn/ui + Radix');

    // AI / LLM
    if (keys.has('openai')) stack.add('OpenAI SDK');
    if (keys.has('@anthropic-ai/sdk')) stack.add('Anthropic SDK');
    if (keys.has('langchain') || keys.has('@langchain/core')) stack.add('LangChain.js');
    if (keys.has('ai') && keys.has('@ai-sdk/openai')) stack.add('Vercel AI SDK');

    // Payments
    if (keys.has('stripe')) stack.add('Stripe');

    // Deployment / Infra (from package.json scripts)
    const scripts = parsed.scripts as Record<string, string> ?? {};
    if (JSON.stringify(scripts).includes('wrangler')) stack.add('Cloudflare Workers');
  }

  return Array.from(stack);
}

// ─── README Signal Extraction ─────────────────────────────────────────────────

function extractFromReadme(content: string | null): { summary: string; mentionedFiles: string[] } {
  if (!content) return { summary: '', mentionedFiles: [] };

  // Strip HTML, badges, image lines
  const lines = content
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n');

  // Extract first real paragraph (not a heading, badge, or image)
  let summary = '';
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.match(/^\[!\[/) || t.match(/^!\[/) || t.length < 25) continue;
    summary = t.replace(/[*_`[\]]/g, '').slice(0, 280);
    break;
  }

  // Extract backtick-quoted filenames that look like source files
  const mentionedFiles: string[] = [];
  const fileRe = /`([^`\s]{2,60}\.(ts|tsx|js|jsx|mjs|py|rs|go|yaml|yml|json|toml|md))`/g;
  let m: RegExpExecArray | null;
  while ((m = fileRe.exec(content)) !== null) {
    if (!mentionedFiles.includes(m[1])) mentionedFiles.push(m[1]);
    if (mentionedFiles.length >= 8) break;
  }

  return { summary, mentionedFiles };
}

// ─── package.json Signal Extraction ──────────────────────────────────────────

interface PkgSignals {
  name: string;
  description: string;
  hasTests: boolean;
  hasBuild: boolean;
  hasLint: boolean;
}

function extractFromPackageJson(content: string | null): PkgSignals {
  const fallback: PkgSignals = { name: '', description: '', hasTests: false, hasBuild: false, hasLint: false };
  if (!content) return fallback;
  try {
    const pkg = JSON.parse(content) as Record<string, unknown>;
    const scripts = (pkg.scripts ?? {}) as Record<string, string>;
    return {
      name: (pkg.name as string) ?? '',
      description: (pkg.description as string) ?? '',
      hasTests: 'test' in scripts || 'test:unit' in scripts || 'test:e2e' in scripts,
      hasBuild: 'build' in scripts,
      hasLint: 'lint' in scripts || 'check' in scripts,
    };
  } catch {
    return fallback;
  }
}

// ─── Main Scan Entry Point ────────────────────────────────────────────────────

export async function scanGitHubRepo(url: string): Promise<GitHubScanResult> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) {
    throw new Error("That doesn't look like a valid GitHub URL. Try: https://github.com/username/repo");
  }

  const { owner, repo } = parsed;
  const warnings: string[] = [];

  // 1. Fetch repo metadata
  const meta = await fetchRepoMeta(owner, repo);
  if (!meta) {
    throw new Error(
      "Repository not found or not accessible. Check that the URL is correct and the repo is public.",
    );
  }
  if (meta.private) {
    throw new Error("This repository is private. Memephant can only scan public repositories.");
  }

  // 2. Fetch all candidate files in parallel
  const fetchJobs = CANDIDATE_FILES.map(async (path) => {
    const content = await fetchRaw(owner, repo, path);
    return [path, content] as [string, string | null];
  });

  const fetched = await Promise.all(fetchJobs);
  const files: Record<string, string | null> = {};
  const foundFiles: string[] = [];

  for (const [path, content] of fetched) {
    files[path] = content;
    if (content !== null) foundFiles.push(path);
  }

  if (foundFiles.length === 0) {
    warnings.push("No recognisable project files found. The repo may be empty or use an unusual structure.");
  }

  // 3. Extract signals
  const readmeContent = files['README.md'] ?? files['readme.md'] ?? files['README.mdx'] ?? files['README.rst'] ?? null;
  const { summary: readmeSummary, mentionedFiles } = extractFromReadme(readmeContent);
  const pkgSignals = extractFromPackageJson(files['package.json'] ?? null);

  // 4. Detect stack
  const detectedStack = detectStack(files);

  // 5. Build extracted summary (priority: repo description → README paragraph → package description)
  let extractedSummary = '';
  if (meta.description) {
    extractedSummary = meta.description;
  } else if (readmeSummary) {
    extractedSummary = readmeSummary;
  } else if (pkgSignals.description) {
    extractedSummary = pkgSignals.description;
  }

  // 6. Build current-state string
  const stateParts: string[] = [];
  if (detectedStack.length > 0) stateParts.push(`Stack: ${detectedStack.slice(0, 5).join(', ')}`);
  if (meta.language) stateParts.push(`Primary language: ${meta.language}`);
  if (files['CHANGELOG.md'] || files['CHANGES.md']) stateParts.push('Has changelog');
  if (pkgSignals.hasTests) stateParts.push('Has automated tests');
  if (files['Dockerfile']) stateParts.push('Dockerised');
  const extractedCurrentState =
    stateParts.length > 0
      ? stateParts.join(' · ')
      : 'Context extracted from GitHub — fill in current status manually';

  // 7. Key files found (excluding README variants — too obvious to list)
  const ignoredInKeyFiles = new Set(['README.md', 'readme.md', 'README.mdx', 'README.rst']);
  const keyFiles = [
    ...foundFiles.filter((f) => !ignoredInKeyFiles.has(f)),
    ...mentionedFiles,
  ]
    .filter((v, i, arr) => arr.indexOf(v) === i) // dedupe
    .slice(0, 14);

  // 8. Suggested goals
  const suggestedGoals: string[] = [];
  if (meta.stargazers_count === 0) {
    suggestedGoals.push('Get first external users or contributors');
  }
  if (!readmeContent) {
    suggestedGoals.push('Write a README explaining the project to new contributors');
  }

  // 9. Suggested next steps (based on gaps in the repo)
  const suggestedNextSteps: string[] = [];
  if (!pkgSignals.hasTests && files['package.json']) {
    suggestedNextSteps.push('Add automated tests');
  }
  if (!pkgSignals.hasLint && files['package.json']) {
    suggestedNextSteps.push('Set up a linter (ESLint / Biome)');
  }
  if (!files['Dockerfile'] && detectedStack.length > 0) {
    suggestedNextSteps.push('Add a Dockerfile for reproducible deployment');
  }
  if (!files['.github/workflows/ci.yml'] && !files['.github/workflows/main.yml']) {
    suggestedNextSteps.push('Set up a CI pipeline (GitHub Actions)');
  }
  if (!files['CHANGELOG.md'] && !files['CHANGES.md']) {
    suggestedNextSteps.push('Start tracking changes in CHANGELOG.md');
  }

  // 10. Suggested open questions
  const suggestedOpenQuestions: string[] = [
    'What is the top priority to work on right now?',
  ];
  if (!meta.description) {
    suggestedOpenQuestions.push('What is the one-sentence pitch for this project?');
  }
  if (detectedStack.length === 0) {
    suggestedOpenQuestions.push('What is the tech stack for this project?');
  }

  // 11. Inferred decisions — flag all as assumptions so users know to verify
  const inferredDecisions: Array<{ decision: string; rationale: string }> = [];
  const ASSUMPTION = '[Assumption — verify manually]';

  if (detectedStack.includes('TypeScript')) {
    inferredDecisions.push({
      decision: 'Using TypeScript for type safety across the codebase',
      rationale: `${ASSUMPTION} TypeScript detected in project dependencies`,
    });
  }
  if (detectedStack.includes('Tauri')) {
    inferredDecisions.push({
      decision: 'Desktop app built with Tauri (Rust backend + web frontend)',
      rationale: `${ASSUMPTION} Tauri detected in dependencies`,
    });
  }
  if (detectedStack.includes('Supabase')) {
    inferredDecisions.push({
      decision: 'Supabase used for backend, auth, and/or database',
      rationale: `${ASSUMPTION} Supabase client detected in dependencies`,
    });
  }
  if (detectedStack.includes('Stripe')) {
    inferredDecisions.push({
      decision: 'Stripe integrated for payment processing',
      rationale: `${ASSUMPTION} Stripe detected in dependencies`,
    });
  }
  if (detectedStack.includes('Prisma') || detectedStack.includes('Drizzle ORM')) {
    inferredDecisions.push({
      decision: `Using ${detectedStack.find((s) => s === 'Prisma' || s === 'Drizzle ORM')} as the ORM/database layer`,
      rationale: `${ASSUMPTION} ORM dependency detected`,
    });
  }
  if (detectedStack.includes('Tailwind CSS')) {
    inferredDecisions.push({
      decision: 'Tailwind CSS used for styling',
      rationale: `${ASSUMPTION} Tailwind detected in dependencies`,
    });
  }

  // Limit inferred decisions to avoid overwhelming the user
  const trimmedDecisions = inferredDecisions.slice(0, 5);

  return {
    repoUrl: `https://github.com/${owner}/${repo}`,
    repoName: meta.name || repo,
    repoDescription: meta.description,
    primaryLanguage: meta.language,
    detectedStack,
    extractedSummary,
    extractedCurrentState,
    keyFiles,
    suggestedGoals,
    suggestedNextSteps,
    suggestedOpenQuestions,
    inferredDecisions: trimmedDecisions,
    scannedAt: new Date().toISOString(),
    warnings,
  };
}

// ─── Merge Helper ─────────────────────────────────────────────────────────────

/**
 * Merge scan results into an existing project.
 * Rules:
 *  - Empty string fields → fill from scan
 *  - Array fields → append new unique items only
 *  - Existing user-written content is NEVER overwritten
 *  - Inferred decisions are appended (marked as assumptions)
 */
export function mergeScanResult(
  project: {
    summary: string;
    currentState: string;
    goals: string[];
    nextSteps: string[];
    openQuestions: string[];
    importantAssets: string[];
    decisions: Array<{ decision: string; rationale?: string }>;
  },
  scan: GitHubScanResult,
): {
  summary: string;
  currentState: string;
  goals: string[];
  nextSteps: string[];
  openQuestions: string[];
  importantAssets: string[];
  decisions: Array<{ decision: string; rationale?: string }>;
  detectedStack: string[];
  scanInfo: { scannedAt: string; repoUrl: string; keyFilesFound: string[] };
} {
  const unique = <T>(arr: T[], additions: T[]): T[] => {
    const s = new Set(arr.map((v) => String(v).toLowerCase().trim()));
    return [...arr, ...additions.filter((v) => !s.has(String(v).toLowerCase().trim()))];
  };

  return {
    summary: project.summary?.trim() ? project.summary : scan.extractedSummary,
    currentState: project.currentState?.trim() ? project.currentState : scan.extractedCurrentState,
    goals: unique(project.goals, scan.suggestedGoals),
    nextSteps: unique(project.nextSteps, scan.suggestedNextSteps),
    openQuestions: unique(project.openQuestions, scan.suggestedOpenQuestions),
    importantAssets: unique(project.importantAssets, scan.keyFiles),
    decisions: [
      ...project.decisions,
      ...scan.inferredDecisions.filter(
        (d) => !project.decisions.some((e) => e.decision.toLowerCase() === d.decision.toLowerCase()),
      ),
    ],
    detectedStack: scan.detectedStack,
    scanInfo: {
      scannedAt: scan.scannedAt,
      repoUrl: scan.repoUrl,
      keyFilesFound: scan.keyFiles,
    },
  };
}
