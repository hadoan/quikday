# Building an Agent as a Small, Safe Graph

This is a short, practical tour of our agent’s LangGraph‑style architecture. It’s a tiny graph runtime coordinating a few well‑defined nodes—classify → plan → confirm → execute → summarize—wrapped with strong safety rails (policy, approvals, rate limits, circuit breaker, idempotency) and clear observability.

Code is here: https://github.com/hadoan/quikday

Project status: active and in progress. If this is helpful, please star and fork the repo. Feedback and PRs are very welcome!

## Why a Graph?

- Predictable control flow with explicit nodes and routers
- Easy to inject safety steps (e.g., approvals) between phases
- Deterministic, testable state transitions with a single state object

## Topology

```
START
  ↓
classify ──→ planner ──→ confirm ──→ executor ──→ summarize ──→ END
                                   ↘︎ error → fallback → END
```

## The Runtime (Mini Graph Engine)

```ts
// Minimal runtime primitives
export type Node<S extends object, E = any> = (s: S, eventBus: E) => Promise<Partial<S> | void>;

export type Router<S extends object> = (s: S) => string | 'END';

export class Graph<S extends object, E> {
  private nodes = new Map<string, Node<S, E>>();
  private edges = new Map<string, Router<S>>();

  constructor(
    private hooks: {
      onEnter?: (id: string, s: S) => void;
      onExit?: (id: string, s: S, delta?: Partial<S> | void) => void;
      onEdge?: (from: string, to: string, s: S) => void;
    } = {},
  ) {}

  addNode(id: string, fn: Node<S, E>) {
    this.nodes.set(id, fn);
    return this;
  }
  addEdge(from: string, router: Router<S>) {
    this.edges.set(from, router);
    return this;
  }

  async run(start: string, state: S, eventBus: E, maxSteps = 64): Promise<S> {
    let current = start;
    let s = structuredClone(state) as S;
    for (let i = 0; i < maxSteps && current !== 'END'; i++) {
      this.hooks.onEnter?.(current, s);
      const node = this.nodes.get(current);
      if (!node) throw new Error(`Node not found: ${current}`);
      const delta = await node(s, eventBus);
      if (delta) s = { ...(s as any), ...(delta as any) };
      this.hooks.onExit?.(current, s, delta);
      const to = this.edges.get(current)?.(s) ?? 'END';
      if (to === 'END') break;
      this.hooks.onEdge?.(current, to, s);
      current = to;
    }
    return s;
  }
}
```

## State Model

```ts
export type RunMode = 'PLAN' | 'AUTO';

export interface PlanStep {
  id: string;
  tool: string; // e.g., "calendar.createEvent"
  args: any;
  risk: 'low' | 'high';
  dependsOn?: string[];
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
export interface ChatMessage {
  role: ChatRole;
  content: string;
  [k: string]: any;
}

export type Question = {
  key: string;
  question: string;
  type: 'text' | 'textarea' | 'email' | 'email_list' | 'datetime';
  required?: boolean;
  placeholder?: string;
  example?: string | string[];
};

export interface RunCtx {
  runId: string;
  userId: string;
  teamId?: string;
  scopes: string[];
  traceId: string;
  tz: string;
  now: Date;
}

export interface RunState {
  input: { prompt: string; messages?: ChatMessage[] };
  mode: RunMode;
  ctx: RunCtx;
  scratch?: {
    intent?: string;
    plan?: PlanStep[];
    missing?: Question[];
    answers?: Record<string, string>;
    awaiting?: { reason: 'missing_info'; questions: Question[]; ts: string } | null;
    fallbackReason?: string;
  };
  output?: {
    diff?: {
      steps?: Array<Pick<PlanStep, 'id' | 'tool' | 'dependsOn'>>;
      questions?: Question[];
      summary?: string;
    };
    commits?: Array<{ stepId: string; result: unknown }>;
    summary?: string;
  };
  error?: { node: string; message: string };
}
```

## Building the Graph

```ts
// Build the main graph: classify → planner → confirm → executor → summarize
const graph = new Graph<RunState, RunEventBus>(hooks(eventBus))
  .addNode('classify', classify)
  .addNode('planner', planner)
  .addNode('confirm', confirm)
  .addNode('executor', executor)
  .addNode('summarize', summarize)
  .addNode('fallback', fallback)
  .addEdge('START', () => 'classify')
  .addEdge('classify', () => 'planner')
  .addEdge('planner', () => 'confirm')
  .addEdge('confirm', (s) => (s.scratch?.awaiting ? 'END' : 'executor'))
  .addEdge('executor', (s) => (s.error ? 'fallback' : 'summarize'))
  .addEdge('summarize', () => 'END')
  .addEdge('fallback', () => 'END');
```

## The Nodes (Samples)

