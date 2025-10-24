export type RunMode = 'PLAN' | 'AUTO';
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

// // Extensible RunState
// export interface RunState<
//     In extends Json = { prompt?: string; messages?: ChatMessage[]; attachments?: Json },
//     Out extends Json = { summary?: string; diff?: Json; commits?: { stepId: string; result: Json }[]; undo?: { stepId: string; tool: string; args: Json }[] },
//     Step extends { id: string; tool: string; args: Json; risk: "low" | "high"; idempotencyKey?: string; costEstimateCents?: number } = { id: string; tool: string; args: Json; risk: "low" | "high"; idempotencyKey?: string; costEstimateCents?: number },
//     Meta extends Json = { confidence?: number; reason?: string }
// > {
//     input: In;
//     mode: RunMode;
//     ctx: RunCtx;                        // you can make RunCtx generic too (with meta)
//     scratch?: {
//         intent?: string;
//         intentMeta?: Meta;                // typed intent metadata
//         plan?: Step[];                    // typed plan steps
//         stepsRun?: number;
//         errors?: Array<{ code: string; message: string }>;
//         artifacts?: Record<string, Json>; // small caches/extractions
//     };
//     output?: Out;                       // typed output
// }

export type Question = { key: string; question: string };


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
    missing?: Question[];                   // planner can drop questions here
    answers?: Record<string, string>;       // user-provided answers by key
    awaiting?: {                            // when we pause the run
      reason: 'missing_info';
      questions: Question[];
      ts: string;
    } | null;
  };
  output?: {
    summary?: string;
    diff?: {
      questions?: Question[];
      steps?: any[];
      summary?: string;
      intentDesc?: string;
    };
    commits?: Array<{ stepId: string; result: unknown }>;
    undo?: Array<{ stepId: string; tool: string; args: unknown }>;
  };
  error?: RunError;
}
