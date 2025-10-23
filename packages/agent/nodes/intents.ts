/**
 * Intents as data (lean catalog).
 * Add/remove rows here without touching logic.
 * 'id' is what flows to planner/executor.
 */
export const INTENTS = [
  // Tier 0 — Core
  { id: "calendar.schedule",  desc: "Find/create events, propose slots, invite/hold." },
  { id: "email.read",         desc: "Read Gmail threads or search inbox." },
  { id: "email.send",         desc: "Draft and/or send Gmail emails, label/archive." },
  { id: "slack.notify",       desc: "Post to Slack channels/DMs, brief uploads, approvals." },
  { id: "notion.upsert",      desc: "Create/update Notion pages or simple DB rows." },
  { id: "sheets.read",        desc: "Read from Google Sheets or CSV import." },
  { id: "sheets.write",       desc: "Append/write simple logs/rows to Google Sheets." },

  // Tier 1 — Revenue & Reach
  { id: "linkedin.post",      desc: "Schedule/update LinkedIn posts (with first comment)." },
  { id: "twitter.post",       desc: "Schedule X (Twitter) posts (with first comment)." },
  { id: "crm.upsert",         desc: "Create/update contacts, log activities (HubSpot/Close)." },

  // Tier 2 — Builder
  { id: "github.create_issue",desc: "Create GitHub issues from triage." },
  { id: "jira.create_issue",  desc: "Create Jira issues from triage." },
] as const;

export type IntentId = typeof INTENTS[number]["id"];

// Convenience named exports for commonly used intents to avoid stringly-typed code.
export const INTENT = {
  CALENDAR_SCHEDULE: "calendar.schedule" as IntentId,
  EMAIL_READ: "email.read" as IntentId,
  EMAIL_SEND: "email.send" as IntentId,
  SLACK_NOTIFY: "slack.notify" as IntentId,
  NOTION_UPSERT: "notion.upsert" as IntentId,
} as const;

export type IntentConst = typeof INTENT[keyof typeof INTENT];

