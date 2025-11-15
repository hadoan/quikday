import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionDatabaseListIn = z.object({
  databaseId: z.string().min(1, 'databaseId is required'),
  filter: z.record(z.string(), z.any()).optional(),
  sorts: z.array(z.record(z.string(), z.any())).optional(),
  startCursor: z.string().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

const NotionDatabaseListOut = z.object({
  items: z.array(z.any()),
  nextCursor: z.string().optional(),
});

export type NotionDatabaseListArgs = z.infer<typeof NotionDatabaseListIn>;
export type NotionDatabaseListResult = z.infer<typeof NotionDatabaseListOut>;

export function notionDatabaseList(
  moduleRef: ModuleRef,
): Tool<NotionDatabaseListArgs, NotionDatabaseListResult> {
  return {
    name: 'notion.database.list',
    description: 'List entries from a Notion database with simple pagination',
    in: NotionDatabaseListIn,
    out: NotionDatabaseListOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionDatabaseListIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const res = await svc.listDatabaseEntries(input, auth);
      return NotionDatabaseListOut.parse(res);
    },
  };
}
