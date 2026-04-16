import type { DetectedUpdate } from '../utils/diffEngine';
import { detectUpdate } from '../utils/diffEngine';
import { useProjectStore } from '../store/projectStore';

export type LocalAiExtractionSource =
  | 'strict_json'
  | 'code_block'
  | 'bare_json'
  | 'natural_language'
  | 'smart_local_fallback'
  | 'ollama';

export interface LocalAiExtractionResult {
  update: DetectedUpdate | null;
  source: LocalAiExtractionSource;
  confidence: number;
  notes: string[];
}

export type LocalAiAction = 'clean_response' | 'explain_changes' | 'improve_summary';

export interface LocalAiActionInput {
  text: string;
  projectName?: string;
  projectSummary?: string;
  diffSummary?: string;
}

type LocalAiSettings = {
  enabled: boolean;
  provider: 'ollama';
  model: string;
  endpoint: string;
};

type FetchRequestInit = globalThis.RequestInit;

const OLLAMA_PING_TIMEOUT_MS = 1200;
const OLLAMA_GENERATE_TIMEOUT_MS = 12_000;
const OLLAMA_MAX_INPUT_CHARS = 18_000;
const OLLAMA_CACHE_TTL_MS = 10_000;
const OLLAMA_PULL_TIMEOUT_MS = 600_000;

export const DEFAULT_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434';
export const DEFAULT_OLLAMA_MODEL = 'llama3.1:8b';

let ollamaAvailabilityCache: { endpoint: string; ok: boolean; checkedAt: number } | null = null;

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function cleanupSentence(value: string): string {
  return value.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
}

function extractBulletsFromSection(text: string, headings: string[]): string[] {
  const headingPattern = headings.map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const sectionRegex = new RegExp(
    `(?:^|\\n)\\s*(?:${headingPattern})\\s*:?\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:[A-Z][A-Za-z &/]+:|##|$))`,
    'i',
  );

  const match = text.match(sectionRegex);
  if (!match?.[1]) {
    return [];
  }

  const lines = match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const items = lines
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(Boolean);

  return dedupeStrings(items);
}

function extractSingleLineField(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const regex = new RegExp(`(?:^|\\n)\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*(.+)`, 'i');
    const match = text.match(regex);
    if (match?.[1]) {
      const cleaned = cleanupSentence(match[1]);
      if (cleaned) {
        return cleaned;
      }
    }
  }

  return undefined;
}

function extractDecisionLines(text: string): Array<{ decision: string; rationale?: string }> {
  const explicitSection = extractBulletsFromSection(text, ['Key Decisions', 'Decisions', 'Decision']);
  if (explicitSection.length > 0) {
    return explicitSection.map((item) => {
      const [decision, rationale] = item.split(/\s+[—-]\s+/);
      return {
        decision: cleanupSentence(decision),
        ...(rationale ? { rationale: cleanupSentence(rationale) } : {}),
      };
    });
  }

  const matches = text.match(/(?:we decided|decision:|we chose)\s+([^.!\n]+)/gi);
  if (!matches) {
    return [];
  }

  return matches
    .map((match) => cleanupSentence(match.replace(/^(?:we decided|decision:|we chose)\s+/i, '')))
    .filter(Boolean)
    .map((decision) => ({ decision }));
}

