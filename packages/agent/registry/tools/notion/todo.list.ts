import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

export const NotionTodoListIn = z.object({
  pageId: z.string().describe('The page ID to list to-dos from'),
  recursive: z.boolean().default(false).describe('Whether to traverse nested blocks'),
  limit: z.number().int().min(1).max(1000).optional(),
});

export const NotionTodoListOut = z.object({
  items: z.array(z.object({ id: z.string(), text: z.string(), checked: z.boolean().optional() })),
  nextCursor: z.string().optional(),
});

export type NotionTodoListArgs = z.infer<typeof NotionTodoListIn>;
export type NotionTodoListResult = z.infer<typeof NotionTodoListOut>;

export function notionTodoList(moduleRef: ModuleRef): Tool<NotionTodoListArgs, NotionTodoListResult> {
  return {
    name: 'notion.todo.list',
    description: 'List to-do blocks under a Notion page',
    in: NotionTodoListIn,
    out: NotionTodoListOut,
    apps: ['notion-productivity'],
    scopes: ['notion:read'],
    rate: '240/m',
    risk: 'low',
    async call(args, _ctx: RunCtx) {
      const input = NotionTodoListIn.parse(args);
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
      const res = await svc.listTodos({ pageId: input.pageId, limit: input.limit, recursive: input.recursive });
      return NotionTodoListOut.parse(res);
    },
  };
}

