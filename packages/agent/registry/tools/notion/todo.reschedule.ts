import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionTodoRescheduleIn = z.object({
  pageId: z.string().min(1, 'pageId is required'),
  propertyName: z
    .string()
    .min(1, 'propertyName is required')
    .describe('Name of the date property storing due dates'),
  start: z.string().min(1, 'start date is required'),
  end: z.string().optional(),
  timeZone: z.string().optional(),
});

const NotionTodoRescheduleOut = z.any();

export type NotionTodoRescheduleArgs = z.infer<typeof NotionTodoRescheduleIn>;
export type NotionTodoRescheduleResult = z.infer<typeof NotionTodoRescheduleOut>;

export function notionTodoReschedule(
  moduleRef: ModuleRef,
): Tool<NotionTodoRescheduleArgs, NotionTodoRescheduleResult> {
  return {
    name: 'notion.todo.reschedule',
    description: 'Update the due date on a Notion task by editing its date property',
    in: NotionTodoRescheduleIn,
    out: NotionTodoRescheduleOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionTodoRescheduleIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const datePayload: Record<string, string> = { start: input.start };
      if (input.end) datePayload.end = input.end;
      if (input.timeZone) datePayload.time_zone = input.timeZone;
      const res = await svc.updatePage(
        {
          pageId: input.pageId,
          properties: {
            [input.propertyName]: {
              date: datePayload,
            },
          },
        },
        auth,
      );
      return NotionTodoRescheduleOut.parse(res);
    },
  };
}
