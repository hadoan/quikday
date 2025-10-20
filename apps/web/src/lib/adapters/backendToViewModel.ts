/**
 * backendToViewModel.ts
 *
 * Pure adapter functions to convert backend API responses to UI view models.
 * These functions are unit-testable and preserve unknown fields for debugging.
 *
 * RULES:
 * - Never throw; return safe defaults if shape is unexpected
 * - Preserve unknown fields in payload._raw for debugging
 * - Normalize dates to ISO strings
 * - Map backend codes to existing UI status names
 */

import type {
  UiRunSummary,
  UiPlanStep,
  UiEvent,
  UiMessage,
  UiCredential,
  UiRunStatus,
  UiStepStatus,
} from '../datasources/DataSource';

// ============================================================================
// Status Mapping (backend → UI)
// ============================================================================

const RUN_STATUS_MAP: Record<string, UiRunStatus> = {
  // Backend statuses
  queued: 'queued',
  planning: 'planning',
  planned: 'awaiting_approval',
  executing: 'executing',
  scheduled: 'scheduled',
  succeeded: 'succeeded',
  completed: 'succeeded', // alias
  failed: 'failed',
  partial: 'partial',
  cancelled: 'failed',

  // Legacy support
  running: 'executing',
  done: 'succeeded',
};

const STEP_STATUS_MAP: Record<string, UiStepStatus> = {
  pending: 'pending',
  started: 'started',
  running: 'started', // alias
  succeeded: 'succeeded',
  success: 'succeeded', // alias
  completed: 'succeeded', // alias
  failed: 'failed',
  error: 'failed', // alias
  skipped: 'skipped',
  cancelled: 'skipped', // alias
};

// ============================================================================
// Adapter: Backend Run → UiRunSummary
// ============================================================================

export interface BackendRun {
  id: string;
  prompt?: string;
  status?: string;
  mode?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  scheduledAt?: string;
  config?: {
    channelTargets?: Array<{ appId: string; credentialId?: number }>;
    summary?: string;
    [key: string]: unknown;
  };
  steps?: BackendStep[];
  effects?: BackendEffect[];
  [key: string]: unknown;
}

export function adaptRunBackendToUi(backend: BackendRun): UiRunSummary {
  const run: UiRunSummary = {
    id: backend.id || 'unknown',
    prompt: backend.prompt || '',
    status: mapRunStatus(backend.status),
    timestamp: backend.createdAt || new Date().toISOString(),
    createdAt: backend.createdAt,
    completedAt: backend.completedAt,
    scheduledAt: backend.scheduledAt,
    summaryText: backend.config?.summary,
    mode: backend.mode as UiRunSummary['mode'],
  };

  // Extract links from effects if available
  if (backend.effects && Array.isArray(backend.effects)) {
    run.links = backend.effects
      .filter((e) => e.resourceUrl)
      .map((e) => ({
        provider: e.appId || 'unknown',
        url: e.resourceUrl!,
        externalId: e.externalId || '',
      }));
  }

  return run;
}

// ============================================================================
// Adapter: Backend Step → UiPlanStep
// ============================================================================

