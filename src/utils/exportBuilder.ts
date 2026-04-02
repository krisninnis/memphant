/**
 * Export prompt builder — generates platform-specific handoff prompts.
 *
 * Each platform gets a format tuned to how it processes instructions:
 *   Claude     → XML structured tags (Claude reads XML very well)
 *   ChatGPT    → Conversational prose with clear sections
 *   Grok       → Compressed / minimal — just the facts
 *   Perplexity → Research-framed with context for web-augmented reasoning
 *
 * Every export includes:
 *   1. Full project context (sanitised — no secrets, no local paths)
 *   2. "Since you last saw this" delta — what changed since this platform's last session
 *   3. The user's specific task for this session (if provided)
 *   4. Response format instructions so the AI writes back a parseable update
 */

import type { ProjectMemory, Platform } from '../types/project-brain-types';
import { hashProjectState } from '../types/project-brain-types';

// ─── Secret sanitisation ────────────────────────────────────────────────────

const SECRET_PATTERN =
  /(api[_-]?key|client[_-]?secret|private[_-]?key|bearer\s+[a-z0-9._-]+|password\s*[:=]|passwd\s*[:=]|token\s*[:=])/i;
const ENV_FILE_PATTERN =
  /(^|[\\/])(\.env|\.env\..+|secrets?\.|credentials?|id_rsa|id_dsa|.*\.pem|.*\.p12|.*\.key|.*\.pfx)$/i;

function redact(value: string): string {
  return ENV_FILE_PATTERN.test(value) || SECRET_PATTERN.test(value)
    ? '[REDACTED]'
    : value;
}

function sanitize(project: ProjectMemory): ProjectMemory {
  return {
    ...project,
    summary: redact(project.summary),
    currentState: redact(project.currentState),
    goals: project.goals.map(redact),
    rules: project.rules.map(redact),
    decisions: project.decisions.map((d) => ({
      ...d,
      decision: redact(d.decision),
      rationale: d.rationale ? redact(d.rationale) : undefined,
    })),
    nextSteps: project.nextSteps.map(redact),
    openQuestions: project.openQuestions.map(redact),
    importantAssets: project.importantAssets.map((a) =>
      ENV_FILE_PATTERN.test(a) ? '[REDACTED]' : a
    ),
    linkedFolder: project.linkedFolder
      ? { path: '[LOCAL PATH HIDDEN]', scanHash: project.linkedFolder.scanHash, lastScannedAt: project.linkedFolder.lastScannedAt }
      : undefined,
    changelog: project.changelog.map((e) => ({ ...e, summary: redact(e.summary) })),
  };
}

// ─── Delta summary ───────────────────────────────────────────────────────────

function buildDelta(project: ProjectMemory, platform: Platform): string {
  const state = project.platformState?.[platform];
  if (!state?.lastExportedAt) {
    return `${PLATFORM_LABELS[platform]} has never seen this project before — sending full context.`;
  }

  const lastSeenHash = state.lastExportHash;
  const currentHash = hashProjectState(project);
  if (lastSeenHash === currentHash) {
    return `No changes since ${PLATFORM_LABELS[platform]} last saw this project.`;
  }

  const lastNote = state.lastSessionNote;
  const lines: string[] = [];

  const lastDate = new Date(state.lastExportedAt);
  const diffMs = Date.now() - lastDate.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  const timeAgo = diffD > 0 ? `${diffD} day${diffD > 1 ? 's' : ''} ago` : diffH > 0 ? `${diffH} hour${diffH > 1 ? 's' : ''} ago` : 'recently';

  lines.push(`Last session with ${PLATFORM_LABELS[platform]}: ${timeAgo}`);

  if (lastNote) {
    lines.push(`What was worked on then: ${lastNote}`);
  }

  if (state.lastReplyAt) {
    const replyDate = new Date(state.lastReplyAt);
    lines.push(`${PLATFORM_LABELS[platform]} last replied: ${replyDate.toLocaleDateString()}`);
  }

  // Check what other platforms have been active since
  const otherPlatforms = (Object.entries(project.platformState) as [Platform, typeof state][])
    .filter(([p, s]) => p !== platform && s?.lastExportedAt && s.lastExportedAt > state.lastExportedAt!)
    .map(([p, s]) => `${PLATFORM_LABELS[p]}${s?.lastSessionNote ? ` (${s.lastSessionNote})` : ''}`);

  if (otherPlatforms.length > 0) {
    lines.push(`Since then, also worked with: ${otherPlatforms.join(', ')}`);
  }

  return lines.join('\n');
}

