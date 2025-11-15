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

const NotionNoReplyLogIn = z.object({
  databaseId: z.string().min(1),
  threadId: z.string().min(1),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  followupSummary: z.string().min(1),
  nextStep: z.string().optional(),
  scheduledTime: z.string().optional(),
  status: z.string().optional(),
  titlePropertyName: z.string().default('Name'),
  properties: z.record(z.string(), z.any()).optional(),
  updateProperties: z.record(z.string(), z.any()).optional(),
});

const NotionNoReplyLogOut = z.object({
  pageId: z.string(),
  created: z.boolean(),
});

export type NotionNoReplyLogArgs = z.infer<typeof NotionNoReplyLogIn>;
export type NotionNoReplyLogResult = z.infer<typeof NotionNoReplyLogOut>;

export function notionNoReplyFollowupLog(
  moduleRef: ModuleRef,
): Tool<NotionNoReplyLogArgs, NotionNoReplyLogResult> {
  return {
    name: 'notion.noReplyFollowup.log',
    description: 'Log follow-up attempts for “no reply” threads into a Notion database',
    in: NotionNoReplyLogIn,
    out: NotionNoReplyLogOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '30/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionNoReplyLogIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const title =
        input.contactName || input.contactEmail || `Thread ${input.threadId}`;
      const properties = {
        [input.titlePropertyName || 'Name']: titleProperty(title),
        ...(input.properties || {}),
      };
      const update = input.updateProperties ? { ...input.updateProperties } : properties;
      const filter = {
        property: 'Thread ID',
        rich_text: { equals: input.threadId },
      };
      const metaLines = [];
      if (input.status) metaLines.push(`Status: ${input.status}`);
      if (input.contactEmail) metaLines.push(`Email: ${input.contactEmail}`);
      const logBlocks = [
        headingBlock(`Follow-up • ${new Date().toISOString()}`, 3),
        paragraphBlock(input.followupSummary),
        ...bulletedListBlocks(metaLines),
      ];
      if (input.nextStep || input.scheduledTime) {
        logBlocks.push(
          ...bulletedListBlocks(
            [
              input.nextStep ? `Next step: ${input.nextStep}` : '',
              input.scheduledTime ? `Scheduled: ${input.scheduledTime}` : '',
            ].filter(Boolean),
          ),
        );
      }
      const res = await svc.findOrCreateDatabaseEntry(
        {
          databaseId: input.databaseId,
          properties,
          filter,
          children: logBlocks,
          updateOnMatch: update,
        },
        auth,
      );
      if (!res.created) {
        await svc.appendBlocks({ blockId: res.page.id, children: logBlocks }, auth);
      }
      return { pageId: res.page.id, created: res.created };
    },
  };
}
