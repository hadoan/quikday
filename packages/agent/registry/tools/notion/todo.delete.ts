import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionTodoDeleteIn = z.object({
  blockId: z.string().min(1, 'blockId (to-do block id) is required'),
});

const NotionTodoDeleteOut = z.object({
  success: z.boolean(),
});

export type NotionTodoDeleteArgs = z.infer<typeof NotionTodoDeleteIn>;
export type NotionTodoDeleteResult = z.infer<typeof NotionTodoDeleteOut>;

export function notionTodoDelete(moduleRef: ModuleRef): Tool<NotionTodoDeleteArgs, NotionTodoDeleteResult> {
  return {
    name: 'notion.todo.delete',
    description: 'Delete a Notion to-do block by its block ID',
    in: NotionTodoDeleteIn,
    out: NotionTodoDeleteOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionTodoDeleteIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      await svc.deleteBlock({ blockId: input.blockId }, auth);
      return { success: true };
    },
  };
}
