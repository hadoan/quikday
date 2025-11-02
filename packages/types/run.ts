import { z } from 'zod';

export const PlanCard = z.object({
  type: z.literal('plan'),
  intent: z.string(),
  tools: z.array(z.string()),
  actions: z.array(z.string()),
  mode: z.enum(['preview', 'approval', 'auto']),
});

export const ConfigCard = z.object({
  type: z.literal('config'),
  fields: z.record(z.string(), z.any()),
  suggestions: z.array(z.string()).optional(),
});

export const RunCard = z.object({
  type: z.literal('run'),
  status: z.enum(['queued', 'running', 'done', 'failed']),
  startedAt: z.string().optional(),
});

export const LogCard = z.object({
  type: z.literal('log'),
  entries: z.array(
    z.object({
      ts: z.string(),
      tool: z.string(),
      action: z.string(),
      result: z.any().optional(),
    }),
  ),
});

export const UndoCard = z.object({
  type: z.literal('undo'),
  allowed: z.boolean(),
  deadline: z.string().optional(),
});

export const OutputCard = z.object({
  type: z.literal('output'),
  summary: z.string().optional(),
  data: z.any(),
});

export const ChatBlock = z.discriminatedUnion('type', [
  PlanCard,
  ConfigCard,
  RunCard,
  LogCard,
  UndoCard,
  OutputCard,
]);
export type ChatBlock = z.infer<typeof ChatBlock>;
