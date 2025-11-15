import { z } from 'zod';
import type { Tool } from '../../types.js';
import type { RunCtx } from '../../../state/types.js';
import { ModuleRef } from '@nestjs/core';
import {
  SimpleSection,
  buildSections,
  getNotionAuthFromCtx,
  getNotionSvc,
  headingBlock,
  paragraphBlock,
  titleProperty,
  upsertPageWithContent,
} from './helpers.js';

const NotionLaunchBriefIn = z
  .object({
    pageId: z.string().optional(),
    databaseId: z.string().optional(),
    parentPageId: z.string().optional(),
    title: z.string().min(1),
    titlePropertyName: z.string().default('Name'),
    launchDate: z.string().optional(),
    goal: z.string().optional(),
    metrics: z.array(z.string()).optional(),
    channels: z.array(z.string()).optional(),
    messaging: z.string().optional(),
    callToAction: z.string().optional(),
    tasks: z.array(z.string()).optional(),
    risks: z.array(z.string()).optional(),
    notes: z.string().optional(),
    properties: z.record(z.string(), z.any()).optional(),
  })
  .refine(
    (val) => Boolean(val.pageId || val.databaseId || val.parentPageId),
    { message: 'Provide pageId or target parent/database' },
  );

const NotionLaunchBriefOut = z.any();

export type NotionLaunchBriefArgs = z.infer<typeof NotionLaunchBriefIn>;
export type NotionLaunchBriefResult = z.infer<typeof NotionLaunchBriefOut>;

export function notionLaunchBriefUpsert(
  moduleRef: ModuleRef,
): Tool<NotionLaunchBriefArgs, NotionLaunchBriefResult> {
  return {
    name: 'notion.launchBrief.upsert',
    description: 'Publish a structured launch brief with goals, channels, CTA, and risks.',
    in: NotionLaunchBriefIn,
    out: NotionLaunchBriefOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '15/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionLaunchBriefIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const sections: SimpleSection[] = [];
      if (input.goal || input.launchDate) {
        const keyValues = [];
        if (input.launchDate) keyValues.push({ label: 'Launch date', value: input.launchDate });
        if (input.goal) keyValues.push({ label: 'Goal', value: input.goal });
        sections.push({ title: 'Overview', keyValues });
      }
      if (input.metrics?.length) {
        sections.push({ title: 'North star metrics', bullets: input.metrics });
      }
      if (input.channels?.length) {
        sections.push({ title: 'Channels', bullets: input.channels });
      }
      if (input.messaging) {
        sections.push({ title: 'Messaging', body: input.messaging });
      }
      if (input.callToAction) {
        sections.push({ title: 'Call to action', body: input.callToAction });
      }
      if (input.tasks?.length) {
        sections.push({ title: 'Tasks', bullets: input.tasks });
      }
      if (input.risks?.length) {
        sections.push({ title: 'Risks', bullets: input.risks });
      }
      if (input.notes) {
        sections.push({ title: 'Notes', body: input.notes });
      }
      const properties =
        input.properties ??
        ({
          [input.titlePropertyName || 'Name']: titleProperty(input.title),
        } as Record<string, any>);
      const children = [
        headingBlock('Launch brief', 1),
        paragraphBlock(input.title),
        ...buildSections(sections),
      ];
      const res = await upsertPageWithContent(svc, auth, {
        pageId: input.pageId,
        databaseId: input.databaseId,
        parentPageId: input.parentPageId,
        properties,
        children,
      });
      return NotionLaunchBriefOut.parse(res);
    },
  };
}