// ─── Shared content blocks ───────────────────────────────────────────────────

const PLATFORM_LABELS: Record<Platform, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  grok: 'Grok',
  perplexity: 'Perplexity',
};

const RESPONSE_FORMAT = (platform: Platform) => `
When you are done, return ONLY this JSON (no other text, no markdown fences):
{
  "updateFrom": "${platform}",
  "timestamp": "${new Date().toISOString()}",
  "session_note": "One sentence: what did you work on this session?",
  "summary": "Updated project summary (or omit if unchanged)",
  "currentState": "Updated current state (or omit if unchanged)",
  "add_goals": [],
  "add_rules": [],
  "add_decisions": [],
  "add_nextSteps": [],
  "add_openQuestions": []
}`.trim();

// ─── Platform-specific export formats ───────────────────────────────────────

function buildClaudeExport(project: ProjectMemory, task: string, delta: string): string {
  const p = sanitize(project);
  const files = p.importantAssets.slice(0, 40);

  return `<project_handoff>
  <meta>
    <name>${p.name}</name>
    <handoff_from>Project Brain (local app)</handoff_from>
    <handoff_to>Claude</handoff_to>
    <timestamp>${new Date().toISOString()}</timestamp>
  </meta>

  <context>
    <summary>${p.summary || 'Not yet filled in.'}</summary>
    <current_state>${p.currentState || 'Not yet filled in.'}</current_state>
  </context>

  <goals>
${p.goals.length > 0 ? p.goals.map(g => `    <goal>${g}</goal>`).join('\n') : '    <goal>None set yet</goal>'}
  </goals>

  <rules>
${p.rules.length > 0 ? p.rules.map(r => `    <rule>${r}</rule>`).join('\n') : '    <rule>None set yet</rule>'}
  </rules>

  <decisions>
${p.decisions.length > 0
    ? p.decisions.map(d => `    <decision source="${d.source || 'unknown'}">${d.decision}${d.rationale ? ` — Rationale: ${d.rationale}` : ''}</decision>`).join('\n')
    : '    <decision>None recorded yet</decision>'}
  </decisions>

  <next_steps>
${p.nextSteps.length > 0 ? p.nextSteps.map(s => `    <step>${s}</step>`).join('\n') : '    <step>None set yet</step>'}
  </next_steps>

  <open_questions>
${p.openQuestions.length > 0 ? p.openQuestions.map(q => `    <question>${q}</question>`).join('\n') : '    <question>None</question>'}
  </open_questions>

  <project_files count="${files.length}">
${files.map(f => `    <file>${f}</file>`).join('\n')}
  </project_files>

  <session_history>
    <delta>${delta}</delta>
    <recent_changelog>
${p.changelog.slice(-5).map(e => `      <entry timestamp="${e.timestamp}" source="${e.source || 'app'}">${e.summary}</entry>`).join('\n')}
    </recent_changelog>
  </session_history>

  <your_task>${task || 'Continue the project from the current state. Identify the most valuable next action and do it.'}</your_task>

  <instructions>
    You are continuing this project. Do NOT restart or reinterpret from scratch.
    Respect all rules and prior decisions. Do not ask for secrets, tokens, .env files, or passwords.
    If anything is redacted, do not try to reconstruct it.
  </instructions>

  <response_format>
${RESPONSE_FORMAT('claude')}
  </response_format>
</project_handoff>`;
}

