/**
 * Auto-suggestion engine.
 *
 * Generates a summary and goals for a project by analysing its name
 * and any existing content. No external API required — runs instantly
 * and works offline.
 *
 * Quality improves when a linked folder has been scanned (tech stack
 * keywords surface in the project name or rules).
 */
import type { ProjectMemory } from '../types/memphant-types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AutoSuggestions {
  summary: string;
  currentState: string;
  goals: string[];
}

// ─── Keyword maps ─────────────────────────────────────────────────────────────

const TECH_KEYWORDS: Record<string, string[]> = {
  'React':       ['react'],
  'Vue':         ['vue'],
  'Angular':     ['angular'],
  'Svelte':      ['svelte'],
  'Next.js':     ['next', 'nextjs', 'next.js'],
  'TypeScript':  ['typescript', 'ts'],
  'Rust':        ['rust', 'tauri'],
  'Python':      ['python', 'fastapi', 'django', 'flask'],
  'Node.js':     ['node', 'express', 'nodejs'],
  'Go':          ['golang', ' go '],
  'Swift':       ['swift', 'swiftui'],
  'Kotlin':      ['kotlin', 'android'],
  'Flutter':     ['flutter', 'dart'],
};

const PROJECT_TYPES: Record<string, { label: string; goals: string[] }> = {
  'mobile app': {
    label: 'mobile app',
    goals: [
      'Design and build the core screens',
      'Connect to the backend API',
      'Test on real devices',
      'Submit to the app store',
    ],
  },
  'web app': {
    label: 'web application',
    goals: [
      'Build the core user interface',
      'Set up authentication',
      'Connect to the database',
      'Deploy to production',
    ],
  },
  'api': {
    label: 'API',
    goals: [
      'Define and document all endpoints',
      'Add authentication and authorisation',
      'Write integration tests',
      'Deploy and monitor',
    ],
  },
  'desktop app': {
    label: 'desktop application',
    goals: [
      'Build the main interface',
      'Implement core functionality',
      'Package for distribution',
      'Test on all target platforms',
    ],
  },
  'website': {
    label: 'website',
    goals: [
      'Design and build all pages',
      'Optimise for search engines',
      'Connect any forms or integrations',
      'Launch and share',
    ],
  },
  'cli tool': {
    label: 'CLI tool',
    goals: [
      'Define the commands and flags',
      'Implement the core logic',
      'Write help text and documentation',
      'Publish and distribute',
    ],
  },
  'game': {
    label: 'game',
    goals: [
      'Build the core game loop',
      'Add levels and progression',
      'Polish the UI and effects',
      'Release and gather feedback',
    ],
  },
  'dashboard': {
    label: 'dashboard',
    goals: [
      'Connect the data sources',
      'Build the key charts and views',
      'Add filters and search',
      'Set up access control',
    ],
  },
  'bot': {
    label: 'automation bot',
    goals: [
      'Define what the bot should automate',
      'Build and test the core logic',
      'Handle errors and edge cases',
      'Schedule and deploy',
    ],
  },
  'library': {
    label: 'library / package',
    goals: [
      'Define the public API',
      'Implement and test all functions',
      'Write documentation and examples',
      'Publish to the package registry',
    ],
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nameLower(name: string): string {
  return name.toLowerCase();
}

function detectProjectType(name: string): { label: string; goals: string[] } | null {
  const n = nameLower(name);

  if (/mobile|ios|android|flutter/.test(n)) return PROJECT_TYPES['mobile app'];
  if (/desktop|tauri|electron/.test(n))     return PROJECT_TYPES['desktop app'];
  if (/\bcli\b|command.line|terminal/.test(n)) return PROJECT_TYPES['cli tool'];
  if (/\bapi\b|backend|server|endpoint/.test(n)) return PROJECT_TYPES['api'];
  if (/\bgame\b|gaming/.test(n))            return PROJECT_TYPES['game'];
  if (/dashboard|admin|analytics/.test(n))  return PROJECT_TYPES['dashboard'];
  if (/\bbot\b|automation|scraper/.test(n)) return PROJECT_TYPES['bot'];
  if (/library|package|plugin|sdk/.test(n)) return PROJECT_TYPES['library'];
  if (/web|site|landing|blog|portal/.test(n)) return PROJECT_TYPES['website'];
  if (/app|application/.test(n))            return PROJECT_TYPES['web app'];

  return null;
}

function detectTechStack(project: ProjectMemory): string[] {
  const haystack = [
    project.name,
    ...(project.rules ?? []),
    ...(project.goals ?? []),
    project.summary ?? '',
    project.currentState ?? '',
    project.aiInstructions ?? '',
  ].join(' ').toLowerCase();

  const found: string[] = [];
  for (const [label, keywords] of Object.entries(TECH_KEYWORDS)) {
    if (keywords.some((kw) => haystack.includes(kw))) {
      found.push(label);
    }
  }
  return found;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Generate a summary, current-state blurb, and starter goals for a project.
 * Only fills fields that are currently empty — won't overwrite user content.
 */
export function generateSuggestions(project: ProjectMemory): AutoSuggestions {
  const name = project.name.trim();
  const projectType = detectProjectType(name);
  const techStack = detectTechStack(project);

  // ── Summary ────────────────────────────────────────────────────────────────
  const typeLabel = projectType?.label ?? 'project';
  const techLabel = techStack.length > 0
    ? techStack.slice(0, 3).join(' + ') + ' '
    : '';

  const summary = `${name} is a ${techLabel}${typeLabel}. Add a brief description of what it does and who it's for.`;

  // ── Current state ──────────────────────────────────────────────────────────
  const hasContent =
    (project.goals?.length ?? 0) > 0 ||
    (project.decisions?.length ?? 0) > 0 ||
    (project.nextSteps?.length ?? 0) > 0;

  const currentState = hasContent
    ? 'Project is in progress. Update this as work advances.'
    : 'Just getting started — defining scope and goals.';

  // ── Goals ──────────────────────────────────────────────────────────────────
  const goals: string[] = projectType
    ? [...projectType.goals]
    : [
        'Define the scope and core features',
        'Build the first working version',
        'Test with real users',
        'Ship and iterate',
      ];

  return { summary, currentState, goals };
}

/**
 * Return only the fields that are empty on the project,
 * so auto-fill never overwrites something the user wrote.
 */
export function suggestEmptyFields(project: ProjectMemory): Partial<AutoSuggestions> {
  const suggestions = generateSuggestions(project);
  const result: Partial<AutoSuggestions> = {};

  if (!project.summary?.trim()) result.summary = suggestions.summary;
  if (!project.currentState?.trim()) result.currentState = suggestions.currentState;
  if (!project.goals?.length) result.goals = suggestions.goals;

  return result;
}
