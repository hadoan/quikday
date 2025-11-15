import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionTodoAssignIn = z.object({
  pageId: z.string().min(1, 'pageId is required'),
  propertyName: z
    .string()
    .min(1, 'propertyName is required')
    .describe('Name of the Notion people property (e.g., Assignee)'),
  peopleIds: z.array(z.string().min(1)).nonempty().describe('List of Notion user IDs to assign'),
});

const NotionTodoAssignOut = z.any();

export type NotionTodoAssignArgs = z.infer<typeof NotionTodoAssignIn>;
export type NotionTodoAssignResult = z.infer<typeof NotionTodoAssignOut>;

export function notionTodoAssign(moduleRef: ModuleRef): Tool<NotionTodoAssignArgs, NotionTodoAssignResult> {
  return {
    name: 'notion.todo.assign',
    description: 'Assign a Notion task (page) by updating its people property with the provided user IDs',
    in: NotionTodoAssignIn,
    out: NotionTodoAssignOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionTodoAssignIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const res = await svc.updatePage(
        {
          pageId: input.pageId,
          properties: {
            [input.propertyName]: {
              people: input.peopleIds.map((id) => ({ id })),
            },
          },
        },
        auth,
      );
      return NotionTodoAssignOut.parse(res);
    },
  };
}
