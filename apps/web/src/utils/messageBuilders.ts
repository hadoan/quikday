import type { UiMessage, UiPlanData, UiLogData, UiOutputData } from '@quikday/types';
import type { BackendStep } from '@/lib/adapters/backendToViewModel';

/**
 * Builds a plan message for the chat stream
 */
export function buildPlanMessage({
  intent,
  tools,
  actions,
  steps,
  awaitingApproval,
  mode,
}: {
  intent: string;
  tools: string[];
  actions: string[];
  steps: BackendStep[];
  awaitingApproval?: boolean;
  mode?: 'approval' | 'plan';
}): UiMessage {
  return {
    role: 'assistant',
    type: 'plan',
    data: {
      intent,
      tools,
      actions,
      steps,
      awaitingApproval,
      mode,
    } satisfies UiPlanData,
  };
}

/**
 * Builds an output message for displaying structured results
 */
export function buildOutputMessage({
  title,
  content,
  type,
  data,
  presentation,
}: {
  title: string;
  content: string;
  type: 'json' | 'text' | 'summary';
  data?: unknown;
  presentation?: unknown;
}): UiMessage {
  return {
    role: 'assistant',
    type: 'output',
    data: {
      title,
      content,
      outputType: type,
      data,
      presentation,
    } satisfies UiOutputData,
  };
}

/**
 * Builds a run status message card
 */
export function buildRunMessage({
  status,
  started_at,
  completed_at,
}: {
  status: string;
  started_at?: string;
  completed_at?: string;
}): UiMessage {
  return {
    role: 'assistant',
    type: 'run',
    data: {
      status,
      started_at,
      completed_at,
    },
  };
}

/**
 * Builds a log message for step execution details
 */
export function buildLogMessage(
  entries: Array<{
    tool: string;
    action: string;
    status: string;
    request?: unknown;
    response?: unknown;
    errorCode?: string;
    errorMessage?: string;
    startedAt?: string;
    completedAt?: string;
  }>,
): UiMessage {
  return {
    role: 'assistant',
    type: 'log',
    data: {
      entries,
    } satisfies UiLogData,
  };
}

/**
 * Builds an undo message
 */
export function buildUndoMessage(available: boolean): UiMessage {
  return {
    role: 'assistant',
    type: 'undo',
    data: {
      available,
    },
  };
}
