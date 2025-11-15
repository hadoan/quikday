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

const NotionDailyFounderLogIn = z
  .object({
    pageId: z.string().optional(),
    databaseId: z.string().optional(),
    parentPageId: z.string().optional(),
    dateLabel: z.string().default(new Date().toISOString().slice(0, 10)),
    highlights: z.array(z.string()).optional(),
    meetings: z.array(z.string()).optional(),
    risks: z.array(z.string()).optional(),
    asks: z.array(z.string()).optional(),
    gratitude: z.string().optional(),
    notes: z.string().optional(),
    titlePropertyName: z.string().default('Name'),
    properties: z.record(z.string(), z.any()).optional(),
  })
  .refine((val) => Boolean(val.pageId || val.databaseId || val.parentPageId), {
    message: 'Provide pageId or databaseId/parentPageId',
  });

const NotionDailyFounderLogOut = z.any();

export type NotionDailyFounderLogArgs = z.infer<typeof NotionDailyFounderLogIn>;
export type NotionDailyFounderLogResult = z.infer<typeof NotionDailyFounderLogOut>;

export function notionDailyFounderLogUpdate(
  moduleRef: ModuleRef,
): Tool<NotionDailyFounderLogArgs, NotionDailyFounderLogResult> {
  return {
    name: 'notion.dailyFounderLog.update',
    description: 'Maintain a daily founder log with highlights, meetings, and risks.',
    in: NotionDailyFounderLogIn,
    out: NotionDailyFounderLogOut,
    apps: ['notion-productivity'],
    scopes: [],
    rate: '15/m',
    risk: 'low',
    async call(args, ctx: RunCtx) {
      const input = NotionDailyFounderLogIn.parse(args);
      const svc = getNotionSvc(moduleRef);
      const auth = getNotionAuthFromCtx(ctx);
      const sections: SimpleSection[] = [];
      if (input.highlights?.length) {
        sections.push({ title: 'Highlights', bullets: input.highlights });
      }
      if (input.meetings?.length) {
        sections.push({ title: 'Meetings', bullets: input.meetings });
      }
      if (input.risks?.length) {
        sections.push({ title: 'Risks / blockers', bullets: input.risks });
      }
      if (input.asks?.length) {
        sections.push({ title: 'Asks', bullets: input.asks });
      }
      if (input.gratitude) {
        sections.push({ title: 'Gratitude', body: input.gratitude });
      }
      if (input.notes) {
        sections.push({ title: 'Notes', body: input.notes });
      }
      const properties =
        input.properties ??
        ({
          [input.titlePropertyName || 'Name']: titleProperty(`Founder log ${input.dateLabel}`),
        } as Record<string, any>);
      const children = [
        headingBlock(`Founder log — ${input.dateLabel}`, 1),
        paragraphBlock('Snapshot of the day'),
        ...buildSections(sections),
      ];
      const res = await upsertPageWithContent(svc, auth, {
        pageId: input.pageId,
        databaseId: input.databaseId,
        parentPageId: input.parentPageId,
        properties,
        children,
      });
      return NotionDailyFounderLogOut.parse(res);
    },
  };
}
