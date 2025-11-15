import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionDatabaseQueryIn = z.object({
  databaseId: z.string().min(1, 'databaseId is required'),
  filter: z.record(z.string(), z.any()).optional(),
  sorts: z.array(z.record(z.string(), z.any())).optional(),
  startCursor: z.string().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

const NotionDatabaseQueryOut = z.any();

export type NotionDatabaseQueryArgs = z.infer<typeof NotionDatabaseQueryIn>;
export type NotionDatabaseQueryResult = z.infer<typeof NotionDatabaseQueryOut>;

export function notionDatabaseQuery(
  moduleRef: ModuleRef,
): Tool<NotionDatabaseQueryArgs, NotionDatabaseQueryResult> {
  return {
    name: 'notion.database.query',
    description: 'Query a Notion database using raw Notion API filters/sorts',
    in: NotionDatabaseQueryIn,
    out: NotionDatabaseQueryOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionDatabaseQueryIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const res = await svc.queryDatabase(input, auth);
      return NotionDatabaseQueryOut.parse(res);
    },
  };
}
