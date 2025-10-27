import type { Tool } from './types';
import { Circuit } from './support/circuit';
import { Idempotency } from './idempotency';
import { checkRate } from './support/rate';
import { requireScopes } from '../guards/policy';
import { z } from 'zod';
import { slackPostMessage } from './tools/slack.postMessage';
import { chatRespondTool } from './tools/chatRespond';
import { LLM } from '../llm/types';
import { calendarCheckAvailability, calendarCreateEvent, calendarListEvents, calendarGetEvent, calendarFreeBusy, calendarUpdateEvent, calendarCancelEvent, calendarSuggestSlots } from './tools/calendar';
import { emailSend, emailRead, emailMessageGet, emailThreadGet, emailDraftCreate, emailDraftSend, emailLabelsChange, emailArchive, emailSnooze } from './tools/email';
import { ModuleRef } from '@nestjs/core/injector/module-ref';

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
// Calendar tools are registered with moduleRef in registerToolsWithLLM

// Email tools registered with moduleRef in registerToolsWithLLM

export function registerToolsWithLLM(llm: LLM,  moduleRef: ModuleRef) {
  registry.register(chatRespondTool(llm, moduleRef));

  //Email tools
  registry.register(emailSend(moduleRef));
  registry.register(emailRead(moduleRef));
  registry.register(emailMessageGet(moduleRef));
  registry.register(emailThreadGet(moduleRef));
  registry.register(emailDraftCreate(moduleRef));
  registry.register(emailDraftSend(moduleRef));
  registry.register(emailLabelsChange(moduleRef));
  registry.register(emailArchive(moduleRef));
  registry.register(emailSnooze(moduleRef));


  //Calendar tools
  registry.register(calendarCheckAvailability(moduleRef));
  registry.register(calendarCreateEvent(moduleRef));
  registry.register(calendarListEvents(moduleRef));
  registry.register(calendarGetEvent(moduleRef));
  registry.register(calendarFreeBusy(moduleRef));
  registry.register(calendarUpdateEvent(moduleRef));
  registry.register(calendarCancelEvent(moduleRef));
  registry.register(calendarSuggestSlots(moduleRef));
}
  
