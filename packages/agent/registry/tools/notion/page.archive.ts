import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionPageArchiveIn = z.object({
  pageId: z.string().min(1, 'pageId is required'),
  archived: z.boolean().optional().describe('Defaults to true; set false to restore a page'),
});

const NotionPageArchiveOut = z.any();

export type NotionPageArchiveArgs = z.infer<typeof NotionPageArchiveIn>;
export type NotionPageArchiveResult = z.infer<typeof NotionPageArchiveOut>;

export function notionPageArchive(moduleRef: ModuleRef): Tool<
  NotionPageArchiveArgs,
  NotionPageArchiveResult
> {
  return {
    name: 'notion.page.archive',
    description: 'Archive (or restore) a Notion page',
    in: NotionPageArchiveIn,
    out: NotionPageArchiveOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '30/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionPageArchiveIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const res = await svc.archivePage({ pageId: input.pageId, archived: input.archived }, auth);
      return NotionPageArchiveOut.parse(res);
    },
  };
}
