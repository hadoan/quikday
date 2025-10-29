export const mockRuns = [
  {
    id: 'R-1001',
    prompt: 'Post this on LinkedIn tomorrow at 9am',
    timestamp: '2025-10-17T14:30:00Z',
    status: 'completed' as const,
    messages: [
      {
        role: 'user' as const,
        content:
          "Post this on LinkedIn tomorrow at 9am: 'Excited to announce our new product launch! 🚀'",
      },
      {
        role: 'assistant' as const,
        type: 'plan',
        data: {
          intent: 'Schedule LinkedIn post',
          tools: ['LinkedIn'],
          actions: ['Schedule post for 2025-10-18 09:00:00'],
          mode: 'plan' as const,
        },
      },
      {
        role: 'assistant' as const,
        type: 'run',
        data: {
          status: 'success' as const,
          started_at: '2025-10-17T14:30:05Z',
          completed_at: '2025-10-17T14:30:08Z',
        },
      },
      {
        role: 'assistant' as const,
        type: 'log',
        data: [
          {
            tool: 'LinkedIn',
            action: 'Post scheduled',
            time: '14:30:06',
            status: 'success' as const,
          },
        ],
      },
      {
        role: 'assistant' as const,
        type: 'undo',
        data: {
          available: true,
        },
      },
    ],
  },
  {
    id: 'R-1002',
    prompt: 'Schedule a 15-min sync with Sara at 10am and DM her the link',
    timestamp: '2025-10-17T08:01:00Z',
    status: 'completed' as const,
    messages: [
      {
        role: 'user' as const,
        content: 'Schedule a 15-min sync with ha.doanmanh@gmail.com at 10am tomorrow',
      },
      {
        role: 'assistant' as const,
        type: 'plan',
        data: {
          intent: 'Schedule meeting and send invitation',
          tools: ['Google Calendar', 'Slack'],
          actions: ['Create 15-min event at 10:00', 'Send DM with calendar link to Sara'],
          mode: 'plan' as const,
        },
      },
      {
        role: 'assistant' as const,
        type: 'run',
        data: {
          status: 'success' as const,
          started_at: '2025-10-17T08:01:00Z',
          completed_at: '2025-10-17T08:01:05Z',
        },
      },
      {
        role: 'assistant' as const,
        type: 'log',
        data: [
          {
            tool: 'Calendar',
            action: "Event created: 'Sync with Sara'",
            time: '08:01:02',
            status: 'success' as const,
          },
          {
            tool: 'Slack',
            action: 'DM sent to @sara',
            time: '08:01:04',
            status: 'success' as const,
          },
        ],
      },
      {
        role: 'assistant' as const,
        type: 'undo',
        data: {
          available: true,
        },
      },
    ],
  },
  {
    id: 'R-1003',
    prompt: "Summarize #growth thread into Notion under 'Q4 OKRs'",
    timestamp: '2025-10-17T11:15:00Z',
    status: 'completed' as const,
    messages: [
      {
        role: 'user' as const,
        content: "Summarize the #growth Slack thread from today into Notion under 'Q4 OKRs'",
      },
      {
        role: 'assistant' as const,
        type: 'plan',
        data: {
          intent: 'Summarize Slack thread and save to Notion',
          tools: ['Slack', 'Notion'],
          actions: [
            'Fetch messages from #growth channel',
            'Generate summary using AI',
            "Create page in Notion 'Q4 OKRs'",
          ],
          mode: 'plan' as const,
        },
      },
      {
        role: 'assistant' as const,
        type: 'run',
        data: {
          status: 'success' as const,
          started_at: '2025-10-17T11:15:00Z',
          completed_at: '2025-10-17T11:15:12Z',
          progress: 100,
        },
      },
      {
        role: 'assistant' as const,
        type: 'log',
        data: [
          {
            tool: 'Slack',
            action: 'Fetched 47 messages from #growth',
            time: '11:15:02',
            status: 'success' as const,
          },
          {
            tool: 'AI',
            action: 'Generated summary (342 words)',
            time: '11:15:08',
            status: 'success' as const,
          },
          {
            tool: 'Notion',
            action: "Created page in 'Q4 OKRs'",
            time: '11:15:11',
            status: 'success' as const,
          },
        ],
      },
      {
        role: 'assistant' as const,
        type: 'output',
        data: {
          title: 'Growth Thread Summary',
          content: `**Key Discussion Points:**
          
1. User acquisition strategies for Q4
   - Focus on organic growth via content marketing
   - Partner with 3 influencers in our niche
   
2. Conversion rate optimization
   - A/B test new landing page designs
   - Improve onboarding flow based on user feedback
   
3. Retention initiatives
   - Launch customer success program
   - Build automated email nurture sequences

**Action Items:**
- @john: Draft influencer outreach plan by Friday
- @sara: Set up A/B test framework
- @mike: Design onboarding flow v2`,
          type: 'summary' as const,
        },
      },
      {
        role: 'assistant' as const,
        type: 'undo',
        data: {
          available: true,
        },
      },
    ],
  },
  {
    id: 'R-1004',
    prompt: 'Draft a follow-up for client A, log to HubSpot',
    timestamp: '2025-10-17T16:45:00Z',
    status: 'completed' as const,
    messages: [
      {
        role: 'user' as const,
        content:
          'Draft a follow-up email for Acme Corp about our pricing discussion, and log it to HubSpot',
      },
      {
        role: 'assistant' as const,
        type: 'plan',
        data: {
          intent: 'Draft email and log to CRM',
          tools: ['Email', 'HubSpot'],
          actions: [
            'Generate follow-up email draft',
            'Create activity log in HubSpot for Acme Corp',
          ],
          mode: 'plan' as const,
        },
      },
      {
        role: 'assistant' as const,
        type: 'run',
        data: {
          status: 'success' as const,
          started_at: '2025-10-17T16:45:00Z',
          completed_at: '2025-10-17T16:45:06Z',
        },
      },
      {
        role: 'assistant' as const,
        type: 'log',
        data: [
          {
            tool: 'AI',
            action: 'Email draft generated',
            time: '16:45:03',
            status: 'success' as const,
          },
          {
            tool: 'HubSpot',
            action: 'Activity logged for Acme Corp',
            time: '16:45:05',
            status: 'success' as const,
          },
        ],
      },
      {
        role: 'assistant' as const,
        type: 'output',
        data: {
          title: 'Email Draft',
          content: `Subject: Following up on our pricing discussion

Hi team at Acme Corp,

Thank you for taking the time to discuss your needs with us yesterday. I wanted to follow up on the pricing options we covered.

Based on your requirements for 50 users and enterprise-level support, I recommend our Pro plan at $2,999/month, which includes:

• Unlimited users
• Priority support with 2-hour SLA
• Custom integrations
• Dedicated account manager

I'd be happy to set up a quick call this week to answer any questions. Would Thursday at 2pm work for you?

Best regards,
[Your name]`,
          type: 'text' as const,
        },
      },
      {
        role: 'assistant' as const,
        type: 'undo',
        data: {
          available: true,
        },
      },
    ],
  },
  {
    id: 'R-1005',
    prompt: "Summarize today's tasks from Slack and Jira",
    timestamp: '2025-10-17T17:00:00Z',
    status: 'completed' as const,
    messages: [
      {
        role: 'user' as const,
        content: "Generate a daily stand-up summary from today's Slack messages and Jira tickets",
      },
      {
        role: 'assistant' as const,
        type: 'plan',
        data: {
          intent: 'Generate daily stand-up summary',
          tools: ['Slack', 'Jira'],
          actions: [
            "Fetch today's messages from key Slack channels",
            'Get assigned Jira tickets with updates',
            'Combine and summarize activities',
          ],
          mode: 'plan' as const,
        },
      },
      {
        role: 'assistant' as const,
        type: 'run',
        data: {
          status: 'success' as const,
          started_at: '2025-10-17T17:00:00Z',
          completed_at: '2025-10-17T17:00:15Z',
          progress: 100,
        },
      },
      {
        role: 'assistant' as const,
        type: 'log',
        data: [
          {
            tool: 'Slack',
            action: 'Fetched 124 messages from 5 channels',
            time: '17:00:03',
            status: 'success' as const,
          },
          {
            tool: 'Jira',
            action: 'Retrieved 8 tickets with updates',
            time: '17:00:08',
            status: 'success' as const,
          },
          { tool: 'AI', action: 'Generated summary', time: '17:00:13', status: 'success' as const },
        ],
      },
      {
        role: 'assistant' as const,
        type: 'output',
        data: {
          title: 'Daily Stand-up Summary - Oct 17, 2025',
          content: `**Completed Today:**
• Fixed authentication bug in production (JIRA-234)
• Reviewed 3 pull requests from team members
• Met with design team about new landing page
• Updated documentation for API v2

**In Progress:**
• Working on user dashboard redesign (JIRA-245)
• Testing new payment integration (JIRA-246)

**Blockers:**
• Waiting for API keys from partner team
• Need design approval for checkout flow

**Slack Highlights:**
• #engineering: Deployed hotfix for mobile app crash
• #product: Discussed Q4 roadmap priorities
• #general: Team lunch scheduled for Friday`,
          type: 'summary' as const,
        },
      },
      {
        role: 'assistant' as const,
        type: 'undo',
        data: {
          available: true,
        },
      },
    ],
  },
];

export const mockTools = [
  { name: 'Google Calendar', status: 'connected' as const },
  { name: 'Slack', status: 'connected' as const },
  { name: 'Notion', status: 'connected' as const },
  { name: 'Email', status: 'connected' as const },
  { name: 'HubSpot', status: 'connected' as const },
  { name: 'Jira', status: 'connected' as const },
];

export const mockStats = {
  runsToday: 12,
  successRate: 94,
};
