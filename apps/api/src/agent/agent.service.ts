import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { buildMainGraph } from '@quikday/agent/buildMainGraph';
import type { RunState } from '@quikday/agent/state/types';
import type { Graph } from '@quikday/agent/runtime/graph';
import type { LLM } from '@quikday/agent/llm/types';
import { AGENT_LLM } from './agent.tokens.js';
import { withLlmContext } from '@quikday/agent/llm/context';
import { InMemoryEventBus, type RunEventBus } from '@quikday/libs';
import { makeExtractGoal } from '@quikday/agent/nodes/extractGoal';
import { makePlanner } from '@quikday/agent/nodes/planner';
import { registerToolsWithLLM } from '@quikday/agent/registry/registry';
import { randomUUID } from 'crypto';

@Injectable()
export class AgentService {
  constructor(
    @Inject(AGENT_LLM) private readonly llm: LLM,
    @Inject('RunEventBus') private eventBus: RunEventBus,
    private readonly moduleRef: ModuleRef
  ) {}

  createGraph(): Graph<RunState, RunEventBus> {
    return buildMainGraph({ llm: this.llm, eventBus: this.eventBus, moduleRef: this.moduleRef });
  }

  async run(initialState: RunState, entryPoint = 'classify'): Promise<RunState> {
    const graph = this.createGraph();
    const { userId, teamId } = initialState.ctx;
    console.log('Running agent graph test', { entryPoint, initialState });
    const finalState = await withLlmContext(
      {
        userId,
        teamId,
        runId: initialState.ctx.runId,
        requestType: 'agent_graph',
        apiEndpoint: entryPoint,
      },
      () => graph.run(entryPoint, initialState, this.eventBus)
    );
    return finalState;
  }

  /**
   * Plan-only orchestration used by the /agent/plan API.
   * Executes extractGoal → planner with a private in-memory event bus to avoid
   * any WebSocket publishes, and returns goal, plan, and missing inputs.
   */
  async planOnly(args: {
    prompt: string;
    messages?: RunState['input']['messages'];
    answers?: Record<string, unknown>;
    tz?: string;
    userId: string;
    teamId?: string;
    userName?: string;
    userEmail?: string;
  }) {
    // Ensure tools are registered for planner schemas
    registerToolsWithLLM(this.llm, this.moduleRef);

    const runId = randomUUID();
    const traceId = randomUUID();

    const numericUserId = Number.parseInt(args.userId, 10);
    const numericTeamId = args.teamId ? Number.parseInt(args.teamId, 10) : undefined;
    const state: RunState = {
      input: { prompt: args.prompt, messages: args.messages },
      mode: 'PREVIEW',
      ctx: {
        runId,
        userId: Number.isFinite(numericUserId) ? numericUserId : 0,
        teamId: Number.isFinite(numericTeamId as any) ? (numericTeamId as number) : undefined,
        scopes: [],
        traceId,
        tz: args.tz || 'UTC',
        now: new Date(),
        // Carry lightweight meta so prompts can include user info
        meta: {
          ...(args.userName ? { userName: args.userName } : {}),
          ...(args.userEmail ? { userEmail: args.userEmail } : {}),
        } as any,
      },
      scratch: {
        answers: args.answers || {},
      },
    };

    // Local event bus: not the app-global bus → no WS publishes
    const localBus = new InMemoryEventBus();

    // 1 & 2) Run nodes with LLM context for consistent logging/metadata
    const s2 = await withLlmContext(
      {
        runId,
        userId: Number.isFinite(numericUserId) ? numericUserId : 0,
        teamId: Number.isFinite(numericTeamId as any) ? (numericTeamId as number) : undefined,
        requestType: 'agent_plan_preview',
        apiEndpoint: '/agent/plan',
      },
      async () => {
        const extractGoal = makeExtractGoal(this.llm);
        const delta1 = await extractGoal(state as any, localBus as any);
        const s1: RunState = { ...(state as any), ...(delta1 || {}) } as RunState;

        const planner = makePlanner(this.llm);
        const delta2 = await planner(s1 as any, localBus as any);
        return { ...(s1 as any), ...(delta2 || {}) } as RunState;
      },
    );

    const goal = (s2.scratch as any)?.goal ?? null;
    const plan = (s2.scratch as any)?.plan ?? [];
    // Get missing fields from planner's diff output (not from goal.missing)
    const diff = (s2.output as any)?.diff ?? {};
    const missing = Array.isArray(diff.missingFields) ? diff.missingFields : [];

    console.log('[AgentService.planOnly] Returning:', {
      hasGoal: !!goal,
      planSteps: plan.length,
      missingFields: missing.length,
      missing,
      diff,
    });

    return { goal, plan, missing };
  }
}