function buildHeuristicUpdate(text: string): LocalAiExtractionResult {
  const update: DetectedUpdate = {};
  const notes: string[] = [];

  const summary =
    extractSingleLineField(text, ['Summary']) ||
    extractSingleLineField(text, ['Project Summary']);

  if (summary) {
    update.summary = summary;
    notes.push('Found summary-like content');
  }

  const currentState =
    extractSingleLineField(text, ['Current State']) ||
    extractSingleLineField(text, ['Current Status']) ||
    extractSingleLineField(text, ['What this project is about']);

  if (currentState) {
    update.currentState = currentState;
    notes.push('Found current-state content');
  }

  const goals = extractBulletsFromSection(text, ['Goals']);
  if (goals.length > 0) {
    update.goals = goals;
    notes.push(`Found ${goals.length} goal item${goals.length === 1 ? '' : 's'}`);
  }

  const rules = extractBulletsFromSection(text, ['Rules']);
  if (rules.length > 0) {
    update.rules = rules;
    notes.push(`Found ${rules.length} rule item${rules.length === 1 ? '' : 's'}`);
  }

  const nextSteps = extractBulletsFromSection(text, ['Next Steps', "What's Next", 'Next']);
  if (nextSteps.length > 0) {
    update.nextSteps = nextSteps;
    notes.push(`Found ${nextSteps.length} next-step item${nextSteps.length === 1 ? '' : 's'}`);
  }

  const openQuestions = extractBulletsFromSection(text, ['Open Questions', 'Questions']);
  if (openQuestions.length > 0) {
    update.openQuestions = openQuestions;
    notes.push(`Found ${openQuestions.length} open question${openQuestions.length === 1 ? '' : 's'}`);
  }

  const importantAssets = extractBulletsFromSection(text, ['Important Files & Assets', 'Important Assets']);
  if (importantAssets.length > 0) {
    update.importantAssets = importantAssets;
    notes.push(`Found ${importantAssets.length} important asset${importantAssets.length === 1 ? '' : 's'}`);
  }

  const decisions = extractDecisionLines(text);
  if (decisions.length > 0) {
    update.decisions = decisions;
    notes.push(`Found ${decisions.length} decision${decisions.length === 1 ? '' : 's'}`);
  }

  const hasFields =
    !!update.summary ||
    !!update.currentState ||
    !!update.goals?.length ||
    !!update.rules?.length ||
    !!update.decisions?.length ||
    !!update.nextSteps?.length ||
    !!update.openQuestions?.length ||
    !!update.importantAssets?.length;

  if (!hasFields) {
    return {
      update: null,
      source: 'smart_local_fallback',
      confidence: 0,
      notes: ['No structured project update could be inferred'],
    };
  }

  const confidence =
    (update.summary ? 0.14 : 0) +
    (update.currentState ? 0.14 : 0) +
    ((update.goals?.length ?? 0) > 0 ? 0.14 : 0) +
    ((update.decisions?.length ?? 0) > 0 ? 0.18 : 0) +
    ((update.nextSteps?.length ?? 0) > 0 ? 0.14 : 0) +
    ((update.openQuestions?.length ?? 0) > 0 ? 0.12 : 0) +
    ((update.rules?.length ?? 0) > 0 ? 0.07 : 0) +
    ((update.importantAssets?.length ?? 0) > 0 ? 0.07 : 0);

  return {
    update,
    source: 'smart_local_fallback',
    confidence: Math.min(0.88, Number(confidence.toFixed(2))),
    notes,
  };
}

function getLocalAiSettings(): LocalAiSettings | null {
  try {
    const settings = useProjectStore.getState().settings as unknown as { localAi?: LocalAiSettings };
    if (!settings?.localAi) return null;
    return settings.localAi;
  } catch {
    return null;
  }
}

