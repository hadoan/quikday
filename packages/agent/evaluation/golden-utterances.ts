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

  // Triage & Priorities (Templates 1-3)
  {
    id: 'triage-quick-reply',
    input: 'Give me a 10-minute triage of priority emails and create quick-reply drafts (max 8)',
    expectedOutcome: 'Triage priority emails from the last 10 minutes and create up to 8 quick-reply drafts',
    expectedProvided: {
      time_window_minutes: 10,
      max_results: 8,
      action_type: 'triage_and_draft',
    },
    expectedMissing: [],
    minConfidence: 0.9,
    domains: ['email'],
    notes: 'Triage with defaults - all params provided',
  },
  {
    id: 'inbox-sprint',
    input: 'Run a 15-minute inbox sprint: archive newsletters, snooze low-priority items for 3d, and surface actionables (max 12)',
    expectedOutcome: 'Execute 15-minute inbox sprint: archive newsletters, snooze low-priority for 3 days, surface up to 12 actionables',
    expectedProvided: {
      time_window_minutes: 15,
      max_results: 12,
      snooze_duration: '3d',
    },
    expectedMissing: [],
    minConfidence: 0.85,
    domains: ['email'],
    notes: 'Multi-action inbox management',
  },
  {
    id: 'time-sensitive-threads',
    input: 'Show top 10 time-sensitive threads from the last 3 days and draft concise replies',
    expectedOutcome: 'Identify top 10 time-sensitive threads from last 3 days and create concise reply drafts',
    expectedProvided: {
      max_results: 10,
      days: 3,
    },
    expectedMissing: [],
    minConfidence: 0.9,
    domains: ['email'],
    notes: 'Time-sensitive filtering with drafting',
  },

  // Follow-ups & Sweeps (Templates 4-6)
  {
    id: 'no-reply-sweep-polite',
    input: 'Sweep my sent threads with no reply from the last 14 days and draft polite nudges (tone polite)',
    expectedOutcome: 'Find sent threads with no reply from last 14 days and create polite follow-up nudges',
    expectedProvided: {
      days: 14,
      tone: 'polite',
    },
    expectedMissing: [],
    minConfidence: 0.9,
    domains: ['email'],
    notes: 'No-reply sweep with explicit tone',
  },
  {
    id: 'starred-followup',
    input: 'Find starred threads older than 7 days without response and draft follow-ups (max 15)',
    expectedOutcome: 'Locate starred threads older than 7 days without response and draft up to 15 follow-ups',
    expectedProvided: {
      days: 7,
      max_results: 15,
      filter: 'starred',
    },
    expectedMissing: [],
    minConfidence: 0.85,
    domains: ['email'],
    notes: 'Starred filter with follow-ups',
  },
  {
    id: 'scheduled-nudge',
    input: 'For follow-ups I send today, schedule a second nudge in 3d if no reply',
    expectedOutcome: 'Set up automatic second nudge in 3 days for follow-ups sent today if no reply received',
    expectedProvided: {
      after: '3d',
    },
    expectedMissing: [],
    minConfidence: 0.8,
    domains: ['email'],
    notes: 'Conditional scheduled follow-up',
  },

  // Meeting Prep & Recaps (Templates 7-9)
  {
    id: 'meeting-prep-onepager',
    input: 'Prepare a one-pager for my 3pm meeting with Acme Corp using related recent emails; add 3 talking points',
    expectedOutcome: 'Create one-page meeting brief for 3pm Acme Corp meeting with email context and 3 talking points',
    expectedProvided: {
      time: '3pm',
      company: 'Acme Corp',
      talking_points_count: 3,
    },
    expectedMissing: [],
    minConfidence: 0.85,
    domains: ['email', 'calendar'],
    notes: 'Meeting prep with email context',
  },
  {
    id: 'meeting-recap-reminder',
    input: 'Draft a recap for the last meeting with john@acme.com and add a follow-up reminder in 3d on my calendar',
    expectedOutcome: 'Create meeting recap for john@acme.com and schedule 3-day follow-up reminder on calendar',
    expectedProvided: {
      contact_email: 'john@acme.com',
      followup: '3d',
    },
    expectedMissing: [],
    minConfidence: 0.9,
    domains: ['email', 'calendar'],
    notes: 'Recap with calendar reminder',
  },
  {
    id: 'pre-meeting-emails',
    input: 'For my next 24 hours of meetings, draft quick "see you soon" emails with agenda bullets to all attendees',
    expectedOutcome: 'Draft pre-meeting emails with agendas for all meetings in next 24 hours',
    expectedProvided: {
      hours: 24,
    },
    expectedMissing: [],
    minConfidence: 0.85,
    domains: ['email', 'calendar'],
    notes: 'Batch pre-meeting communication',
  },

  // Scheduling Helpers (Templates 10-12)
  {
    id: 'propose-slots',
    input: 'From my availability over the next 7 days, propose 3 30-min slots and draft a scheduling email to jane@startup.io',
    expectedOutcome: 'Find 3 available 30-minute slots in next 7 days and draft scheduling email to jane@startup.io',
    expectedProvided: {
      days: 7,
      slots: 3,
      duration_minutes: 30,
      to_email: 'jane@startup.io',
    },
    expectedMissing: [],
    minConfidence: 0.9,
    domains: ['calendar', 'email'],
    notes: 'Availability check with scheduling email',
  },
  {
    id: 'conflict-detection',
    input: 'Detect conflicts in the next 5 days and draft reschedule emails with 2 alternatives',
    expectedOutcome: 'Identify calendar conflicts in next 5 days and create reschedule emails with 2 alternative slots',
    expectedProvided: {
      days: 5,
      slots: 2,
    },
    expectedMissing: [],
    minConfidence: 0.85,
    domains: ['calendar', 'email'],
    notes: 'Conflict resolution workflow',
  },
  {
    id: 'focus-blocks',
    input: 'Create calendar focus blocks tomorrow for top actionable threads (max 5) with 30m each; link emails in description',
    expectedOutcome: 'Schedule 5 focus blocks tomorrow for actionable email threads, 30 minutes each with email links',
    expectedProvided: {
      max_results: 5,
      duration_minutes: 30,
      when: 'tomorrow',
    },
    expectedMissing: [],
    minConfidence: 0.85,
    domains: ['calendar', 'email'],
    notes: 'Time-blocking for email tasks',
  },

  // Digests & Daily Ops (Templates 13-15)
  {
    id: 'daily-digest',
    input: 'Every weekday at 08:45, send a digest of today\'s meetings, hot emails, and pending follow-ups (max 8)',
    expectedOutcome: 'Schedule recurring weekday digest at 08:45 with meetings, priority emails, and follow-ups (max 8)',
    expectedProvided: {
      time: '08:45',
      frequency: 'weekday',
      max_results: 8,
    },
    expectedMissing: [],
    minConfidence: 0.9,
    domains: ['email', 'calendar'],
    notes: 'Recurring daily digest',
  },
  {
    id: 'weekly-summary',
    input: 'Each Mon at 09:00, summarize key threads from last week, this week\'s meetings, and suggested follow-ups',
    expectedOutcome: 'Schedule Monday 09:00 weekly summary: last week threads, upcoming meetings, follow-up suggestions',
    expectedProvided: {
      weekday: 'Mon',
      time: '09:00',
    },
    expectedMissing: [],
    minConfidence: 0.9,
    domains: ['email', 'calendar'],
    notes: 'Weekly recurring summary',
  },
  {
    id: 'action-items-reminders',
    input: 'Extract action items from the last 3 days of starred threads and add calendar reminders across 3d',
    expectedOutcome: 'Extract action items from starred threads (last 3 days) and create calendar reminders spread over 3 days',
    expectedProvided: {
      days: 3,
      spread: '3d',
      filter: 'starred',
    },
    expectedMissing: [],
    minConfidence: 0.8,
    domains: ['email', 'calendar'],
    notes: 'Action item extraction with reminder spreading',
  },

  // RSVP & Confirmations (Templates 16-17)
  {
    id: 'smart-rsvp',
    input: 'For invites in the last 7 days, draft RSVP emails based on my calendar availability; accept if free, propose alt slots if busy',
    expectedOutcome: 'Process invites from last 7 days: draft accept/propose emails based on calendar availability',
    expectedProvided: {
      days: 7,
    },
    expectedMissing: [],
    minConfidence: 0.85,
    domains: ['email', 'calendar'],
    notes: 'Smart RSVP based on availability',
  },
  {
    id: 'meeting-confirmation',
    input: 'Confirm the Product Review meeting on Nov 15 at 2pm with location Building A, Room 301 and attach a brief agenda',
    expectedOutcome: 'Send confirmation for Product Review meeting Nov 15 at 2pm at Building A, Room 301 with agenda',
    expectedProvided: {
      title: 'Product Review',
      date: 'Nov 15',
      time: '2pm',
      location: 'Building A, Room 301',
    },
    expectedMissing: [],
    minConfidence: 0.9,
    domains: ['email', 'calendar'],
    notes: 'Explicit meeting confirmation',
  },

  // Out-of-Office & Boundaries (Templates 18-19)
  {
    id: 'ooo-setup',
    input: 'Set an out-of-office from Dec 20 to Dec 27 with this message: "On vacation, will respond Jan 2". Draft a heads-up to my top contacts',
    expectedOutcome: 'Set OOO Dec 20-27 with vacation message and send advance notice to top contacts',
    expectedProvided: {
      start: 'Dec 20',
      end: 'Dec 27',
      message: 'On vacation, will respond Jan 2',
    },
    expectedMissing: [],
    minConfidence: 0.9,
    domains: ['email', 'calendar'],
    notes: 'OOO setup with proactive notification',
  },
  {
    id: 'focus-time-autoreplies',
    input: 'During Mon–Fri 13:00–15:00, auto-draft "in focus time" replies and suggest booking links from my calendar',
    expectedOutcome: 'Set up auto-replies for Mon-Fri 13:00-15:00 focus time with calendar booking links',
    expectedProvided: {
      dow: 'Mon–Fri',
      start: '13:00',
      end: '15:00',
    },
    expectedMissing: [],
    minConfidence: 0.85,
    domains: ['email', 'calendar'],
    notes: 'Recurring focus time boundaries',
  },

  // Cleanup & Hygiene (Templates 20-21)
  {
    id: 'calendar-hygiene',
    input: 'Review next 14 days: flag double-bookings, remove declined events, and add buffers of 10m around back-to-backs',
    expectedOutcome: 'Audit calendar for next 14 days: flag conflicts, remove declined events, add 10-minute buffers',
    expectedProvided: {
      days: 14,
      buffer_minutes: 10,
    },
    expectedMissing: [],
    minConfidence: 0.85,
    domains: ['calendar'],
    notes: 'Calendar maintenance and optimization',
  },
  {
    id: 'newsletter-digest',
    input: 'Collect newsletters from the last 7 days into one summary and schedule a single reading block of 20m',
    expectedOutcome: 'Aggregate 7-day newsletters into summary and create 20-minute reading block on calendar',
    expectedProvided: {
      days: 7,
      duration_minutes: 20,
    },
    expectedMissing: [],
    minConfidence: 0.85,
    domains: ['email', 'calendar'],
    notes: 'Newsletter batching with time blocking',
  },

  // Quick Replies & Intros (Templates 22-23)
  {
    id: 'scheduled-replies',
    input: 'For the top 8 threads today, draft short replies (crisp style) and schedule send for 17:30',
    expectedOutcome: 'Draft crisp replies for top 8 threads today and schedule sending at 17:30',
    expectedProvided: {
      max_results: 8,
      style: 'crisp',
      send_time: '17:30',
    },
    expectedMissing: [],
    minConfidence: 0.9,
    domains: ['email'],
    notes: 'Batch reply drafting with scheduled send',
  },
  {
    id: 'double-optin-intro',
    input: 'Draft a double-opt-in intro between alice@startup.com and bob@corp.io; schedule a reminder in 5d to follow up',
    expectedOutcome: 'Create double-opt-in introduction between alice@startup.com and bob@corp.io with 5-day follow-up reminder',
    expectedProvided: {
      a_email: 'alice@startup.com',
      b_email: 'bob@corp.io',
      remind: '5d',
    },
    expectedMissing: [],
    minConfidence: 0.9,
    domains: ['email', 'calendar'],
    notes: 'Professional introduction with reminder',
  },
];

/**
 * Run tests on golden utterances
 * 
 * Usage:
 * ```bash
 * pnpm tsx packages/agent/evaluation/golden-utterances.ts
 * ```
 */
console.log('Golden Utterances Test Suite');
console.log(`Total test cases: ${GOLDEN_UTTERANCES.length}`);
console.log('\nTest cases:');
GOLDEN_UTTERANCES.forEach(u => {
  console.log(`- [${u.id}] ${u.input}`);
});
console.log('\nTo run evaluation, implement runEvaluation() in framework.ts');

