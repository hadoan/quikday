import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionPagePropertiesUpdateIn = z.object({
  pageId: z.string().min(1, 'pageId is required'),
  properties: z
    .record(z.string(), z.any())
    .refine((val) => Object.keys(val).length > 0, 'At least one property must be provided'),
});

const NotionPagePropertiesUpdateOut = z.any();

export type NotionPagePropertiesUpdateArgs = z.infer<typeof NotionPagePropertiesUpdateIn>;
export type NotionPagePropertiesUpdateResult = z.infer<typeof NotionPagePropertiesUpdateOut>;

export function notionPagePropertiesUpdate(
  moduleRef: ModuleRef,
): Tool<NotionPagePropertiesUpdateArgs, NotionPagePropertiesUpdateResult> {
  return {
    name: 'notion.page.properties.update',
    description: 'Update one or more properties on an existing Notion page',
    in: NotionPagePropertiesUpdateIn,
    out: NotionPagePropertiesUpdateOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionPagePropertiesUpdateIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const res = await svc.updatePage(
        {
          pageId: input.pageId,
          properties: input.properties,
        },
        auth,
      );
      return NotionPagePropertiesUpdateOut.parse(res);
    },
  };
}