function normalizeEndpoint(endpoint: string): string {
  const trimmed = endpoint.trim();
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

async function fetchWithTimeout(
  url: string,
  init: FetchRequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

async function pingOllama(endpoint: string): Promise<boolean> {
  const normalized = normalizeEndpoint(endpoint);

  if (
    ollamaAvailabilityCache &&
    ollamaAvailabilityCache.endpoint === normalized &&
    Date.now() - ollamaAvailabilityCache.checkedAt < OLLAMA_CACHE_TTL_MS
  ) {
    return ollamaAvailabilityCache.ok;
  }

  try {
    const res = await fetchWithTimeout(
      `${normalized}/api/tags`,
      { method: 'GET' },
      OLLAMA_PING_TIMEOUT_MS,
    );

    const ok = res.ok;
    ollamaAvailabilityCache = { endpoint: normalized, ok, checkedAt: Date.now() };
    return ok;
  } catch {
    ollamaAvailabilityCache = { endpoint: normalized, ok: false, checkedAt: Date.now() };
    return false;
  }
}

export async function checkOllamaAvailability(endpoint: string): Promise<boolean> {
  const normalized = normalizeEndpoint(endpoint);

  try {
    const res = await fetch(`${normalized}/api/tags`, { method: 'GET' });

    return res.ok;
  } catch (err) {
    console.error('[Ollama] Connection failed:', err);
    return false;
  }
}

export async function checkModelExists(endpoint: string, model: string): Promise<boolean> {
  const models = await listOllamaModels(endpoint);
  const target = model.trim().toLowerCase();
  if (!target) return false;

  return models.some((name) => {
    const lower = name.toLowerCase();
    if (lower === target) return true;
    if (!target.includes(':')) {
      return (lower.split(':')[0] ?? '') === target;
    }
    return false;
  });
}

export async function listOllamaModels(endpoint: string): Promise<string[]> {
  const normalized = normalizeEndpoint(endpoint);
  if (!normalized) return [];

  try {
    type TagsResponse = { models?: Array<{ name?: string; model?: string }> };
    const res = await fetchWithTimeout(
      `${normalized}/api/tags`,
      { method: 'GET' },
      OLLAMA_PING_TIMEOUT_MS,
    );
    if (!res.ok) return [];

    const data = (await res.json()) as TagsResponse;
    const models = (data.models ?? [])
      .map((entry) => (entry.name ?? entry.model ?? '').trim())
      .filter(Boolean);

    return dedupeStrings(models);
  } catch (err) {
    console.error('[Ollama] Model list failed:', err);
    return [];
  }
}

export function chooseBestOllamaModel(
  models: string[],
  preferred = DEFAULT_OLLAMA_MODEL,
): string {
  if (models.length === 0) return preferred;

  const normalized = dedupeStrings(models);
  const lowerMap = new Map(normalized.map((name) => [name.toLowerCase(), name]));
  const preferredLower = preferred.toLowerCase();

  if (lowerMap.has(preferredLower)) {
    return lowerMap.get(preferredLower)!;
  }

  const basePreferred = preferredLower.split(':')[0] ?? preferredLower;
  const baseMatch = normalized.find((name) => {
    const base = name.toLowerCase().split(':')[0] ?? '';
    return base === basePreferred;
  });
  if (baseMatch) return baseMatch;

  const rankedPrefixes = [
    'llama3.1:8b',
    'llama3.1',
    'llama3.2:3b',
    'llama3.2',
    'qwen2.5',
    'mistral',
    'phi3',
  ];

  for (const prefix of rankedPrefixes) {
    const match = normalized.find((name) => name.toLowerCase().startsWith(prefix));
    if (match) return match;
  }

  return normalized[0] ?? preferred;
}

export async function pullOllamaModel(endpoint: string, model: string): Promise<boolean> {
  const normalized = normalizeEndpoint(endpoint);
  const target = model.trim();
  if (!normalized || !target) return false;

  try {
    const res = await fetchWithTimeout(
      `${normalized}/api/pull`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: target, stream: false }),
      },
      OLLAMA_PULL_TIMEOUT_MS,
    );

    return res.ok;
  } catch (err) {
    console.error('[Ollama] Model pull failed:', err);
    return false;
  }
}

function buildOllamaPrompt(text: string): { system: string; prompt: string } {
  const system =
    'You extract structured project updates from messy AI chat logs. ' +
    'Return ONLY a single JSON object, with no markdown, no code fences, and no commentary. ' +
    'Use only these keys when relevant: summary, currentState, goals, rules, decisions, nextSteps, openQuestions, importantAssets. ' +
    'For decisions, use an array of objects like { "decision": string, "rationale"?: string }. ' +
    'If no meaningful project update is present, return an empty JSON object {}.';

  const prompt =
    'Extract the project update from the following text and return ONLY the JSON object:\n\n' +
    text;

  return { system, prompt };
}

function getConfiguredOllamaSettings(): LocalAiSettings {
  const settings = getLocalAiSettings();

  if (!settings?.enabled || settings.provider !== 'ollama') {
    throw new Error('Private Mode is disabled.');
  }

  const endpoint = normalizeEndpoint(settings.endpoint || '');
  const model = (settings.model || '').trim();

  if (!endpoint) {
    throw new Error('Set an Ollama endpoint first.');
  }

  if (!model) {
    throw new Error('Choose an Ollama model first.');
  }

  return {
    ...settings,
    endpoint,
    model,
  };
}

