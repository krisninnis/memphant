/**
 * Export quality scorer.
 * Returns a 0-100 score and a short message telling the user
 * how useful their export will be for the AI.
 */
import type { ProjectMemory } from '../types/project-brain-types';

export interface QualityScore {
  score: number;        // 0–100
  label: string;        // "Weak" | "Fair" | "Good" | "Strong"
  message: string;      // one short tip (empty if score is 100)
  color: string;        // CSS colour for the indicator
}

export function scoreExport(project: ProjectMemory): QualityScore {
  let score = 0;

  // Summary — 30 points
  if (project.summary && project.summary.trim().length > 10) score += 15;
  if (project.summary && project.summary.trim().length > 60) score += 15;

  // currentState — 20 points
  if (project.currentState && project.currentState.trim().length > 10) score += 10;
  if (project.currentState && project.currentState.trim().length > 60) score += 10;

  // nextSteps — 20 points
  if (project.nextSteps.length >= 1) score += 10;
  if (project.nextSteps.length >= 3) score += 10;

  // goals — 10 points
  if (project.goals.length >= 1) score += 5;
  if (project.goals.length >= 2) score += 5;

  // decisions — 10 points
  if (project.decisions.length >= 1) score += 5;
  if (project.decisions.length >= 3) score += 5;

  // aiInstructions — 10 points (bonus — makes exports much more tailored)
  if (project.aiInstructions && project.aiInstructions.trim().length > 10) score += 10;

  score = Math.min(100, score);

  if (score < 30) {
    return {
      score,
      label: 'Weak',
      message: 'Add a summary so the AI knows what this project is about.',
      color: '#e53e3e',
    };
  }
  if (score < 55) {
    return {
      score,
      label: 'Fair',
      message: 'Add some next steps to make the first session more useful.',
      color: '#d97706',
    };
  }
  if (score < 80) {
    return {
      score,
      label: 'Good',
      message: 'Add goals or key decisions to give the AI more context.',
      color: '#ecc94b',
    };
  }
  return {
    score,
    label: 'Strong',
    message: '',
    color: '#48bb78',
  };
}
