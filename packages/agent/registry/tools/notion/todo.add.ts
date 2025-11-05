import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

export const NotionTodoAddIn = z.object({
  pageId: z.string().describe('The page ID where the to-do will be added'),
  text: z.string().min(1).describe('The to-do text content'),
  checked: z.boolean().optional().describe('Whether the to-do is initially checked'),
});

export const NotionTodoAddOut = z
  .object({
    id: z.string(),
    url: z.string().optional(),
  })
  .passthrough();

export type NotionTodoAddArgs = z.infer<typeof NotionTodoAddIn>;
export type NotionTodoAddResult = z.infer<typeof NotionTodoAddOut>;

export function notionTodoAdd(moduleRef: ModuleRef): Tool<NotionTodoAddArgs, NotionTodoAddResult> {
  return {
    name: 'notion.todo.add',
    description: 'Append a to-do block to a Notion page',
    in: NotionTodoAddIn,
    out: NotionTodoAddOut,
    apps: ['notion-productivity'],
    scopes: ['notion:write'],
    rate: '120/m',
    risk: 'low',
    async call(args, _ctx: RunCtx) {
      const input = NotionTodoAddIn.parse(args);
      const pkg = '@quikday/appstore-notion-productivity' as string;
      const m: any = await import(pkg);
      const NotionService = (m as any).NotionProductivityService;
      let svc = moduleRef.get(NotionService as any, { strict: false }) as any;
      if (!svc) {
        const prisma = moduleRef.get(PrismaService, { strict: false });
        const currentUser = moduleRef.get(CurrentUserService, { strict: false });
        if (!prisma || !currentUser) throw new Error('NotionProductivityService unavailable');
        svc = new NotionService(prisma as any, currentUser as any);
      }
      const res = await svc.addTodo({ pageId: input.pageId, text: input.text, checked: input.checked });
      return NotionTodoAddOut.parse(Array.isArray(res?.results) && res.results[0] ? res.results[0] : res);
    },
  };
}

