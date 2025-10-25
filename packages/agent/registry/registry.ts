import type { Tool } from './types';
import { Circuit } from './support/circuit';
import { Idempotency } from './idempotency';
import { checkRate } from './support/rate';
import { requireScopes } from '../guards/policy';
import { z } from 'zod';
import { slackPostMessage } from './tools/slack.postMessage';
import { chatRespondTool } from './tools/chatRespond';
import { LLM } from '../llm/types';
import { calendarCheckAvailability, calendarCreateEvent } from './tools/calendar';
import { emailSend, emailRead } from './tools/email';

export class ToolRegistry {
  private tools = new Map<string, Tool<any, any>>();
  private circuits = new Map<string, Circuit>();

  register<TIn, TOut>(tool: Tool<TIn, TOut>) {
    this.tools.set(tool.name, tool);
    this.circuits.set(tool.name, new Circuit({ failureThreshold: 5, resetMs: 60_000 }));
    return this;
  }

  get(name: string) {
    const t = this.tools.get(name);
    if (!t) throw new Error(`Tool not found: ${name}`);
    return t;
  }

  async call<TIn, TOut>(name: string, args: TIn, ctx: any): Promise<TOut> {
    const tool = this.get(name) as Tool<TIn, TOut>;
    requireScopes(ctx.scopes, tool.scopes);
    checkRate(tool.name, ctx.userId, tool.rate);
    const circuit = this.circuits.get(tool.name)!;

    return circuit.exec(async () => {
      const key = Idempotency.key(ctx.runId, name, args);
      const hit = await Idempotency.find<TOut>(key);
      if (hit) return hit;
      const out = await tool.call(args, ctx);
      await Idempotency.store(key, out);
      return out;
    });
  }
}

export const registry = new ToolRegistry();

registry.register({
  name: 'noop',
  in: z
    .object({
      prompt: z.string().optional(),
    })
    .passthrough(),
  out: z
    .object({
      message: z.string().optional(),
    })
    .passthrough(),
  scopes: [],
  rate: 'unlimited',
  risk: 'low',
  call: async (args) => ({
    message:
      typeof args === 'object' && args && 'prompt' in args && typeof args.prompt === 'string'
        ? args.prompt
        : 'noop',
  }),
});


registry.register(slackPostMessage);
registry.register(calendarCheckAvailability);
registry.register(calendarCreateEvent);
registry.register(emailSend);
registry.register(emailRead);

export function registerToolsWithLLM(llm: LLM) {
  registry.register(chatRespondTool(llm));
}
