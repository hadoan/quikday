import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

export const NotionDatabaseUpsertIn = z
  .object({
    behavior: z
      .enum(['auto', 'create', 'update'])
      .default('auto')
      .describe('Whether to create or update. auto: decide by presence of pageId'),
    databaseId: z
      .string()
      .optional()
      .describe('Target database id for create'),
    pageId: z.string().optional().describe('Existing page id for update'),
    properties: z
      .record(z.string(), z.any())
      .describe('Notion page properties payload (Notion API format)'),
    children: z.array(z.any()).optional().describe('Optional Notion block children'),
  })
  .refine(
    (v) => {
      if (v.behavior === 'create') return !!v.databaseId;
      if (v.behavior === 'update') return !!v.pageId;
      // auto
      if (v.pageId) return true;
      return !!v.databaseId;
    },
    { message: 'Provide databaseId for create or pageId for update' },
  );

export const NotionDatabaseUpsertOut = z
  .object({
    id: z.string(),
    url: z.string().optional(),
  })
  .passthrough();

export type NotionDatabaseUpsertArgs = z.infer<typeof NotionDatabaseUpsertIn>;
export type NotionDatabaseUpsertResult = z.infer<typeof NotionDatabaseUpsertOut>;

export function notionDatabaseUpsert(
  moduleRef: ModuleRef,
): Tool<NotionDatabaseUpsertArgs, NotionDatabaseUpsertResult> {
  return {
    name: 'notion.database.upsert',
    description:
      'Create or update a page INSIDE AN EXISTING Notion database. Provide a valid databaseId+properties to create a new row, or pageId+properties to update. Never pass null or empty strings for databaseId/pageId—if you only know the database name, first call notion.database.list (to resolve the id) or notion.database.findOrCreate (with that id). This tool does not create brand-new databases.',
    in: NotionDatabaseUpsertIn,
    out: NotionDatabaseUpsertOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '60/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionDatabaseUpsertIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);

      const doCreate =
        input.behavior === 'create' || (input.behavior === 'auto' && !input.pageId && !!input.databaseId);
      const doUpdate = input.behavior === 'update' || (!!input.pageId && input.behavior !== 'create');

      let res: any;
      if (doCreate) {
        if (!input.databaseId) throw new Error('databaseId is required for create');
        res = await svc.createPage(
          {
            databaseId: input.databaseId,
            properties: input.properties,
            children: input.children,
          },
          auth,
        );
      } else if (doUpdate) {
        if (!input.pageId) throw new Error('pageId is required for update');
        res = await svc.updatePage({ pageId: input.pageId, properties: input.properties }, auth);
      } else {
        throw new Error('Unable to determine action (create/update)');
      }

      return NotionDatabaseUpsertOut.parse(res);
    },
  };
}
