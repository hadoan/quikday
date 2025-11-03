import z from 'zod';

export type RunMode = 'PREVIEW' | 'APPROVAL' | 'AUTO';
export type Risk = 'low' | 'high';

export interface RunCtx {
  runId: string;
  userId: string;
  teamId?: string;
  scopes: string[]; // least-privilege
  traceId: string;
  tz: string; // "Europe/Berlin"
  now: Date;
  budgetCents?: number;
}
export interface PlanStep {
  id: string;
  tool: string; // "calendar.createEvent"
  args: any;
  risk: Risk;
  dependsOn?: string[];
  idempotencyKey?: string;
  costEstimateCents?: number;
}
// JSON-safe helpers
type JsonPrimitive = string | number | boolean | null;
type Json = JsonPrimitive | { [k: string]: Json } | Json[];

// Core unions
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  // Allow optional properties (which may be undefined) while still permitting arbitrary Json values
  [k: string]: Json | undefined;
  id?: string;
  role: ChatRole;
  content: string;
  ts?: string; // ISO
  toolName?: string; // when role === "tool"
  meta?: Record<string, Json>;
}

export type QuestionType =
  | 'text' // 1-line text (names, subjects, channels)
  | 'textarea' // multi-line (email body, long messages)
  | 'email' // single email
  | 'email_list' // multiple emails
  | 'datetime'
  | 'date'
  | 'time'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'boolean'; // yes/no

export type Question = {
  key: string; // e.g. "email.subject", "email.to", "slack.channel"
  question: string; // prompt shown to the user
  type: QuestionType; // drives the UI control
  placeholder?: string;
  example?: string | string[]; // match type (array for lists)
  options?: string[]; // for select/multiselect
  min?: number; // optional numeric/string length bounds
  max?: number;
  required?: boolean; // default true
  format?: string; // optional regex like '/^#?[a-z0-9-_]+$/i'
};

export interface RunError {
  node: string;
  message: string;
  stack?: string;
}

export interface RunState {
  input: { prompt: string; messages?: ChatMessage[]; attachments?: unknown };
  mode: RunMode;
  ctx: RunCtx;
  scratch?: {
    intent?: string;
    intentMeta?: { confidence: number; reason?: string };
    plan?: PlanStep[];
    stepsRun?: number;
    errors?: Array<{ code: string; message: string }>;
    // internal routing/fallback info added by guards/policy
    fallbackReason?: string;
    fallbackDetails?: unknown;

    // Collected answers keyed by input key. May include values persisted
    // from previous pauses (merged by the worker on resume).
    answers?: Record<string, unknown>;
    awaiting?: {
      // when we pause the run
      reason: 'missing_info';
      questions: Question[];
      ts: string;
    } | null;
  };
  output?: {
    summary?: string;
    diff?: {
      steps?: any[];
      summary?: string;
      intentDesc?: string;
    };
    commits?: Array<{ stepId: string; result: unknown }>;
    undo?: Array<{ stepId: string; tool: string; args: unknown }>;
    // Mirror awaiting block so API/UI can render prompts without inspecting scratch
    awaiting?: {
      reason: 'missing_info';
      questions: Question[];
      ts: string;
    } | null;
  };
  error?: RunError;
}
