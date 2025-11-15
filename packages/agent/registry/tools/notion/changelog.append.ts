import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import {
  bulletedListBlocks,
  getNotionAuthFromCtx,
  getNotionSvc,
  headingBlock,
  paragraphBlock,
  titleProperty,
} from './helpers.js';

const NotionChangelogAppendIn = z
  .object({
    pageId: z.string().optional(),
    databaseId: z.string().optional(),
    version: z.string().min(1),
    summary: z.string().min(1),
    details: z.array(z.string()).optional(),
    impact: z.string().optional(),
    links: z.array(z.object({ label: z.string(), url: z.string().optional() })).optional(),
    titlePropertyName: z.string().default('Name'),
    properties: z.record(z.string(), z.any()).optional(),
  })
  .refine((val) => Boolean(val.pageId || val.databaseId), {
    message: 'Provide a databaseId to create a row or pageId to append content',
  });

const NotionChangelogAppendOut = z.object({
  pageId: z.string(),
  created: z.boolean(),
  blocksWritten: z.number(),
});

export type NotionChangelogAppendArgs = z.infer<typeof NotionChangelogAppendIn>;
export type NotionChangelogAppendResult = z.infer<typeof NotionChangelogAppendOut>;

export function notionChangelogAppend(
  moduleRef: ModuleRef,
): Tool<NotionChangelogAppendArgs, NotionChangelogAppendResult> {
  return {
    name: 'notion.changelog.append',
    description: 'Append a release entry to your Notion changelog database or page.',
    in: NotionChangelogAppendIn,
    out: NotionChangelogAppendOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '30/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionChangelogAppendIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const blocks = [
        headingBlock(`Release ${input.version}`, 2),
        paragraphBlock(input.summary),
      ];
      if (input.impact) {
        blocks.push(paragraphBlock(`Impact: ${input.impact}`));
      }
      if (input.details?.length) {
        blocks.push(...bulletedListBlocks(input.details));
      }
      if (input.links?.length) {
        blocks.push(
          ...bulletedListBlocks(
            input.links.map((link) => (link.url ? `${link.label}: ${link.url}` : link.label)),
          ),
        );
      }

      if (input.databaseId && !input.pageId) {
        const properties =
          input.properties ??
          ({
            [input.titlePropertyName || 'Name']: titleProperty(`Release ${input.version}`),
          } as Record<string, any>);
        const page = await svc.createPage(
          {
            databaseId: input.databaseId,
            properties,
            children: blocks,
          },
          auth,
        );
        return { pageId: page.id, created: true, blocksWritten: blocks.length };
      }

      if (!input.pageId) throw new Error('pageId is required when databaseId is absent');
      await svc.appendBlocks({ blockId: input.pageId, children: blocks }, auth);
      return { pageId: input.pageId, created: false, blocksWritten: blocks.length };
    },
  };
}
