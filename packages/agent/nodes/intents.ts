/**
 * Intents as data (lean catalog).
 * Add/remove rows here without touching logic.
 * 'id' is what flows to planner/executor.
 */
export type IntentInputType =
  | 'string'
  | 'text'
  | 'textarea'
  | 'email'
  | 'email_list'
  | 'datetime'
  | 'date'
  | 'time'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'duration'
  | 'boolean';

export type IntentInput = {
  key: string;
  type: IntentInputType;
  required?: boolean;
  prompt: string;

  // ✅ optional helpers
  values?: readonly string[]; // for select/multiselect enumerations
  when?: Record<string, string | number | boolean>; // simple equality guard, e.g. { mode: 'propose' }
};

export type Intent = {
  id: string;
  desc: string;
  inputs?: readonly IntentInput[];
};

export const INTENTS = [
  // Tier 0 — Core
  { id: 'chat.respond', desc: 'Answer normally with no tools (fallback/greetings).' },
  {
    id: 'gcal.schedule',
    desc: 'Find/create events, propose slots, invite/hold.',
    inputs: [
      { key: 'mode', type: 'select', values: ['direct', 'propose'], required: true, prompt: 'Book a specific time or propose slots? (direct/propose)' },

      { key: 'invitee_email', type: 'email', required: true, prompt: 'What’s the attendee’s email?' },
      { key: 'duration_min', type: 'number', required: true, prompt: 'How long should the meeting be (minutes)?' },
      { key: 'title', type: 'string', required: false, prompt: 'Optional title?' },
      { key: 'location', type: 'string', required: false, prompt: 'Location/VC link (optional)?' },
      { key: 'hold', type: 'boolean', required: false, prompt: 'Place a tentative hold? (default true)' },
      { key: 'auto_approve', type: 'boolean', required: false, prompt: 'Auto-approve if within policy? (optional)' },

      // direct
      { key: 'start', type: 'datetime', required: true, prompt: 'Exact start time?', when: { mode: 'direct' } },

      // propose
      { key: 'window_start', type: 'datetime', required: true, prompt: 'From when should I search?', when: { mode: 'propose' } },
      { key: 'window_end', type: 'datetime', required: true, prompt: 'Until when should I search?', when: { mode: 'propose' } },
      { key: 'count', type: 'number', required: false, prompt: 'How many slots? (default 3)', when: { mode: 'propose' } },
    ],
  },
  {
    id: 'email.read',
    desc: 'Read Gmail threads or search inbox.',

    inputs: [
      { key: 'query', type: 'string', required: false, prompt: 'Search query (optional)?' },
      {
        key: 'limit',
        type: 'number',
        required: false,
        prompt: 'Max messages to read? (default 10)',
      },
      {
        key: 'newer_than_days',
        type: 'number',
        required: false,
        prompt: 'Newer than how many days? (optional)',
      },
    ],
  },
  {
    id: 'email.send',
    desc: 'Draft and/or send Gmail emails, label/archive.',

    inputs: [
      { key: 'to', type: 'email_list', required: true, prompt: 'Who should receive the email?' },
      { key: 'subject', type: 'string', required: true, prompt: 'Email subject?' },
      { key: 'body', type: 'text', required: true, prompt: 'What should I say?' },
      { key: 'cc', type: 'email_list', required: false, prompt: 'CC (optional)?' },
      { key: 'bcc', type: 'email_list', required: false, prompt: 'BCC (optional)?' },
    ],
  },
  {
    id: 'slack.notify',
    desc: 'Post to Slack channels/DMs, brief uploads, approvals.',

    inputs: [
      {
        key: 'channel',
        type: 'string',
        required: true,
        prompt: 'Which Slack channel? (e.g., #general)',
      },
      { key: 'text', type: 'string', required: true, prompt: 'What should I post?' },
    ],
  },
  {
    id: 'notion.upsert',
    desc: 'Create/update Notion pages or simple DB rows.',

    inputs: [
      { key: 'page_title', type: 'string', required: true, prompt: 'Page title?' },
      { key: 'database', type: 'string', required: false, prompt: 'Target database (optional)?' },
    ],
  },
  {
    id: 'sheets.read',
    desc: 'Read from Google Sheets or CSV import.',

    inputs: [
      { key: 'sheet', type: 'string', required: true, prompt: 'Sheet name or URL?' },
      { key: 'tab', type: 'string', required: false, prompt: 'Tab name (optional)?' },
      { key: 'range', type: 'string', required: false, prompt: 'Cell range (optional)?' },
    ],
  },
  {
    id: 'sheets.write',
    desc: 'Append/write simple logs/rows to Google Sheets.',

    inputs: [
      { key: 'sheet', type: 'string', required: true, prompt: 'Sheet name or URL?' },
      { key: 'tab', type: 'string', required: false, prompt: 'Tab name (optional)?' },
      { key: 'values', type: 'text', required: true, prompt: 'Row values (CSV or JSON array)?' },
    ],
  },

  // Tier 1 — Revenue & Reach
  {
    id: 'linkedin.post',
    desc: 'Schedule/update LinkedIn posts (with first comment).',

    inputs: [
      { key: 'text', type: 'text', required: true, prompt: 'Post text?' },
      { key: 'first_comment', type: 'text', required: false, prompt: 'First comment (optional)?' },
      {
        key: 'schedule_time',
        type: 'datetime',
        required: false,
        prompt: 'When to post? (optional)',
      },
    ],
  },
  {
    id: 'twitter.post',
    desc: 'Schedule X (Twitter) posts (with first comment).',

    inputs: [
      { key: 'text', type: 'text', required: true, prompt: 'Post text?' },
      {
        key: 'schedule_time',
        type: 'datetime',
        required: false,
        prompt: 'When to post? (optional)',
      },
    ],
  },
  {
    id: 'crm.upsert',
    desc: 'Create/update contacts, log activities (HubSpot/Close).',

    inputs: [
      { key: 'contact', type: 'string', required: true, prompt: 'Contact email or name?' },
      { key: 'company', type: 'string', required: false, prompt: 'Company (optional)?' },
      { key: 'note', type: 'text', required: false, prompt: 'Note to log (optional)?' },
    ],
  },

  // Tier 2 — Builder
  {
    id: 'github.create_issue',
    desc: 'Create GitHub issues from triage.',

    inputs: [
      { key: 'repo', type: 'string', required: true, prompt: 'Repository (owner/name)?' },
      { key: 'title', type: 'string', required: true, prompt: 'Issue title?' },
      { key: 'body', type: 'text', required: false, prompt: 'Issue description (optional)?' },
      {
        key: 'labels',
        type: 'string',
        required: false,
        prompt: 'Labels (comma-separated, optional)?',
      },
    ],
  },
  {
    id: 'jira.create_issue',
    desc: 'Create Jira issues from triage.',

    inputs: [
      { key: 'project_key', type: 'string', required: true, prompt: 'Project key?' },
      { key: 'title', type: 'string', required: true, prompt: 'Issue summary?' },
      { key: 'body', type: 'text', required: false, prompt: 'Issue description (optional)?' },
      {
        key: 'assignees',
        type: 'string',
        required: false,
        prompt: 'Assignees (comma-separated, optional)?',
      },
    ],
  },
  // Keep literal ids while type-checking fields
] as const satisfies readonly Intent[];

export type IntentId = (typeof INTENTS)[number]['id'];

// // Convenience named exports for commonly used intents to avoid stringly-typed code.
// export const INTENT = {
//   CALENDAR_SCHEDULE: 'gcal.schedule' as IntentId,
//   EMAIL_READ: 'email.read' as IntentId,
//   EMAIL_SEND: 'email.send' as IntentId,
//   SLACK_NOTIFY: 'slack.notify' as IntentId,
//   NOTION_UPSERT: 'notion.upsert' as IntentId,
// } as const;

// export type IntentConst = (typeof INTENT)[keyof typeof INTENT];