```ts
// 1) classify: simple intent picker
const classify: Node<RunState, RunEventBus> = async (s) => {
  const t = (s.input.prompt || '').toLowerCase();
  const intent =
    t.includes('meeting') || t.includes('schedule') ? 'calendar.schedule' : 'chat.respond';
  return { scratch: { ...s.scratch, intent } };
};

// 2) planner: propose steps or ask questions
const planner: Node<RunState, RunEventBus> = async (s, eventBus) => {
  const intent = s.scratch?.intent;
  if (intent === 'chat.respond' || !intent) {
    const steps: PlanStep[] = [
      {
        id: crypto.randomUUID(),
        tool: 'chat.respond',
        args: { prompt: s.input.prompt },
        risk: 'low',
      },
    ];
    return {
      scratch: { ...s.scratch, plan: steps, missing: [] },
      output: { ...s.output, diff: { steps, summary: 'Answer normally.' } },
    };
  }
  if (intent === 'calendar.schedule') {
    const missing: Question[] = [];
    // In a real planner, derive from user text and existing answers
    missing.push({
      key: 'when.startISO',
      question: 'Start time (ISO 8601)?',
      type: 'datetime',
      required: true,
    });
    missing.push({
      key: 'when.endISO',
      question: 'End time (ISO 8601)?',
      type: 'datetime',
      required: true,
    });
    return {
      scratch: { ...s.scratch, plan: [], missing },
      output: { ...s.output, diff: { questions: missing, summary: 'Need time range.' } },
    };
  }
  return {
    scratch: { ...s.scratch, plan: [] },
    output: { ...s.output, diff: { summary: 'No actions proposed.' } },
  };
};

// 3) confirm: halt for missing inputs or approvals
const confirm: Node<RunState, RunEventBus> = async (s, eventBus) => {
  const questions = s.output?.diff?.questions || s.scratch?.missing || [];
  const answers = s.scratch?.answers || {};
  const unanswered = questions.filter((q) => !answers[q.key]);
  if (unanswered.length > 0) {
    const awaiting = {
      reason: 'missing_info' as const,
      questions: unanswered,
      ts: new Date().toISOString(),
    };
    // Notify UI via event bus in your implementation
    return { scratch: { ...s.scratch, awaiting } };
  }
  return { scratch: { ...s.scratch, awaiting: null } };
};

// 4) executor: run each planned tool
const executor: Node<RunState, RunEventBus> = async (s, eventBus) => {
  const commits: Array<{ stepId: string; result: unknown }> = [];
  for (const step of s.scratch?.plan ?? []) {
    try {
      const result = await registry.call(step.tool, step.args, s.ctx);
      commits.push({ stepId: step.id, result });
    } catch (err: any) {
      return { error: { node: 'executor', message: err?.message || String(err) } };
    }
  }
  return { output: { ...s.output, commits } };
};

// 5) summarize: concise recap (LLM or template)
const summarize: Node<RunState, RunEventBus> = async (s) => {
  const did = (s.output?.commits ?? []).map((c) => c.stepId).join(', ');
  return { output: { ...s.output, summary: did ? `Completed steps: ${did}` : 'No changes.' } };
};

// 6) fallback: user-friendly reason
const fallback: Node<RunState, RunEventBus> = async (s) => {
  const reason = s.scratch?.fallbackReason || 'unspecified';
  const msg =
    {
      policy_denied: 'This action is blocked by your team policy.',
      quiet_hours: 'This request falls inside quiet hours.',
      budget_exceeded: 'Estimated cost exceeds the allotted budget.',
      unspecified: 'I could not safely continue with this run.',
    }[reason] || 'I could not safely continue with this run.';
  return { output: { ...s.output, summary: msg } };
};
```

## Tools and the Registry

