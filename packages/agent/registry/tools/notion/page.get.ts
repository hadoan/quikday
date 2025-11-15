import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionPageGetIn = z.object({
  pageId: z.string().min(1, 'pageId is required'),
});

const NotionPageGetOut = z.any();

export type NotionPageGetArgs = z.infer<typeof NotionPageGetIn>;
export type NotionPageGetResult = z.infer<typeof NotionPageGetOut>;

export function notionPageGet(moduleRef: ModuleRef): Tool<NotionPageGetArgs, NotionPageGetResult> {
  return {
    name: 'notion.page.get',
    description: 'Fetch a Notion page and return the raw Notion API payload',
    in: NotionPageGetIn,
    out: NotionPageGetOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionPageGetIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const res = await svc.getPage({ pageId: input.pageId }, auth);
      return NotionPageGetOut.parse(res);
    },
  };
}
