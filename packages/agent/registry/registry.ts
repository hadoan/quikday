import type { Tool } from './types.js';
import { Circuit } from './support/circuit.js';
import { Idempotency } from './idempotency.js';
import { checkRate } from './support/rate.js';
import { requireScopes } from '../guards/policy.js';
import { z } from 'zod';
import { chatRespondTool } from './tools/chatRespond.js';
import { LLM } from '../llm/types.js';
import { ModuleRef } from '@nestjs/core';
import { registerEmailTools } from './registry.email.js';
import { registerCalendarTools } from './registry.calendar.js';
import { registerHubspotTools } from './registry.hubspot.js';
import { registerSlackTools } from './registry.slack.js';
import { registerNotionTools } from './registry.notion.js';

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

  // List all registered tool names
  names(): string[] {
    return Array.from(this.tools.keys());
  }

  // Get tool schemas for planning
  getSchemas(): Array<{ name: string; description: string; args: any }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description || `Tool: ${tool.name}`,
      args: tool.in ? this.zodToSimpleSchema(tool.in) : {},
    }));
  }

  private zodToSimpleSchema(schema: z.ZodTypeAny): any {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(shape)) {
        result[key] = this.getZodType(value as z.ZodTypeAny);
      }
      return result;
    }
    return {};
  }

  private getZodType(schema: z.ZodTypeAny): string {
    if (schema instanceof z.ZodString) return 'string';
    if (schema instanceof z.ZodNumber) return 'number';
    if (schema instanceof z.ZodBoolean) return 'boolean';
    if (schema instanceof z.ZodArray) return 'array';
    if (schema instanceof z.ZodObject) return 'object';
    if (schema instanceof z.ZodOptional)
      return this.getZodType(schema.unwrap() as z.ZodTypeAny) + '?';
    if (schema instanceof z.ZodDefault)
      return this.getZodType(schema._def.innerType as z.ZodTypeAny);
    if (schema instanceof z.ZodUnion) return 'string|array';
    return 'any';
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
  description: 'No-operation tool for testing. Echoes back the prompt or returns "noop".',
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
  apps: [],
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

// Calendar and Email tools are registered with moduleRef in registerToolsWithLLM

export function registerToolsWithLLM(llm: LLM, moduleRef: ModuleRef) {
  registry.register(chatRespondTool(llm, moduleRef));

  registerEmailTools(registry, moduleRef, llm);
  registerCalendarTools(registry, moduleRef);
  registerHubspotTools(registry, moduleRef);
  registerSlackTools(registry, moduleRef);
  registerNotionTools(registry, moduleRef);
}