async function generateOllamaText(
  settings: LocalAiSettings,
  system: string,
  prompt: string,
  timeoutMs = OLLAMA_GENERATE_TIMEOUT_MS,
): Promise<string> {
  const reachable = await pingOllama(settings.endpoint);
  if (!reachable) {
    throw new Error('Ollama is not installed or not running.');
  }

  const modelExists = await checkModelExists(settings.endpoint, settings.model);
  if (!modelExists) {
    throw new Error(`Model not found: ${settings.model}`);
  }

  const response = await fetchWithTimeout(
    `${settings.endpoint}/api/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: settings.model,
        system,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
        },
      }),
    },
    timeoutMs,
  );

  if (!response.ok) {
    throw new Error(`Ollama request failed (${response.status})`);
  }

  const data = (await response.json()) as { response?: unknown };
  const text = typeof data.response === 'string' ? data.response.trim() : '';
  if (!text) {
    throw new Error('Ollama returned an empty response.');
  }

  return text;
}

function buildLocalAiActionPrompt(
  action: LocalAiAction,
  input: LocalAiActionInput,
): { system: string; prompt: string } {
  const cleanText = input.text.trim();
  const contextLines = [
    input.projectName ? `Project: ${input.projectName}` : '',
    input.projectSummary ? `Current summary: ${input.projectSummary}` : '',
    input.diffSummary ? `Detected changes: ${input.diffSummary}` : '',
  ].filter(Boolean);

  if (action === 'clean_response') {
    return {
      system:
        'You clean pasted AI responses for downstream parsing. Return only cleaned plain text. Remove markdown fences, filler, and conversational framing while preserving facts.',
      prompt: `${contextLines.join('\n')}\n\nPasted AI response:\n${cleanText}`.trim(),
    };
  }

  if (action === 'explain_changes') {
    return {
      system:
        'You explain project changes clearly for a product user. Return only short plain text bullets. Be specific and concise.',
      prompt: `${contextLines.join('\n')}\n\nExplain the important changes described below:\n${cleanText}`.trim(),
    };
  }

  return {
    system:
      'You improve project summaries. Return only a concise polished summary in plain text, suitable for a project memory tool.',
    prompt: `${contextLines.join('\n')}\n\nWrite a better project summary using this context:\n${cleanText}`.trim(),
  };
}

export async function runLocalAiAction(
  action: LocalAiAction,
  input: LocalAiActionInput,
): Promise<string> {
  const settings = getConfiguredOllamaSettings();
  const { system, prompt } = buildLocalAiActionPrompt(action, input);
  return generateOllamaText(settings, system, prompt);
}

async function tryExtractWithOllama(text: string, settings: LocalAiSettings): Promise<LocalAiExtractionResult> {
  const notes: string[] = [];

  const endpoint = normalizeEndpoint(settings.endpoint || '');
  const model = (settings.model || '').trim();

  if (!endpoint || !model) {
    return { update: null, source: 'ollama', confidence: 0, notes: ['Ollama is enabled but endpoint/model is missing'] };
  }

  const reachable = await pingOllama(endpoint);
  if (!reachable) {
    return { update: null, source: 'ollama', confidence: 0, notes: ['Ollama endpoint not reachable'] };
  }

  const trimmed = text.trim();
  const sliced = trimmed.length > OLLAMA_MAX_INPUT_CHARS ? trimmed.slice(0, OLLAMA_MAX_INPUT_CHARS) : trimmed;
  if (trimmed.length > OLLAMA_MAX_INPUT_CHARS) {
    notes.push(`Input truncated to ${OLLAMA_MAX_INPUT_CHARS} chars`);
  }

  const { system, prompt } = buildOllamaPrompt(sliced);

  try {
    const res = await fetchWithTimeout(
      `${endpoint}/api/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          system,
          prompt,
          stream: false,
          options: {
            temperature: 0,
          },
        }),
      },
      OLLAMA_GENERATE_TIMEOUT_MS,
    );

    if (!res.ok) {
      return {
        update: null,
        source: 'ollama',
        confidence: 0,
        notes: [`Ollama request failed (${res.status})`],
      };
    }

    const data = (await res.json()) as { response?: unknown };
    const responseText = typeof data?.response === 'string' ? data.response.trim() : '';

    if (!responseText) {
      return { update: null, source: 'ollama', confidence: 0, notes: ['Ollama returned an empty response'] };
    }

    const parsed = detectUpdate(responseText);
    if (parsed.update) {
      return {
        update: parsed.update,
        source: 'ollama',
        confidence: Math.max(0.7, Math.min(0.92, parsed.confidence || 0.85)),
        notes: notes.length ? notes : ['Parsed Ollama JSON successfully'],
      };
    }

    return { update: null, source: 'ollama', confidence: 0, notes: ['Ollama response was not valid project-update JSON'] };
  } catch {
    return { update: null, source: 'ollama', confidence: 0, notes: ['Ollama request threw an error'] };
  }
}

/**
 * Phase 1 local AI service.
 *
 * This is deliberately heuristic-only for now:
 * - no bundled model yet
 * - no cloud calls
 * - safe local fallback only
 *
 * Later this becomes the single place where a real local model can be plugged in.
 */
export async function extractStructuredProjectUpdate(
  text: string,
): Promise<LocalAiExtractionResult> {
  const settings = getLocalAiSettings();

  if (settings?.enabled && settings.provider === 'ollama') {
    const ollama = await tryExtractWithOllama(text, settings);
    if (ollama.update) {
      return ollama;
    }
  }

  return buildHeuristicUpdate(text);
}
