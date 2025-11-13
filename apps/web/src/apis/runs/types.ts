/**
 * Type definitions for Run API operations
 * Centralized type definitions for all run-related API operations
 */

// ============================================================================
// UI Status Types
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
  | 'questions'
  | 'app_credentials';

// ============================================================================
// Core View Models
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
  effects?: unknown[];
  config?: { summary?: string };
  steps?: unknown[];
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

export interface ApiPlanStep {
  tool: string;
  action?: string;
  inputs?: Record<string, unknown>;
  credentialId?: number | null;
  appId?: string;
}

export interface UiMessage {
  role: UiMessageRole;
  content?: JSON | string | {steps?: ApiPlanStep[]};
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
  | UiErrorData
  | UiAppCredentialsData;

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
  [index: number]: UiPlanStep;
  length?: number;
}

export interface UiOutputDataPresentation {
  type: 'slots' | 'table' | 'text' | 'json';
  tz?: string;
  datetimePaths?: string[];
}

export interface UiOutputData {
  title: string;
  content: string;
  type: 'text' | 'summary' | 'markdown' | 'json';
  data?: unknown;
  presentation?: UiOutputDataPresentation;
}

export interface UiParamsData {
  title?: string;
  items: Array<{ key: string; value: string; full?: unknown }>;
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
  steps?: UiPlanStep[];
  hasMissingCredentials?: boolean;
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

export interface UiAppCredentialsData {
  runId?: string;
  steps: UiPlanStep[];
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
  | 'error'
  | 'chat_updated';

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
// Request/Response Types
// ============================================================================

export interface CreateRunParams {
  prompt: string;
  mode?: 'preview' | 'approval' | 'auto' | 'scheduled';
  scheduledAt?: string;
  targets?: { appId: string; credentialId?: number }[];
  toolAllowlist?: string[];
  messages?: Array<{
    role: UiMessageRole;
    content: string;
  }>;
}

export interface CreateRunResponse {
  goal: unknown;
  plan: unknown[];
  missing: UiQuestionItem[];
  runId?: string;
}

export interface GetRunResponse {
  run: UiRunSummary;
  steps: UiPlanStep[];
  events: UiEvent[];
}

export interface ListRunsParams {
  status?: string[];
  limit?: number;
  cursor?: string;
}

export interface ListRunsResponse {
  runs: UiRunSummary[];
  nextCursor?: string;
}

// ============================================================================
// Runs List Types (for pagination)
// ============================================================================

export interface RunsListItem {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  createdBy: { id: number; name: string; avatar: string | null };
  kind: string;
  source: string;
  stepCount: number;
  approvals: { required: boolean };
  undo: { available: boolean };
  lastEventAt: string;
  tags?: string[];
}

export interface RunsListResponse {
  items: RunsListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface RunsQueryParams {
  page: number;
  pageSize: number;
  status?: string[];
  q?: string;
  sortBy?: 'createdAt' | 'lastEventAt' | 'status' | 'stepCount';
  sortDir?: 'asc' | 'desc';
}

// ============================================================================
// Config Types
// ============================================================================

export interface RunApiConfig {
  apiBaseUrl?: string;
  wsBaseUrl?: string;
  authToken?: string;
  teamId?: number;
}
