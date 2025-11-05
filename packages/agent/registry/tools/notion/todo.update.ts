import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

export const NotionTodoUpdateIn = z.object({
  blockId: z.string().describe('The to-do block ID to update'),
  text: z.string().optional().describe('New to-do text'),
  checked: z.boolean().optional().describe('Whether the to-do is checked'),
});

export const NotionTodoUpdateOut = z
  .object({
    id: z.string(),
    url: z.string().optional(),
  })
  .passthrough();

export type NotionTodoUpdateArgs = z.infer<typeof NotionTodoUpdateIn>;
export type NotionTodoUpdateResult = z.infer<typeof NotionTodoUpdateOut>;

export function notionTodoUpdate(moduleRef: ModuleRef): Tool<NotionTodoUpdateArgs, NotionTodoUpdateResult> {
  return {
    name: 'notion.todo.update',
    description: 'Update a to-do block text and/or checked state',
    in: NotionTodoUpdateIn,
    out: NotionTodoUpdateOut,
    apps: ['notion-productivity'],
    scopes: ['notion:write'],
    rate: '120/m',
    risk: 'low',
    async call(args, _ctx: RunCtx) {
      const input = NotionTodoUpdateIn.parse(args);
      if (typeof input.checked !== 'boolean' && typeof input.text !== 'string') {
        throw new Error('Provide at least one of `text` or `checked`');
      }
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
      const res = await svc.updateTodo({ blockId: input.blockId, text: input.text, checked: input.checked });
      return NotionTodoUpdateOut.parse(res);
    },
  };
}