```ts
// Tool interface and registry (sketch)
import { z, ZodType } from 'zod';

export interface Tool<I, O> {
  name: string;
  in: ZodType<I>;
  out: ZodType<O>;
  scopes: string[];
  rate: string;
  risk: 'low' | 'high';
  call: (args: I, ctx: RunCtx) => Promise<O>;
}

class Circuit {
  /* open/half/close breaker – omitted for brevity */
}
const Idempotency = { key: (runId: string, name: string, args: any) => `${runId}:${name}` };

class ToolRegistry {
  private tools = new Map<string, Tool<any, any>>();
  private circuits = new Map<string, Circuit>();
  register<TIn, TOut>(tool: Tool<TIn, TOut>) {
    this.tools.set(tool.name, tool);
    this.circuits.set(tool.name, new Circuit());
    return this;
  }
  get(name: string) {
    const t = this.tools.get(name);
    if (!t) throw new Error(`Tool not found: ${name}`);
    return t;
  }
  async call<TIn, TOut>(name: string, args: TIn, ctx: RunCtx): Promise<TOut> {
    const t = this.get(name) as Tool<TIn, TOut>;
    // check scopes/rate/circuit/idempotency as needed...
    const key = Idempotency.key(ctx.runId, name, args);
    return await t.call(args, ctx);
  }
}

export const registry = new ToolRegistry();

// Example: local LLM reply (chat.respond)
export function chatRespondTool(llm: {
  text: (p: { system?: string; user: string }) => Promise<string>;
}) {
  return {
    name: 'chat.respond',
    in: z.object({ prompt: z.string().optional(), system: z.string().optional() }),
    out: z.object({ message: z.string() }),
    scopes: [],
    rate: 'unlimited',
    risk: 'low',
    async call(args: { prompt?: string; system?: string }) {
      const msg = await llm.text({
        system: args.system ?? 'Helpful assistant.',
        user: args.prompt ?? '',
      });
      return { message: (msg ?? '').trim() || 'Okay.' };
    },
  } as Tool<{ prompt?: string; system?: string }, { message: string }>;
}

// Example: Slack post (stub)
const SlackIn = z.object({ channel: z.string(), text: z.string().min(1) });
const SlackOut = z.object({ ok: z.boolean(), ts: z.string().optional() });
export const slackPostMessage: Tool<z.infer<typeof SlackIn>, z.infer<typeof SlackOut>> = {
  name: 'slack.postMessage',
  in: SlackIn,
  out: SlackOut,
  scopes: ['slack:write'],
  rate: '60/m',
  risk: 'low',
  async call(args) {
    const { channel, text } = SlackIn.parse(args);
    /* call provider here */ return { ok: true, ts: Date.now().toString() };
  },
};

// Register examples
registry.register(slackPostMessage);
// registry.register(chatRespondTool(llm)); // when you have an LLM instance
```

## Observability Hooks (Sketch)

```ts
type RunEvent = { type: string; payload?: any };
type RunEventBus = { publish: (runId: string, evt: RunEvent) => void };

function hooks(eventBus: RunEventBus) {
  return {
    onEnter: (id: string, s: RunState) =>
      eventBus.publish(s.ctx.runId, { type: 'node.enter', payload: { id } }),
    onExit: (id: string, s: RunState) =>
      eventBus.publish(s.ctx.runId, { type: 'node.exit', payload: { id } }),
    onEdge: (from: string, to: string, s: RunState) =>
      eventBus.publish(s.ctx.runId, { type: 'edge.taken', payload: { from, to } }),
  };
}
```

## Quick Start

```ts
// 1) Build the graph (register LLM-backed tools if you have one)
const graph = new Graph<RunState, RunEventBus>(hooks(eventBus))
  .addNode('classify', classify)
  .addNode('planner', planner)
  .addNode('confirm', confirm)
  .addNode('executor', executor)
  .addNode('summarize', summarize)
  .addNode('fallback', fallback)
  .addEdge('START', () => 'classify')
  .addEdge('classify', () => 'planner')
  .addEdge('planner', () => 'confirm')
  .addEdge('confirm', (s) => (s.scratch?.awaiting ? 'END' : 'executor'))
  .addEdge('executor', (s) => (s.error ? 'fallback' : 'summarize'))
  .addEdge('summarize', () => 'END')
  .addEdge('fallback', () => 'END');

// 2) Prepare initial state
const state: RunState = {
  input: { prompt: 'Schedule a meeting tomorrow at 4pm with sara@example.com' },
  mode: 'PLAN',
  ctx: {
    runId: 'run_123',
    userId: 'u_1',
    teamId: 't_1',
    scopes: [],
    traceId: 'trace_1',
    tz: 'UTC',
    now: new Date(),
  },
};

// 3) Run
const final = await graph.run('START', state, eventBus);
console.log(final.output?.summary);
```

## Adding a New Tool (Recipe)

1. Define a tool with name/in/out/scopes/rate/risk/call
2. Register it in the registry
3. Teach the planner to propose it for the right intent(s)
4. Optionally add policy rules (allowlist/scopes)

Example:

```ts
const EchoIn = z.object({ text: z.string() });
const EchoOut = z.object({ echoed: z.string() });
const echoTool: Tool<z.infer<typeof EchoIn>, z.infer<typeof EchoOut>> = {
  name: 'echo',
  in: EchoIn,
  out: EchoOut,
  scopes: [],
  rate: 'unlimited',
  risk: 'low',
  async call(args) {
    const { text } = EchoIn.parse(args);
    return { echoed: text };
  },
};
registry.register(echoTool);
```

## Design Notes

- Small, composable runtime for clarity and testability
- Safety by default: scopes, rate limits, circuit breaker, idempotency, approvals, fallbacks
- Non‑blocking observability with redaction options

—

If you enjoy this direction, please star and fork the repo:
https://github.com/hadoan/quikday

It helps others discover the project and motivates continued development. Thanks for reading!
