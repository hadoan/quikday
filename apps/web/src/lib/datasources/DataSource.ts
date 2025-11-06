/**
 * DataSource.ts
 *
 * Stable view-model contracts that mirror current UI component props.
 * Both MockDataSource and ApiDataSource implement this interface,
 * ensuring UI components receive identical data shapes regardless of source.
 */

// ============================================================================
// UI Status Types (matching existing component expectations)
// ============================================================================

export type UiRunStatus =
  | 'queued'
  | 'awaiting_input'
  | 'planning'
  | 'awaiting_approval'
  | 'executing'
  | 'scheduled'
  | 'succeeded'
  | 'failed'
  | 'partial'
  | 'running' // legacy support
  | 'completed' // legacy support
  | 'done'; // legacy support

export type UiStepStatus = 'pending' | 'started' | 'succeeded' | 'failed' | 'skipped' | 'success';

export type UiMessageRole = 'user' | 'assistant';

export type UiMessageType =
  | 'plan'
  | 'run'
  | 'log'
  | 'output'
  | 'undo'
  | 'config'
  | 'error'
  | 'params'
  | 'questions';

// ============================================================================
// Core View Models (mirror current UI props)
// ============================================================================

export interface UiRunSummary {
  id: string;
  prompt: string;
  status: UiRunStatus;
  timestamp: string;
  createdAt?: string;
  completedAt?: string;
  scheduledAt?: string;
  summaryText?: string;
  mode?: 'preview' | 'approval' | 'auto' | 'scheduled';
  links?: Array<{
    provider: string;
    url: string;
    externalId: string;
  }>;
  messages?: UiMessage[];
}

export interface UiPlanStep {
  id: string;
  tool: string;
  appId?: string;
  credentialId?: number | null;
  action?: string;
  status: UiStepStatus;
  time?: string;
  inputsPreview?: string;
  outputsPreview?: string;
  request?: unknown;
  response?: unknown;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface UiMessage {
  role: UiMessageRole;
  content?: string;
  type?: UiMessageType;
  data?: UiMessageData;
}

export type UiMessageData =
  | UiPlanData
  | UiRunData
  | UiLogData
  | UiOutputData
  | UiUndoData
  | UiConfigData
  | UiQuestionsData
  | UiParamsData
  | UiErrorData;

export interface UiPlanData {
  intent: string;
  tools: string[];
  actions: string[];
  mode: 'plan' | 'auto' | 'approval';
  awaitingApproval?: boolean;
  steps?: UiPlanStep[];
}

export interface UiRunData {
  status: UiStepStatus | UiRunStatus;
  started_at?: string;
  completed_at?: string;
  progress?: number;
}

export interface UiLogData {
  entries?: UiPlanStep[];
  // Legacy format support
  [index: number]: UiPlanStep;
  length?: number;
}

export interface UiOutputData {
  title: string;
  content: string;
  type: 'text' | 'summary' | 'markdown' | 'json';
  data?: unknown;
}

export interface UiParamsData {
  title?: string;
  items: Array<{ key: string; value: string }>;
}

export interface UiUndoData {
  available: boolean;
  allowed?: boolean;
  deadline?: string;
}

export interface UiQuestionItem {
  key: string;
  question: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
}

export interface UiQuestionsData {
  runId?: string;
  questions: UiQuestionItem[];
}

export interface UiConfigData {
  fields: Record<string, unknown>;
  suggestions?: string[];
}

export interface UiErrorData {
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

// ============================================================================
// WebSocket Event Types
// ============================================================================

export type UiEventType =
  | 'connection_established'
  | 'run_snapshot'
  | 'plan_generated'
  | 'assistant.delta'
  | 'assistant.final'
  | 'step_started'
  | 'step_output'
  | 'step_succeeded'
  | 'step_failed'
  | 'awaiting_approval'
  | 'scheduled'
  | 'run_completed'
  | 'run_failed'
  | 'run_status'
  | 'error';

export interface UiEvent {
  type: UiEventType;
  payload: Record<string, unknown>;
  ts: string;
  runId?: string;
}

// ============================================================================
// Credential Types
// ============================================================================

export interface UiCredential {
  id: number;
  appId: string;
  label: string;
  avatarUrl?: string;
  current?: boolean;
  invalid?: boolean;
  lastValidatedAt?: string;
}

// ============================================================================
// DataSource Interface (single entry point for UI)
// ============================================================================

export interface DataSource {
  // -------------------------------------------------------------------------
  // Composer / Run Creation
  // -------------------------------------------------------------------------
  createRun(params: CreateRunParams): Promise<{ goal: unknown; plan: unknown[]; missing: UiQuestionItem[]; runId?: string }>;

  // -------------------------------------------------------------------------
  // Run Retrieval (initial load / refresh)
  // -------------------------------------------------------------------------
  getRun(runId: string): Promise<{
    run: UiRunSummary;
    steps: UiPlanStep[];
    events: UiEvent[];
  }>;

  // -------------------------------------------------------------------------
  // Realtime Updates (WebSocket)
  // -------------------------------------------------------------------------
  connectRunStream(runId: string, onEvent: (evt: UiEvent) => void): { close: () => void };

  // -------------------------------------------------------------------------
  // Approvals & Control
  // -------------------------------------------------------------------------
  approve(runId: string, approvedSteps: string[]): Promise<{ ok: true }>;

  cancel(runId: string): Promise<{ ok: true }>;

  undo(runId: string): Promise<{ ok: true }>;

  // -------------------------------------------------------------------------
  // Credentials (for banners/pickers)
  // -------------------------------------------------------------------------
  listCredentials(appId: string, owner: 'user' | 'team'): Promise<UiCredential[]>;

  selectCurrentCredential(credentialId: number): Promise<{ ok: true }>;

  // -------------------------------------------------------------------------
  // Optional: List runs (for sidebar)
  // -------------------------------------------------------------------------
  listRuns?(params?: { status?: UiRunStatus[]; limit?: number; cursor?: string }): Promise<{
    runs: UiRunSummary[];
    nextCursor?: string;
  }>;
}

// ============================================================================
// Helper Types
// ============================================================================

export interface CreateRunParams {
  prompt: string;
  mode: 'preview' | 'approval' | 'auto' | 'scheduled';
  scheduledAt?: string;
  targets?: { appId: string; credentialId?: number }[];
  toolAllowlist?: string[];
  messages?: Array<{
    role: UiMessageRole;
    content: string;
  }>;
}

export interface DataSourceConfig {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
  authToken?: string;
  teamId?: number;
}
