import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import { getNotionAuthFromCtx, getNotionSvc } from './helpers.js';

const NotionDatabaseFindOrCreateIn = z
  .object({
    databaseId: z.string().min(1, 'databaseId is required'),
    properties: z.record(z.string(), z.any()).describe('Properties used when creating or updating the page'),
    matchProperty: z
      .string()
      .optional()
      .describe('Property name used for equality matching when no custom filter is provided'),
    matchValue: z.string().optional(),
    filter: z.record(z.string(), z.any()).optional(),
    children: z.array(z.any()).optional(),
    updateOnMatch: z
      .record(z.string(), z.any())
      .optional()
      .describe('Override properties when an existing entry is found'),
  })
  .refine(
    (val) => {
      if (val.filter) return true;
      return Boolean(val.matchProperty && val.matchValue);
    },
    { message: 'Provide filter or matchProperty+matchValue so the tool can find an existing row' },
  );

const NotionDatabaseFindOrCreateOut = z.object({
  page: z.any(),
  created: z.boolean(),
});

export type NotionDatabaseFindOrCreateArgs = z.infer<typeof NotionDatabaseFindOrCreateIn>;
export type NotionDatabaseFindOrCreateResult = z.infer<typeof NotionDatabaseFindOrCreateOut>;

export function notionDatabaseFindOrCreate(
  moduleRef: ModuleRef,
): Tool<NotionDatabaseFindOrCreateArgs, NotionDatabaseFindOrCreateResult> {
  return {
    name: 'notion.database.findOrCreate',
    description:
      'Query a database for a row by filter (or property match) and create it if missing. Returns whether a new entry was created.',
    in: NotionDatabaseFindOrCreateIn,
    out: NotionDatabaseFindOrCreateOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '30/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionDatabaseFindOrCreateIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const res = await svc.findOrCreateDatabaseEntry(
        {
          databaseId: input.databaseId,
          properties: input.properties,
          filter: input.filter,
          matchProperty: input.matchProperty,
          matchValue: input.matchValue,
          children: input.children,
          updateOnMatch: input.updateOnMatch,
        },
        auth,
      );
      return NotionDatabaseFindOrCreateOut.parse(res);
    },
  };
}
