import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '@quikday/prisma';
import { CurrentUserService } from '@quikday/libs';

export const NotionUpsertIn = z
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

export const NotionUpsertOut = z
  .object({
    id: z.string(),
    url: z.string().optional(),
  })
  .passthrough();

export type NotionUpsertArgs = z.infer<typeof NotionUpsertIn>;
export type NotionUpsertResult = z.infer<typeof NotionUpsertOut>;

export function notionUpsert(moduleRef: ModuleRef): Tool<NotionUpsertArgs, NotionUpsertResult> {
  return {
    name: 'notion.upsert',
    description:
      'Create or update a Notion page. Provide databaseId+properties to create; pageId+properties to update. Optionally include children blocks.',
    in: NotionUpsertIn,
    out: NotionUpsertOut,
    apps: ['notion-productivity'],
    scopes: ['notion:write'],
    rate: '60/m',
    risk: 'low',
    async call(args, _ctx: RunCtx) {
      const input = NotionUpsertIn.parse(args);
      const pkg = '@quikday/appstore-notion-productivity' as string;
      const m: any = await import(pkg);
      const NotionService = (m as any).NotionProductivityService;
      let svc = moduleRef.get(NotionService as any, { strict: false }) as any;
      if (!svc) {
        const prisma = moduleRef.get(PrismaService, { strict: false });
        const currentUser = moduleRef.get(CurrentUserService, { strict: false });
        if (!prisma || !currentUser) throw new Error('NotionProductivityService unavailable');
        svc = new NotionService(prisma as any, currentUser as any);
      }

      const doCreate =
        input.behavior === 'create' || (input.behavior === 'auto' && !input.pageId && !!input.databaseId);
      const doUpdate = input.behavior === 'update' || (!!input.pageId && input.behavior !== 'create');

      let res: any;
      if (doCreate) {
        if (!input.databaseId) throw new Error('databaseId is required for create');
        res = await svc.createPage({
          databaseId: input.databaseId,
          properties: input.properties,
          children: input.children,
        });
      } else if (doUpdate) {
        if (!input.pageId) throw new Error('pageId is required for update');
        res = await svc.updatePage({ pageId: input.pageId, properties: input.properties });
      } else {
        throw new Error('Unable to determine action (create/update)');
      }

      return NotionUpsertOut.parse(res);
    },
  };
}
