/**
 * Golden Utterances for Goal Extraction Testing
 * 
 * These are real-world examples that we use to evaluate prompt quality.
 * Each change to the prompt system should be evaluated against these.
 */

import type { GoldenUtterance } from './framework.js';

export const GOLDEN_UTTERANCES: GoldenUtterance[] = [
  {
    id: 'schedule-basic',
    input: 'Schedule a call with jane@acme.com tomorrow at 3pm for 30 minutes',
    expectedOutcome: 'Schedule a meeting with jane@acme.com',
    expectedProvided: {
      attendee_email: 'jane@acme.com',
      duration_minutes: 30,
    },
    expectedMissing: [],
    minConfidence: 0.9,
    domains: ['calendar'],
    notes: 'Basic scheduling with all information provided',
  },
  {
    id: 'email-followup-draft',
    input: 'Draft follow-up emails for no-reply threads from the last 7 days',
    expectedOutcome: 'Create polite follow-up drafts for no-reply threads from the last 7 days',
    expectedProvided: {
      days: 7,
    },
    expectedMissing: [],
    minConfidence: 0.9,
    domains: ['email'],
    notes: 'Email draft creation without sending',
  },
  {
    id: 'social-missing-content',
    input: 'Post to LinkedIn about our new feature',
    expectedOutcome: 'Create and publish a LinkedIn post about a new feature',
    expectedProvided: {
      platform: 'linkedin',
    },
    expectedMissing: ['content'],
    minConfidence: 0.7,
    domains: ['social'],
    notes: 'Should ask for content since it\'s missing',
  },
  {
    id: 'email-triage-complex',
    input: 'Give me a 10-minute triage of priority emails and create quick-reply drafts (max 8)',
    expectedOutcome: 'Triage priority emails from the last 10 minutes and create up to 8 quick-reply drafts',
    expectedProvided: {
      time_window_minutes: 10,
      max_results: 8,
    },
    expectedMissing: [], // priority_criteria and reply_tone are optional
    minConfidence: 0.85,
    domains: ['email'],
    notes: 'Complex multi-step workflow with constraints',
  },
  {
    id: 'calendar-availability',
    input: 'Check my availability for a 1-hour meeting next Tuesday',
    expectedOutcome: 'Check availability for a 1-hour meeting next Tuesday',
    expectedProvided: {
      duration_minutes: 60,
    },
    expectedMissing: [],
    minConfidence: 0.8,
    domains: ['calendar'],
    notes: 'Availability check without booking',
  },
  {
    id: 'slack-message',
    input: 'Send a message to #engineering about the deployment',
    expectedOutcome: 'Send a message to #engineering channel about deployment',
    expectedProvided: {
      channel: '#engineering',
    },
    expectedMissing: ['content'],
    minConfidence: 0.8,
    domains: ['messaging'],
    notes: 'Should ask for message content',
  },
  {
    id: 'multi-domain',
    input: 'Schedule a meeting with John tomorrow at 2pm and DM him the meeting link on Slack',
    expectedOutcome: 'Schedule a meeting with John tomorrow at 2pm and send meeting link via Slack DM',
    expectedProvided: {
      relative_time: 'tomorrow at 2pm',
    },
    expectedMissing: ['attendee_email'],
    minConfidence: 0.7,
    domains: ['calendar', 'messaging'],
    notes: 'Multi-step workflow across domains',
  },
  // Add more as you find edge cases in production
];

/**
 * Run tests on golden utterances
 * 
 * Usage:
 * ```bash
 * pnpm tsx packages/agent/evaluation/golden-utterances.ts
 * ```
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Golden Utterances Test Suite');
  console.log(`Total test cases: ${GOLDEN_UTTERANCES.length}`);
  console.log('\nTest cases:');
  GOLDEN_UTTERANCES.forEach(u => {
    console.log(`- [${u.id}] ${u.input}`);
  });
  console.log('\nTo run evaluation, implement runEvaluation() in framework.ts');
}