export interface BackendStep {
  id?: string;
  tool?: string;
  appId?: string;
  action?: string;
  status?: string;
  request?: unknown;
  response?: unknown;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export function adaptStepsBackendToUi(backendSteps: BackendStep[]): UiPlanStep[] {
  return backendSteps.map((step, idx) => adaptStepBackendToUi(step, idx));
}

export function adaptStepBackendToUi(backend: BackendStep, index = 0): UiPlanStep {
  const step: UiPlanStep = {
    id: backend.id || `step-${index}`,
    tool: backend.tool || 'unknown',
    appId: backend.appId,
    action: backend.action,
    status: mapStepStatus(backend.status),
    inputsPreview: stringifyPreview(backend.request),
    outputsPreview: stringifyPreview(backend.response),
    request: backend.request,
    response: backend.response,
    errorCode: backend.errorCode,
    errorMessage: backend.errorMessage,
    startedAt: backend.startedAt || backend.createdAt,
    completedAt: backend.completedAt,
  };

  // Generate time label for UI
  if (step.startedAt) {
    try {
      const date = new Date(step.startedAt);
      step.time = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    } catch {
      step.time = '';
    }
  }

  return step;
}

// ============================================================================
// Adapter: WebSocket Message → UiEvent
// ============================================================================

export interface BackendWsMessage {
  type?: string;
  event?: string;
  data?: unknown;
  payload?: unknown;
  ts?: string;
  timestamp?: string;
  runId?: string;
  [key: string]: unknown;
}

export function adaptWsEventToUi(message: BackendWsMessage): UiEvent {
  const eventType = message.type || message.event || 'run_status';
  const payload = (message.data || message.payload || {}) as Record<string, unknown>;

  // Preserve raw message for debugging
  payload._raw = message;

  const event: UiEvent = {
    type: mapEventType(eventType),
    payload,
    ts: message.ts || message.timestamp || new Date().toISOString(),
    runId: message.runId,
  };

  return event;
}

// ============================================================================
// Adapter: Backend Effect → Link
// ============================================================================

export interface BackendEffect {
  id?: string;
  appId?: string;
  resourceUrl?: string;
  externalId?: string;
  canUndo?: boolean;
  undoneAt?: string;
  [key: string]: unknown;
}

// ============================================================================
// Adapter: Backend Credential → UiCredential
// ============================================================================

export interface BackendCredential {
  id: number;
  appId?: string;
  label?: string;
  displayName?: string;
  avatarUrl?: string;
  isCurrent?: boolean;
  isInvalid?: boolean;
  lastValidatedAt?: string;
  [key: string]: unknown;
}

export function adaptCredentialBackendToUi(backend: BackendCredential): UiCredential {
  return {
    id: backend.id,
    appId: backend.appId || 'unknown',
    label: backend.label || backend.displayName || `Credential ${backend.id}`,
    avatarUrl: backend.avatarUrl,
    current: backend.isCurrent,
    invalid: backend.isInvalid,
    lastValidatedAt: backend.lastValidatedAt,
  };
}

export function adaptCredentialsBackendToUi(backendCreds: BackendCredential[]): UiCredential[] {
  return backendCreds.map(adaptCredentialBackendToUi);
}

// ============================================================================
// Helper Functions
// ============================================================================

function mapRunStatus(status?: string): UiRunStatus {
  if (!status) return 'queued';
  return RUN_STATUS_MAP[status.toLowerCase()] || 'queued';
}

function mapStepStatus(status?: string): UiStepStatus {
  if (!status) return 'pending';
  return STEP_STATUS_MAP[status.toLowerCase()] || 'pending';
}

function mapEventType(type: string): UiEvent['type'] {
  const typeMap: Record<string, UiEvent['type']> = {
    connection_established: 'connection_established',
    connected: 'connection_established', // alias

    plan_generated: 'plan_generated',
    plan: 'plan_generated', // alias

    step_started: 'step_started',
    step_start: 'step_started', // alias

    step_output: 'step_output',
    step_result: 'step_output', // alias

    step_succeeded: 'step_succeeded',
    step_success: 'step_succeeded', // alias
    step_completed: 'step_succeeded', // alias

    step_failed: 'step_failed',
    step_error: 'step_failed', // alias

    awaiting_approval: 'awaiting_approval',
    approval_required: 'awaiting_approval', // alias

    scheduled: 'scheduled',

    run_completed: 'run_completed',
    run_succeeded: 'run_completed', // alias
    completed: 'run_completed', // alias

    run_failed: 'run_failed',
    failed: 'run_failed', // alias
    error: 'run_failed', // alias

    run_status: 'run_status',
    status: 'run_status', // alias
  };

  return typeMap[type.toLowerCase()] || 'run_status';
}

function stringifyPreview(data: unknown, maxLength = 100): string | undefined {
  if (data === null || data === undefined) return undefined;

  try {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return str.length > maxLength ? `${str.substring(0, maxLength)}...` : str;
  } catch {
    return '[preview unavailable]';
  }
}

// ============================================================================
// Message Builders (for constructing UiMessage from backend data)
// ============================================================================

export function buildPlanMessage(data: {
  intent?: string;
  tools?: string[];
  actions?: string[];
  steps?: BackendStep[];
}): UiMessage {
  return {
    role: 'assistant',
    type: 'plan',
    data: {
      intent: data.intent || 'Processing request',
      tools: data.tools || [],
      actions: data.actions || [],
      mode: 'plan',
      steps: data.steps ? adaptStepsBackendToUi(data.steps) : undefined,
    },
  };
}

export function buildRunMessage(data: {
  status?: string;
  started_at?: string;
  completed_at?: string;
  progress?: number;
}): UiMessage {
  return {
    role: 'assistant',
    type: 'run',
    data: {
      status: mapRunStatus(data.status),
      started_at: data.started_at,
      completed_at: data.completed_at,
      progress: data.progress,
    },
  };
}

export function buildLogMessage(steps: BackendStep[]): UiMessage {
  const entries = adaptStepsBackendToUi(steps);
  return {
    role: 'assistant',
    type: 'log',
    data: {
      entries,
    },
  };
}

export function buildOutputMessage(data: {
  title?: string;
  content?: string;
  summary?: string;
  type?: string;
  data?: unknown;
}): UiMessage {
  return {
    role: 'assistant',
    type: 'output',
    data: {
      title: data.title || 'Output',
      content: data.content || data.summary || '',
      type: (data.type as 'text' | 'summary' | 'markdown' | 'json') || 'text',
      data: data.data,
    },
  };
}

export function buildUndoMessage(canUndo: boolean, deadline?: string): UiMessage {
  return {
    role: 'assistant',
    type: 'undo',
    data: {
      available: canUndo,
      allowed: canUndo,
      deadline,
    },
  };
}
