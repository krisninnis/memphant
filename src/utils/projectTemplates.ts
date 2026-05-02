/**
 * Project templates — pre-filled starting points for common project types.
 * Used in WelcomeScreen and CreateProject to give users a head start.
 */

import type { ProjectMemory } from '../types/memphant-types';

export interface ProjectTemplate {
  id: string;
  label: string;
  emoji: string;
  description: string;
  build: (name: string) => Omit<ProjectMemory, 'id' | 'changelog' | 'platformState' | 'checkpoints'>;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'saas',
    label: 'SaaS Product',
    emoji: '🚀',
    description: 'Build and launch a software product',
    build: (name) => ({
      schema_version: 1,
      name,
      summary: 'A SaaS product I am building and taking to market.',
      goals: [
        'Define core features for MVP',
        'Set up payment and subscription flow',
        'Acquire first 10 paying customers',
      ],
      rules: [
        'Ship fast — done beats perfect',
        'Talk to real users every week',
        'Every feature must solve a real user complaint',
      ],
      decisions: [
        {
          decision: 'Start with a desktop or web MVP before mobile',
          rationale: 'Faster to iterate, easier to sell to early adopters',
        },
      ],
      currentState: 'Pre-launch. Defining MVP scope and pricing.',
      nextSteps: [
        'Write a one-pager on who the customer is',
        'Map the user journey from sign-up to value',
        'Decide on pricing tiers',
      ],
      openQuestions: [
        'Who is the primary user persona?',
        'What is the single most painful problem we solve?',
        'Free tier or trial-only?',
      ],
      importantAssets: [],
      projectCharter: '',
      aiInstructions:
        'Help me think through product decisions, marketing copy, and technical architecture. Challenge assumptions. Ask clarifying questions before suggesting features.',
    }),
  },
  {
    id: 'freelance',
    label: 'Freelance Client',
    emoji: '💼',
    description: 'Track a client project from brief to delivery',
    build: (name) => ({
      schema_version: 1,
      name,
      summary: 'A client project I am delivering as a freelancer.',
      goals: [
        'Deliver on time and within scope',
        'Keep client updated weekly',
        'Get a written testimonial on completion',
      ],
      rules: [
        'Everything out of scope goes through a change request',
        'Document decisions in writing after every call',
        'Never discuss other clients with this client',
      ],
      decisions: [],
      currentState: 'Project just kicked off. Gathering requirements.',
      nextSteps: [
        'Send project brief confirmation to client',
        'Set up project folder and file structure',
        'Schedule weekly check-in call',
      ],
      openQuestions: [
        'What does "done" look like to the client?',
        'Who is the final decision-maker?',
        'What is the hard deadline?',
      ],
      importantAssets: [],
      projectCharter: '',
      aiInstructions:
        'Help me draft client communications, scope documents, and technical deliverables. Keep a professional, confident tone.',
    }),
  },
  {
    id: 'writing',
    label: 'Writing Project',
    emoji: '✍️',
    description: 'Articles, books, scripts, or any long-form writing',
    build: (name) => ({
      schema_version: 1,
      name,
      summary: 'A writing project I am working on.',
      goals: [
        'Complete a full first draft',
        'Get feedback from at least two readers',
        'Publish or submit the final piece',
      ],
      rules: [
        'Write every day, even just 200 words',
        'First draft is allowed to be bad — fix it in editing',
        'Keep a separate doc for cut content — it may be reused',
      ],
      decisions: [],
      currentState: 'Early stage. Working on structure and outline.',
      nextSteps: [
        'Write a one-paragraph summary of the core argument or story',
        'Create a chapter or section outline',
        'Start the first draft',
      ],
      openQuestions: [
        'Who is the target reader?',
        'What should they feel or know after reading?',
        'What is the ideal length?',
      ],
      importantAssets: [],
      projectCharter: '',
      aiInstructions:
        'Help me write, edit, and structure my work. Match my voice. When I paste a draft, suggest improvements without rewriting entirely unless I ask.',
    }),
  },
  {
    id: 'research',
    label: 'Research Project',
    emoji: '🔬',
    description: 'Research, analysis, and knowledge work',
    build: (name) => ({
      schema_version: 1,
      name,
      summary: 'A research project I am investigating.',
      goals: [
        'Define the research question clearly',
        'Gather and review relevant sources',
        'Produce a clear summary of findings',
      ],
      rules: [
        'Always cite sources',
        'Separate facts from interpretation',
        'Update findings as new information arrives',
      ],
      decisions: [],
      currentState: 'Starting out. Defining scope and approach.',
      nextSteps: [
        'Write the core research question in one sentence',
        'List the top 5 sources to review first',
        'Create a framework for organising findings',
      ],
      openQuestions: [
        'What is the core research question?',
        'What would a successful outcome look like?',
        'Are there known gaps in current knowledge?',
      ],
      importantAssets: [],
      projectCharter: '',
      aiInstructions:
        'Help me analyse sources, spot patterns, and summarise findings. Flag contradictions in evidence. Do not speculate without labelling it as such.',
    }),
  },
  {
    id: 'job-search',
    label: 'Job Search',
    emoji: '🎯',
    description: 'Applications, interview prep, offer tracking',
    build: (name) => ({
      schema_version: 1,
      name: name || 'Job Search',
      summary: 'Managing my job search — applications, interviews, and offers.',
      goals: [
        'Apply to at least 5 relevant roles per week',
        'Tailor each CV and cover letter to the specific role',
        'Land 2 interviews per week at target companies',
      ],
      rules: [
        'Only apply to roles I genuinely want',
        'Follow up every application after one week of silence',
        'Prep specifically for every interview',
      ],
      decisions: [],
      currentState: 'Active job search. Sending applications and preparing materials.',
      nextSteps: [
        'Update CV to highlight recent achievements with numbers',
        'Write a reusable cover letter base template',
        'List 10 target companies',
      ],
      openQuestions: [
        'What type of role is the ideal next step?',
        'Remote, hybrid, or in-office?',
        'What salary range am I targeting?',
      ],
      importantAssets: [],
      projectCharter: '',
      aiInstructions:
        'Help me tailor CVs, write cover letters, prep for interviews, and draft follow-up emails. Keep a professional but confident tone.',
    }),
  },
];
