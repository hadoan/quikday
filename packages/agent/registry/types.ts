import { ZodType } from 'zod';
import type { RunCtx } from '../state/types.js';

export interface Tool<I, O> {
  name: string;
  description?: string; // Human-readable description for LLM planning
  in: ZodType<I>;
  out: ZodType<O>;
  apps: string[]; // List of app integrations this tool belongs to, e.g., ['google-calendar', 'slack-messaging']
  scopes: string[];
  rate: string; // "30/m"
  risk: 'low' | 'high';
  call: (args: I, ctx: RunCtx) => Promise<O>;
  undo?: (out: O, ctx: RunCtx) => Promise<void>;
}
