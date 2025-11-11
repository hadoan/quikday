// Template data for seeding database
// Using template literals to avoid curly brace conflicts

export const templateData = [
  // Triage & Priorities (1-3)
  {
    kind: 'triage_10min',
    label: '10-Minute Priority Triage',
    sampleText:
      'Give me a {minutes=10}-minute triage of priority emails and create quick-reply drafts (max {max=8}).',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
    category: 'triage',
    locale: 'en' as const,
  },
  {
    kind: 'inbox_sprint_15min',
    label: '15-Minute Inbox Sprint',
    sampleText:
      'Run a {minutes=15}-minute inbox sprint: archive newsletters, snooze low-priority items for {snooze=3d}, and surface actionables (max {max=12}).',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    category: 'triage',
    locale: 'en' as const,
  },
  {
    kind: 'time_sensitive_threads',
    label: 'Time-Sensitive Threads',
    sampleText:
      'Show top {max=10} time-sensitive threads from the last {days=3} days and draft concise replies.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    category: 'triage',
    locale: 'en' as const,
  },

  // Follow-ups & Sweeps (4-6)
  {
    kind: 'no_reply_sweep',
    label: 'No-Reply Sweep',
    sampleText:
      'Sweep my sent threads with no reply from the last {days=14} days and draft polite nudges (tone {tone=polite|friendly|direct}).',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><path d="M8 10h8M8 14h4"/></svg>',
    category: 'follow-ups',
    locale: 'en' as const,
  },
  {
    kind: 'starred_follow_ups',
    label: 'Starred Follow-ups',
    sampleText:
      'Find starred threads older than {days=7} days without response and draft follow-ups (max {max=15}).',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    category: 'follow-ups',
    locale: 'en' as const,
  },
  {
    kind: 'auto_nudge_followup',
    label: 'Auto-Nudge Follow-up',
    sampleText: 'For follow-ups I send today, schedule a second nudge in {after=3d} if no reply.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/><path d="M3.05 11a9 9 0 011.97-5.5m14.93 5.5a9 9 0 01-1.97 5.5"/></svg>',
    category: 'follow-ups',
    locale: 'en' as const,
  },

  // Meeting Prep & Recaps (7-9)
  {
    kind: 'meeting_prep_onepager',
    label: 'Meeting Prep One-Pager',
    sampleText:
      'Prepare a one-pager for my {when=date/time or title} meeting with {name/company} using related recent emails; add 3 talking points.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>',
    category: 'meeting-prep',
    locale: 'en' as const,
  },
  {
    kind: 'meeting_recap_reminder',
    label: 'Meeting Recap + Reminder',
    sampleText:
      'Draft a recap for the last meeting with {contact=email} and add a follow-up reminder in {followup=3d} on my calendar.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
    category: 'meeting-prep',
    locale: 'en' as const,
  },
  {
    kind: 'next_24h_meeting_prep',
    label: 'Next 24h Meeting Prep',
    sampleText:
      'For my next {hours=24} hours of meetings, draft quick "see you soon" emails with agenda bullets to all attendees.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    category: 'meeting-prep',
    locale: 'en' as const,
  },

  // Scheduling Helpers (10-12)
  {
    kind: 'availability_slots',
    label: 'Availability Slot Proposer',
    sampleText:
      'From my availability over the next {days=7} days, propose {slots=3} 30-min slots and draft a scheduling email to {to=email}.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10H3M16 2v4M8 2v4M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"/><path d="M8 14h3v3H8z"/></svg>',
    category: 'scheduling',
    locale: 'en' as const,
  },
  {
    kind: 'conflict_reschedule',
    label: 'Conflict Reschedule Helper',
    sampleText:
      'Detect conflicts in the next {days=5} days and draft reschedule emails with {slots=2} alternatives.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><path d="M22 12h-4M6 12H2"/></svg>',
    category: 'scheduling',
    locale: 'en' as const,
  },
  {
    kind: 'focus_blocks',
    label: 'Auto Focus Blocks',
    sampleText:
      'Create calendar focus blocks tomorrow for top actionable threads (max {max=5}) with {duration=30m} each; link emails in description.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>',
    category: 'scheduling',
    locale: 'en' as const,
  },

  // Digests & Daily Ops (13-15)
  {
    kind: 'daily_digest',
    label: 'Daily Digest',
    sampleText:
      "Every weekday at {time=08:45}, send a digest of today's meetings, hot emails, and pending follow-ups (max {max=8}).",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z"/><path d="M22 6l-10 7L2 6"/></svg>',
    category: 'digests',
    locale: 'en' as const,
  },
  {
    kind: 'weekly_summary',
    label: 'Weekly Summary',
    sampleText:
      "Each {weekday=Mon} at {time=09:00}, summarize key threads from last week, this week's meetings, and suggested follow-ups.",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 12h6M9 16h6"/></svg>',
    category: 'digests',
    locale: 'en' as const,
  },
  {
    kind: 'action_items_extract',
    label: 'Action Items Extract',
    sampleText:
      'Extract action items from the last {days=3} days of starred threads and add calendar reminders across {spread=3d}.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',
    category: 'digests',
    locale: 'en' as const,
  },

  // RSVP & Confirmations (16-17)
  {
    kind: 'smart_rsvp',
    label: 'Smart RSVP',
    sampleText:
      'For invites in the last {days=7} days, draft RSVP emails based on my calendar availability; accept if free, propose alt slots if busy.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3 8-8"/><circle cx="12" cy="12" r="10"/></svg>',
    category: 'rsvp',
    locale: 'en' as const,
  },
  {
    kind: 'meeting_confirm',
    label: 'Meeting Confirmation',
    sampleText:
      'Confirm the {title=text} meeting on {date=date} at {time=time} with location {loc=text} and attach a brief agenda.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/><path d="M9 12l2 2 4-4"/></svg>',
    category: 'rsvp',
    locale: 'en' as const,
  },

  // Out-of-Office & Boundaries (18-19)
  {
    kind: 'out_of_office',
    label: 'Out-of-Office Setup',
    sampleText:
      'Set an out-of-office from {start=date} to {end=date} with this message: {msg=text}. Draft a heads-up to my top contacts.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 106 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/><path d="M2 8h20"/></svg>',
    category: 'boundaries',
    locale: 'en' as const,
  },
  {
    kind: 'focus_time_auto_reply',
    label: 'Focus Time Auto-Reply',
    sampleText:
      'During {dow=Mon–Fri} {start=13:00}–{end=15:00}, auto-draft "in focus time" replies and suggest booking links from my calendar.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24"/></svg>',
    category: 'boundaries',
    locale: 'en' as const,
  },

  // Cleanup & Hygiene (20-21)
  {
    kind: 'calendar_cleanup',
    label: 'Calendar Cleanup',
    sampleText:
      'Review next {days=14} days: flag double-bookings, remove declined events, and add buffers of {buffer=10m} around back-to-backs.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
    category: 'cleanup',
    locale: 'en' as const,
  },
  {
    kind: 'newsletter_summary',
    label: 'Newsletter Summary Block',
    sampleText:
      'Collect newsletters from the last {days=7} days into one summary and schedule a single reading block of {duration=20m}.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z"/><path d="M4 10h16"/></svg>',
    category: 'cleanup',
    locale: 'en' as const,
  },

  // Quick Replies & Intros (22-23)
  {
    kind: 'batch_replies',
    label: 'Batch Quick Replies',
    sampleText:
      'For the top {max=8} threads today, draft short replies ({style=crisp|friendly|formal}) and schedule send for {send_time=17:30}.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    category: 'quick-replies',
    locale: 'en' as const,
  },
  {
    kind: 'double_optin_intro',
    label: 'Double Opt-in Intro',
    sampleText:
      'Draft a double-opt-in intro between {a=email} and {b=email}; schedule a reminder in {remind=5d} to follow up.',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>',
    category: 'quick-replies',
    locale: 'en' as const,
  },
];
