/**
 * backend.run.fixture.ts
 * 
 * Golden fixture representing what the backend returns.
 * Used for adapter testing to ensure consistent transformation to UI view models.
 */

import type { BackendRun, BackendStep } from '../../adapters/backendToViewModel';

export const backendRunFixture: BackendRun = {
  id: 'R-1001',
  prompt: "Post this on LinkedIn tomorrow at 9am: 'Excited to announce our new product launch! 🚀'",
  status: 'completed',
  mode: 'auto',
  createdAt: '2025-10-17T14:30:00.000Z',
  updatedAt: '2025-10-17T14:30:08.000Z',
  completedAt: '2025-10-17T14:30:08.000Z',
  config: {
    channelTargets: [
      {
        appId: 'linkedin',
        credentialId: 123,
      },
    ],
    summary: 'LinkedIn post scheduled successfully for October 18 at 9:00 AM',
  },
  steps: [
    {
      id: 'step-abc123',
      tool: 'linkedin_post',
      appId: 'linkedin',
      action: 'schedule_post',
      status: 'succeeded',
      request: {
        content: 'Excited to announce our new product launch! 🚀',
        scheduledFor: '2025-10-18T09:00:00.000Z',
      },
      response: {
        postId: 'urn:li:share:7123456789',
        scheduledAt: '2025-10-18T09:00:00.000Z',
      },
      startedAt: '2025-10-17T14:30:05.000Z',
      completedAt: '2025-10-17T14:30:08.000Z',
      createdAt: '2025-10-17T14:30:05.000Z',
    },
  ],
  effects: [
    {
      id: 'effect-xyz789',
      appId: 'linkedin',
      resourceUrl: 'https://www.linkedin.com/feed/update/urn:li:share:7123456789',
      externalId: 'urn:li:share:7123456789',
      canUndo: true,
      undoneAt: null,
    },
  ],
};

export const backendStepsFixture: BackendStep[] = [
  {
    id: 'step-abc123',
    tool: 'linkedin_post',
    appId: 'linkedin',
    action: 'schedule_post',
    status: 'succeeded',
    request: {
      content: 'Excited to announce our new product launch! 🚀',
      scheduledFor: '2025-10-18T09:00:00.000Z',
    },
    response: {
      postId: 'urn:li:share:7123456789',
      scheduledAt: '2025-10-18T09:00:00.000Z',
    },
    startedAt: '2025-10-17T14:30:05.000Z',
    completedAt: '2025-10-17T14:30:08.000Z',
    createdAt: '2025-10-17T14:30:05.000Z',
  },
];

// Example backend WebSocket message
export const backendWsMessageFixture = {
  type: 'step_completed',
  data: {
    stepId: 'step-abc123',
    tool: 'linkedin_post',
    status: 'succeeded',
    output: {
      postId: 'urn:li:share:7123456789',
    },
  },
  ts: '2025-10-17T14:30:08.000Z',
  runId: 'R-1001',
};

// Example backend error response
export const backendErrorFixture = {
  id: 'R-1002',
  prompt: 'Post to LinkedIn',
  status: 'failed',
  mode: 'auto',
  createdAt: '2025-10-17T15:00:00.000Z',
  updatedAt: '2025-10-17T15:00:05.000Z',
  completedAt: '2025-10-17T15:00:05.000Z',
  steps: [
    {
      id: 'step-def456',
      tool: 'linkedin_post',
      appId: 'linkedin',
      action: 'create_post',
      status: 'failed',
      errorCode: 'E_CREDENTIAL_INVALID',
      errorMessage: 'LinkedIn credentials expired. Please reconnect your account.',
      startedAt: '2025-10-17T15:00:02.000Z',
      completedAt: '2025-10-17T15:00:05.000Z',
      createdAt: '2025-10-17T15:00:02.000Z',
    },
  ],
  effects: [],
};
