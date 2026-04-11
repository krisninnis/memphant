import type { DetectedUpdate } from '../utils/diffEngine';

export type LocalAiExtractionSource =
  | 'strict_json'
  | 'code_block'
  | 'bare_json'
  | 'natural_language'
  | 'smart_local_fallback';

export interface LocalAiExtractionResult {
  update: DetectedUpdate | null;
  source: LocalAiExtractionSource;
  confidence: number;
  notes: string[];
}

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
  return buildHeuristicUpdate(text);
}