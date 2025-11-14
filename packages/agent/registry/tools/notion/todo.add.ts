import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';
import { NotionProductivityService } from '@quikday/appstore-notion-productivity';

export const NotionTodoAddIn = z.object({
  notionPageId: z
    .union([z.string().min(1), z.null()])
    .describe('The Notion page ID where the to-do will be added'),
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
    scopes: [],
    rate: '120/m',
    risk: 'low',
    async call(args, _ctx: RunCtx) {
      const input = NotionTodoAddIn.parse(args);
      const svc = moduleRef.get(NotionProductivityService, { strict: false }) as any;
      if (!input.notionPageId || typeof input.notionPageId !== 'string') {
        throw new Error('notionPageId is required to add a Notion to-do item.');
      }
      const res = await svc.addTodo({
        pageId: input.notionPageId,
        text: input.text,
        checked: input.checked,
      });
      return NotionTodoAddOut.parse(Array.isArray(res?.results) && res.results[0] ? res.results[0] : res);
    },
  };
}
