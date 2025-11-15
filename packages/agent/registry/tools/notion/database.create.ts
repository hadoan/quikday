import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionDatabaseCreateIn = z.object({
  title: z.string().min(1, 'title is required'),
  parentPageId: z.string().min(1, 'parentPageId is required').describe('Notion page ID that will contain the database'),
  properties: z
    .record(z.string(), z.any())
    .refine((val) => Object.keys(val).length > 0, 'Provide at least one property definition'),
  icon: z.any().optional(),
  cover: z.any().optional(),
});

const NotionDatabaseCreateOut = z.any();

export type NotionDatabaseCreateArgs = z.infer<typeof NotionDatabaseCreateIn>;
export type NotionDatabaseCreateResult = z.infer<typeof NotionDatabaseCreateOut>;

export function notionDatabaseCreate(
  moduleRef: ModuleRef,
): Tool<NotionDatabaseCreateArgs, NotionDatabaseCreateResult> {
  return {
    name: 'notion.database.create',
    description:
      'Create a brand-new Notion database under a specific parent page. Provide a title, the page ID that should host the DB, and the property schema (Notion format). If the user does not list every field, default to a sensible CRM-style schema instead of blocking for more info.',
    in: NotionDatabaseCreateIn,
    out: NotionDatabaseCreateOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '20/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionDatabaseCreateIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const res = await svc.createDatabase(
        {
          title: input.title,
          parentPageId: input.parentPageId,
          properties: input.properties,
          icon: input.icon,
          cover: input.cover,
        },
        auth,
      );
      return NotionDatabaseCreateOut.parse(res);
    },
  };
}
