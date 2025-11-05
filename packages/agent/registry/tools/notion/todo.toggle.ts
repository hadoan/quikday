import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

export const NotionTodoToggleIn = z.object({
  blockId: z.string().describe('The to-do block ID to update'),
  checked: z.boolean().describe('Whether the to-do is checked (completed) or not'),
});

export const NotionTodoToggleOut = z
  .object({
    id: z.string(),
    url: z.string().optional(),
  })
  .passthrough();

export type NotionTodoToggleArgs = z.infer<typeof NotionTodoToggleIn>;
export type NotionTodoToggleResult = z.infer<typeof NotionTodoToggleOut>;

export function notionTodoToggle(moduleRef: ModuleRef): Tool<NotionTodoToggleArgs, NotionTodoToggleResult> {
  return {
    name: 'notion.todo.toggle',
    description: 'Mark a to-do block as completed or not completed',
    in: NotionTodoToggleIn,
    out: NotionTodoToggleOut,
    apps: ['notion-productivity'],
    scopes: ['notion:write'],
    rate: '120/m',
    risk: 'low',
    async call(args, _ctx: RunCtx) {
      const input = NotionTodoToggleIn.parse(args);
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
      const res = await svc.toggleTodo({ blockId: input.blockId, checked: input.checked });
      return NotionTodoToggleOut.parse(res);
    },
  };
}

