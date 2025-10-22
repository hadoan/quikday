import { ZodType } from 'zod';
import type { RunCtx } from '../state/types';

export interface Tool<I, O> {
  name: string;
  in: ZodType<I>;
  out: ZodType<O>;
  scopes: string[];
  rate: string; // "30/m"
  risk: 'low' | 'high';
  call: (args: I, ctx: RunCtx) => Promise<O>;
  undo?: (out: O, ctx: RunCtx) => Promise<void>;
}
