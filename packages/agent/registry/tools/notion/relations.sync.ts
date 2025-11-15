import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionRelationsSyncIn = z.object({
  pageId: z.string().min(1, 'pageId is required'),
  propertyName: z.string().min(1, 'propertyName is required'),
  relationIds: z.array(z.string().min(1)).describe('Target page IDs that should be linked'),
});

const NotionRelationsSyncOut = z.any();

export type NotionRelationsSyncArgs = z.infer<typeof NotionRelationsSyncIn>;
export type NotionRelationsSyncResult = z.infer<typeof NotionRelationsSyncOut>;

export function notionRelationsSync(
  moduleRef: ModuleRef,
): Tool<NotionRelationsSyncArgs, NotionRelationsSyncResult> {
  return {
    name: 'notion.relations.sync',
    description: 'Update a relation property so it exactly matches the provided list of target page IDs',
    in: NotionRelationsSyncIn,
    out: NotionRelationsSyncOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '30/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionRelationsSyncIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const res = await svc.syncRelationProperty(
        {
          pageId: input.pageId,
          propertyName: input.propertyName,
          relationIds: input.relationIds,
        },
        auth,
      );
      return NotionRelationsSyncOut.parse(res);
    },
  };
}