function buildChatGPTExport(project: ProjectMemory, task: string, delta: string): string {
  const p = sanitize(project);
  const files = p.importantAssets.slice(0, 40);

  return `You are picking up an existing project called "${p.name}".

WHAT THIS PROJECT IS
${p.summary || '(Not filled in yet — ask the user to describe the project)'}

WHERE THINGS STAND
${p.currentState || '(Not filled in yet)'}

GOALS
${p.goals.length > 0 ? p.goals.map(g => `• ${g}`).join('\n') : '• None set yet'}

RULES — follow these without exception
${p.rules.length > 0 ? p.rules.map(r => `• ${r}`).join('\n') : '• None set yet'}

DECISIONS ALREADY MADE — do not revisit these
${p.decisions.length > 0 ? p.decisions.map(d => `• ${d.decision}`).join('\n') : '• None recorded yet'}

NEXT STEPS
${p.nextSteps.length > 0 ? p.nextSteps.map(s => `• ${s}`).join('\n') : '• None set yet'}

OPEN QUESTIONS
${p.openQuestions.length > 0 ? p.openQuestions.map(q => `• ${q}`).join('\n') : '• None'}

PROJECT FILES (${files.length} important files identified)
${files.slice(0, 20).map(f => `• ${f}`).join('\n')}${files.length > 20 ? `\n• ...and ${files.length - 20} more` : ''}

WHAT CHANGED SINCE YOUR LAST SESSION
${delta}

YOUR TASK FOR THIS SESSION
${task || 'Continue the project. Identify the most valuable next action and carry it out.'}

IMPORTANT
• Do NOT restart or reinterpret this project from scratch
• Do NOT ask for .env files, tokens, passwords, or API keys
• If something is marked [REDACTED], leave it alone

${RESPONSE_FORMAT('chatgpt')}`;
}

function buildGrokExport(project: ProjectMemory, task: string, delta: string): string {
  const p = sanitize(project);
  const files = p.importantAssets.slice(0, 30);

  return `PROJECT: ${p.name}
SUMMARY: ${p.summary || 'none'}
STATE: ${p.currentState || 'none'}

GOALS: ${p.goals.length > 0 ? p.goals.join(' | ') : 'none'}
RULES: ${p.rules.length > 0 ? p.rules.join(' | ') : 'none'}
DECISIONS: ${p.decisions.length > 0 ? p.decisions.map(d => d.decision).join(' | ') : 'none'}
NEXT: ${p.nextSteps.length > 0 ? p.nextSteps.join(' | ') : 'none'}
QUESTIONS: ${p.openQuestions.length > 0 ? p.openQuestions.join(' | ') : 'none'}

FILES (${files.length}): ${files.slice(0, 15).join(', ')}${files.length > 15 ? '...' : ''}

DELTA: ${delta}

TASK: ${task || 'Continue from current state. Most valuable next action.'}

RULES: No secrets. No restarts. No revisiting decisions. Stay on task.

${RESPONSE_FORMAT('grok')}`;
}

function buildPerplexityExport(project: ProjectMemory, task: string, delta: string): string {
  const p = sanitize(project);
  const files = p.importantAssets.slice(0, 30);

  return `You are a research-informed AI assistant continuing work on "${p.name}".

RESEARCH CONTEXT
This is an ongoing project. Use your web knowledge to inform your answers, but always respect the project's existing decisions and direction. Do not suggest approaches that contradict the established rules below.

PROJECT OVERVIEW
${p.summary || 'Not yet documented.'}

CURRENT STATE
${p.currentState || 'Not yet documented.'}

ESTABLISHED GOALS
${p.goals.length > 0 ? p.goals.map(g => `- ${g}`).join('\n') : '- None set yet'}

NON-NEGOTIABLE RULES
${p.rules.length > 0 ? p.rules.map(r => `- ${r}`).join('\n') : '- None set yet'}

PRIOR DECISIONS (do not revisit)
${p.decisions.length > 0 ? p.decisions.map(d => `- ${d.decision}`).join('\n') : '- None recorded yet'}

NEXT STEPS
${p.nextSteps.length > 0 ? p.nextSteps.map(s => `- ${s}`).join('\n') : '- None set yet'}

OPEN QUESTIONS (research may help answer these)
${p.openQuestions.length > 0 ? p.openQuestions.map(q => `- ${q}`).join('\n') : '- None'}

PROJECT FILES IDENTIFIED
${files.map(f => `- ${f}`).join('\n')}

RECENT HISTORY
${delta}

YOUR TASK
${task || 'Research and continue the project. Use web sources where helpful. Respect all existing decisions.'}

Do not ask for secrets, tokens, or .env contents. If anything is marked [REDACTED], leave it.

${RESPONSE_FORMAT('perplexity')}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function buildExportPrompt(
  project: ProjectMemory,
  platform: Platform,
  task?: string,
): string {
  const delta = buildDelta(project, platform);
  const taskText = task?.trim() || '';

  switch (platform) {
    case 'claude':     return buildClaudeExport(project, taskText, delta);
    case 'chatgpt':    return buildChatGPTExport(project, taskText, delta);
    case 'grok':       return buildGrokExport(project, taskText, delta);
    case 'perplexity': return buildPerplexityExport(project, taskText, delta);
  }
}
