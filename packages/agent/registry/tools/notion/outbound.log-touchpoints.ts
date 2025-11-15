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

const Touchpoint = z.object({
  channel: z.string().optional(),
  summary: z.string().min(1, 'summary is required'),
  timestamp: z.string().optional(),
  outcome: z.string().optional(),
});

const NotionOutboundLogIn = z.object({
  databaseId: z.string().min(1),
  accountName: z.string().min(1),
  matchProperty: z.string().default('Name'),
  matchValue: z.string().optional(),
  touchpoints: z.array(Touchpoint).nonempty(),
  notes: z.string().optional(),
  titlePropertyName: z.string().default('Name'),
  properties: z.record(z.string(), z.any()).optional(),
  updateProperties: z.record(z.string(), z.any()).optional(),
});

const NotionOutboundLogOut = z.object({
  pageId: z.string(),
  created: z.boolean(),
  appendedBlocks: z.number(),
});

export type NotionOutboundLogArgs = z.infer<typeof NotionOutboundLogIn>;
export type NotionOutboundLogResult = z.infer<typeof NotionOutboundLogOut>;

export function notionOutboundLogTouchpoints(
  moduleRef: ModuleRef,
): Tool<NotionOutboundLogArgs, NotionOutboundLogResult> {
  return {
    name: 'notion.outbound.logTouchpoints',
    description: 'Log outbound touchpoints for an account by upserting a Notion database row and appending notes.',
    in: NotionOutboundLogIn,
    out: NotionOutboundLogOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '30/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionOutboundLogIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const defaultTitleProperty = {
        [input.titlePropertyName || 'Name']: titleProperty(input.accountName),
      };
      const properties = {
        ...defaultTitleProperty,
        ...(input.properties || {}),
      };
      const updateProperties = input.updateProperties
        ? { ...input.updateProperties }
        : properties;
      const filter = {
        property: input.matchProperty || input.titlePropertyName || 'Name',
        rich_text: {
          equals: input.matchValue || input.accountName,
        },
      };
      const logBlocks = [];
      const timestampLabel =
        input.touchpoints[0]?.timestamp || new Date().toISOString();
      logBlocks.push(headingBlock(`Touchpoints • ${timestampLabel}`, 3));
      for (const tp of input.touchpoints) {
        const bulletParts = [];
        if (tp.timestamp) bulletParts.push(tp.timestamp);
        if (tp.channel) bulletParts.push(tp.channel);
        bulletParts.push(tp.summary);
        if (tp.outcome) bulletParts.push(`Outcome: ${tp.outcome}`);
        logBlocks.push(paragraphBlock(bulletParts.filter(Boolean).join(' • ')));
      }
      if (input.notes) {
        logBlocks.push(...bulletedListBlocks([`Notes: ${input.notes}`]));
      }
      const res = await svc.findOrCreateDatabaseEntry(
        {
          databaseId: input.databaseId,
          properties,
          filter,
          children: logBlocks,
          updateOnMatch: updateProperties,
        },
        auth,
      );
      if (!res.created) {
        await svc.appendBlocks({ blockId: res.page.id, children: logBlocks }, auth);
      }
      return {
        pageId: res.page.id,
        created: res.created,
        appendedBlocks: logBlocks.length,
      };
    },
  };
}
