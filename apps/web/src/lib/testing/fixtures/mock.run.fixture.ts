/**
 * mock.run.fixture.ts
 *
 * Golden fixture representing what the UI expects (from MockDataSource).
 * Used for snapshot testing to ensure ApiDataSource adapters produce identical output.
 */

import type { UiRunSummary, UiPlanStep, UiEvent } from '../../datasources/DataSource';

export const mockRunFixture: UiRunSummary = {
  id: 'R-1001',
  prompt: 'Post this on LinkedIn tomorrow at 9am',
  status: 'completed',
  timestamp: '2025-10-17T14:30:00Z',
  messages: [
    {
      role: 'user',
      content:
        "Post this on LinkedIn tomorrow at 9am: 'Excited to announce our new product launch! 🚀'",
    },
    {
      role: 'assistant',
      type: 'plan',
      data: {
        intent: 'Schedule LinkedIn post',
        tools: ['LinkedIn'],
        actions: ['Schedule post for 2025-10-18 09:00:00'],
        mode: 'plan',
      },
    },
    {
      role: 'assistant',
      type: 'run',
      data: {
        status: 'success',
        started_at: '2025-10-17T14:30:05Z',
        completed_at: '2025-10-17T14:30:08Z',
      },
    },
    {
      role: 'assistant',
      type: 'log',
      data: {
        entries: [
          {
            id: 'step-1',
            tool: 'LinkedIn',
            action: 'Post scheduled',
            time: '14:30:06',
            status: 'success',
          },
        ],
      },
    },
    {
      role: 'assistant',
      type: 'undo',
      data: {
        available: true,
      },
    },
  ],
};

export const mockStepsFixture: UiPlanStep[] = [
  {
    id: 'step-1',
    tool: 'LinkedIn',
    action: 'Post scheduled',
    status: 'succeeded',
    time: '14:30:06',
  },
];

export const mockEventsFixture: UiEvent[] = [
  {
    type: 'plan_generated',
    payload: {
      intent: 'Schedule LinkedIn post',
      tools: ['LinkedIn'],
      actions: ['Schedule post for 2025-10-18 09:00:00'],
      mode: 'plan',
    },
    ts: '2025-10-17T14:30:00Z',
    runId: 'R-1001',
  },
  {
    type: 'run_status',
    payload: {
      status: 'success',
      started_at: '2025-10-17T14:30:05Z',
      completed_at: '2025-10-17T14:30:08Z',
    },
    ts: '2025-10-17T14:30:00Z',
    runId: 'R-1001',
  },
  {
    type: 'step_succeeded',
    payload: {
      entries: [
        {
          id: 'step-1',
          tool: 'LinkedIn',
          action: 'Post scheduled',
          time: '14:30:06',
          status: 'success',
        },
      ],
    },
    ts: '2025-10-17T14:30:00Z',
    runId: 'R-1001',
  },
  {
    type: 'run_completed',
    payload: {
      available: true,
    },
    ts: '2025-10-17T14:30:00Z',
    runId: 'R-1001',
  },
];
