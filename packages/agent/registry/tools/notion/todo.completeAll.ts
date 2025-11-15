import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionTodoCompleteAllIn = z.object({
  pageId: z.string().min(1, 'pageId is required'),
  contains: z
    .string()
    .optional()
    .describe('Optional substring filter to match todo text before completing'),
  limit: z.number().int().positive().max(200).optional(),
  recursive: z.boolean().default(false),
});

const NotionTodoCompleteAllOut = z.object({
  updated: z.number().int().nonnegative(),
  blockIds: z.array(z.string()),
});

export type NotionTodoCompleteAllArgs = z.infer<typeof NotionTodoCompleteAllIn>;
export type NotionTodoCompleteAllResult = z.infer<typeof NotionTodoCompleteAllOut>;

export function notionTodoCompleteAll(
  moduleRef: ModuleRef,
): Tool<NotionTodoCompleteAllArgs, NotionTodoCompleteAllResult> {
  return {
    name: 'notion.todo.completeAll',
    description: 'Bulk complete Notion to-dos under a page (optionally filtered by text)',
    in: NotionTodoCompleteAllIn,
    out: NotionTodoCompleteAllOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '30/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionTodoCompleteAllIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const todos = await svc.listTodos(
        {
          pageId: input.pageId,
          limit: input.limit,
          recursive: input.recursive,
        },
        auth,
      );
      const match = (text: string) =>
        !input.contains ||
        text.toLowerCase().includes(input.contains.toLowerCase());
      const targets = todos.items.filter((todo) => !todo.checked && match(todo.text || ''));
      const updatedIds: string[] = [];
      for (const todo of targets) {
        await svc.toggleTodo({ blockId: todo.id, checked: true }, auth);
        updatedIds.push(todo.id);
      }
      return { updated: updatedIds.length, blockIds: updatedIds };
    },
  };
}
